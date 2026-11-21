import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import type { ViewMode } from '../../types/measurement'
import { Icon } from './Icon'
import { keyCombo } from '../../utils/shortcutKeys'

const views: { key: ViewMode; labelKey: string; shortcut: string; axes: string }[] = [
  { key: 'front', labelKey: 'views.front', shortcut: keyCombo('1', ['alt']), axes: 'XY' },
  { key: 'side',  labelKey: 'views.side',  shortcut: keyCombo('2', ['alt']), axes: 'ZY' },
  { key: 'top',   labelKey: 'views.top',   shortcut: keyCombo('3', ['alt']), axes: 'XZ' },
  { key: '3d',    labelKey: 'views.3d',    shortcut: keyCombo('4', ['alt']), axes: '' },
]

export function ViewTabs() {
  const { t } = useTranslation()
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const viewLayout = useUIStore((s) => s.viewLayout)
  const setViewLayout = useUIStore((s) => s.setViewLayout)

  const isQuad = viewLayout === 'quad'
  const quadLabel = isQuad ? t('layout.views.single') : t('layout.views.quad')

  return (
    <div className="flex h-8 bg-chrome-deep border-b border-chrome-border shrink-0 items-stretch">
      {!isQuad && (
        <div role="tablist" aria-label={t('layout.views.label')} className="flex items-stretch">
          {views.map((v) => {
            const active = activeView === v.key
            const label = t(v.labelKey)
            return (
              <button
                key={v.key}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveView(v.key)}
                title={`${label}${v.axes ? ` (${v.axes})` : ''} · ${v.shortcut}`}
                className={`px-4 text-xs font-medium transition-colors border-b-2 ${
                  active
                    ? 'bg-chrome-bg text-chrome-text border-action-hover'
                    : 'text-chrome-muted border-transparent hover:text-chrome-text hover:bg-chrome-bg/60'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
      {isQuad && (
        <span className="px-3 flex items-center text-xs text-chrome-muted">
          {t('layout.views.all')}
        </span>
      )}
      {/* Quad-view toggle — right-aligned */}
      <div className="ml-auto pr-1.5 flex items-center">
        <button
          onClick={() => setViewLayout(isQuad ? 'single' : 'quad')}
          title={quadLabel}
          aria-label={t('layout.views.quad')}
          aria-pressed={isQuad}
          className={`h-6 flex items-center gap-1.5 px-2 rounded text-[11px] transition-colors ${
            isQuad
              ? 'bg-action text-action-text'
              : 'text-chrome-muted hover:text-chrome-text hover:bg-chrome-surface'
          }`}
        >
          <Icon name="quad" className="w-3.5 h-3.5" />
          <span>{t('layout.views.quadShort')}</span>
        </button>
      </div>
    </div>
  )
}
