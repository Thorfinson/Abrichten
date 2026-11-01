import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import type { ToolMode } from '../../types/measurement'
import { Icon, type IconName } from '../layout/Icon'

const TOOLS: { key: ToolMode; labelKey: string; icon: IconName; shortcut: string }[] = [
  { key: 'select',  labelKey: 'tools.select',  icon: 'select',  shortcut: '1' },
  { key: 'measure', labelKey: 'tools.measure', icon: 'measure', shortcut: '2' },
  { key: 'angle',   labelKey: 'tools.angle',   icon: 'angle',   shortcut: '3' },
  { key: 'area',    labelKey: 'tools.area',    icon: 'area',    shortcut: '4' }
]

/**
 * Vertical tool strip at the canvas' left edge: select, measure, angle, area
 * (keys 1–4). Floats over the canvas like the HUD and the properties card.
 */
export function ToolStrip() {
  const { t } = useTranslation()
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('layout.tools.title')}
      className="absolute top-3 left-3 z-30 flex flex-col gap-0.5 p-1 rounded-lg border border-chrome-border bg-chrome-bg/95 shadow-lg select-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TOOLS.map((tool) => {
        const active = activeTool === tool.key
        const label = t(tool.labelKey)
        return (
          <button
            key={tool.key}
            onClick={() => setActiveTool(tool.key)}
            title={t('layout.tools.hint', { tool: label, key: tool.shortcut })}
            aria-label={label}
            aria-pressed={active}
            className={`relative w-8 h-8 flex items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-action-hover ${
              active
                ? 'bg-action text-action-text shadow-inner'
                : 'text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text'
            }`}
          >
            <Icon name={tool.icon} className="w-[18px] h-[18px]" />
            <span
              aria-hidden="true"
              className={`absolute bottom-0 right-0.5 font-mono text-[8px] leading-none ${active ? 'text-action-text/80' : 'text-chrome-hint'}`}
            >
              {tool.shortcut}
            </span>
          </button>
        )
      })}
    </div>
  )
}
