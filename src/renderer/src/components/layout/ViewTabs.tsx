import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import type { ViewMode } from '../../types/measurement'

const views: { key: ViewMode; labelKey: string; icon: string; tooltip: { de: string; en: string } }[] = [
  { key: 'front', labelKey: 'views.front', icon: '⊞', tooltip: { de: 'Frontsicht (XY)',      en: 'Front view (XY)' } },
  { key: 'side',  labelKey: 'views.side',  icon: '⊟', tooltip: { de: 'Seitenansicht (ZY)',   en: 'Side view (ZY)' } },
  { key: 'top',   labelKey: 'views.top',   icon: '⊡', tooltip: { de: 'Draufsicht (XZ)',       en: 'Top view (XZ)' } },
  { key: '3d',    labelKey: 'views.3d',    icon: '⊠', tooltip: { de: '3D-Perspektive',        en: '3D Perspective' } },
]

export function ViewTabs() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const viewLayout = useUIStore((s) => s.viewLayout)
  const setViewLayout = useUIStore((s) => s.setViewLayout)

  const isQuad = viewLayout === 'quad'

  return (
    <div className="flex bg-chrome-deep border-b border-chrome-border shrink-0 items-center">
      {!isQuad && views.map((v) => (
        <button
          key={v.key}
          onClick={() => setActiveView(v.key)}
          title={v.tooltip[lang]}
          className={`px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeView === v.key
              ? 'bg-chrome-surface text-chrome-text border-b-2 border-action'
              : 'text-chrome-muted hover:text-chrome-secondary hover:bg-chrome-surface'
          }`}
        >
          <span className="text-[11px] opacity-70">{v.icon}</span>
          {t(v.labelKey)}
        </button>
      ))}
      {isQuad && (
        <span className="px-3 py-1.5 text-xs text-chrome-muted">
          {lang === 'de' ? 'Alle Ansichten' : 'All views'}
        </span>
      )}
      {/* Quad-view toggle — right-aligned */}
      <div className="ml-auto pr-1">
        <button
          onClick={() => setViewLayout(isQuad ? 'single' : 'quad')}
          title={isQuad
            ? (lang === 'de' ? 'Einzelansicht' : 'Single view')
            : (lang === 'de' ? 'Alle 4 Ansichten' : 'All 4 views')}
          className={`h-6 px-2 rounded text-[11px] transition-colors ${
            isQuad
              ? 'bg-action text-action-text'
              : 'text-chrome-muted hover:text-chrome-secondary hover:bg-chrome-surface'
          }`}
        >
          ⊞
        </button>
      </div>
    </div>
  )
}
