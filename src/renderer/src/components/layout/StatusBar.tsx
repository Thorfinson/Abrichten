import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { SNAP_SIZES } from './layoutRules'
import { SwitchTrack } from './Switch'
import { Icon, type IconName } from './Icon'

// ── Toast (floating pill above the status bar) — export results and messages ──

export function SaveToast() {
  const exportStatus = useUIStore((s) => s.exportStatus)
  if (!exportStatus) return null

  return (
    <div
      role="status"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40
        bg-chrome-deep border border-chrome-border rounded-full
        px-3 py-1 text-[11px] text-chrome-text shadow-lg pointer-events-none"
    >
      {exportStatus}
    </div>
  )
}

// ── Status bar ────────────────────────────────────────────────────────────────

const UNITS = ['mm', 'cm', 'm'] as const

function Divider() {
  return <div className="w-px h-4 bg-chrome-border shrink-0" />
}

/** Labelled on/off switch for the status bar */
function StatusSwitch({ on, onClick, label, title, icon }: {
  on: boolean; onClick: () => void; label: string; title: string; icon: IconName
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      title={title}
      className={`h-6 flex items-center gap-1.5 px-1.5 rounded transition-colors hover:bg-chrome-surface ${
        on ? 'text-chrome-text' : 'text-chrome-muted hover:text-chrome-secondary'
      }`}
    >
      <Icon name={icon} className={`w-3.5 h-3.5 ${on ? 'text-accent' : ''}`} />
      <span className="text-[11px] font-medium">{label}</span>
      <SwitchTrack on={on} />
    </button>
  )
}

interface StatusBarProps {
  /**
   * Unsaved-changes slot: true shows the "unsaved changes" marker. Wire it to
   * the project store's dirty tracking (`project !== savedProject`); leave it
   * undefined until then.
   */
  unsaved?: boolean
}

export function StatusBar({ unsaved }: StatusBarProps = {}) {
  const { t } = useTranslation()

  const displayUnit    = useProjectStore((s) => s.project.displayUnit)
  const setDisplayUnit = useProjectStore((s) => s.setDisplayUnit)

  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const snapSize    = useUIStore((s) => s.snapSize)
  const toggleSnap  = useUIStore((s) => s.toggleSnap)
  const setSnapSize = useUIStore((s) => s.setSnapSize)
  const showGrid    = useUIStore((s) => s.showGrid)
  const toggleGrid  = useUIStore((s) => s.toggleGrid)
  const saveStatus  = useUIStore((s) => s.saveStatus)

  const hoveredWorldPos = useUIStore((s) => s.hoveredWorldPos)
  const activeView      = useUIStore((s) => s.activeView)

  // Any other size (set elsewhere) stays selectable
  const sizes: number[] = (SNAP_SIZES as readonly number[]).includes(snapSize)
    ? [...SNAP_SIZES]
    : [...SNAP_SIZES, snapSize].sort((a, b) => a - b)

  return (
    <footer
      aria-label={t('layout.status.label')}
      className="h-7 bg-chrome-deep border-t border-chrome-border text-chrome-secondary flex items-center px-2 gap-2 shrink-0 select-none"
    >
      {/* Snap: on/off + grid size. Picking a size also turns snapping on. */}
      <div className="flex items-center gap-1">
        <StatusSwitch
          on={snapEnabled}
          onClick={toggleSnap}
          label={t('layout.status.snap')}
          title={t('layout.status.snapTitle')}
          icon="magnet"
        />
        <select
          value={snapSize}
          onChange={(e) => {
            setSnapSize(Number(e.target.value))
            if (!snapEnabled) toggleSnap()
          }}
          aria-label={t('layout.status.snapSize')}
          title={t('layout.status.snapSize')}
          className={`h-5 pl-1 pr-0.5 rounded border border-chrome-border bg-chrome-bg font-mono text-[11px] outline-none focus-visible:border-action-hover ${
            snapEnabled ? 'text-chrome-text' : 'text-chrome-muted'
          }`}
        >
          {sizes.map((s) => (
            <option key={s} value={s} className="bg-chrome-bg text-chrome-text">{s} mm</option>
          ))}
        </select>
      </div>

      <Divider />

      <StatusSwitch
        on={showGrid}
        onClick={toggleGrid}
        label={t('layout.status.grid')}
        title={t('layout.status.gridTitle')}
        icon="grid"
      />

      <Divider />

      {/* Display unit */}
      <div className="flex items-center gap-1.5">
        <span id="status-unit-label" className="text-[11px] text-chrome-muted">{t('layout.status.unit')}</span>
        <div role="radiogroup" aria-labelledby="status-unit-label" className="flex rounded border border-chrome-border overflow-hidden">
          {UNITS.map((u) => (
            <button
              key={u}
              role="radio"
              aria-checked={displayUnit === u}
              onClick={() => setDisplayUnit(u)}
              className={`h-5 px-2 font-mono text-[11px] transition-colors ${
                displayUnit === u
                  ? 'bg-chrome-surface text-chrome-text'
                  : 'text-chrome-muted hover:text-chrome-text hover:bg-chrome-bg'
              }`}
            >
              {t(`units.${u}`)}
            </button>
          ))}
        </div>
      </div>

      <Divider />

      {/* World position under the cursor */}
      <span className="font-mono text-[11px] text-chrome-muted tabular-nums whitespace-nowrap" title={t('layout.status.cursor')}>
        {hoveredWorldPos ? (
          <>
            X {Math.round(hoveredWorldPos.x)}&ensp;Y {Math.round(hoveredWorldPos.y)}
            {activeView !== 'top' && <>&ensp;Z {Math.round(hoveredWorldPos.z)}</>}
          </>
        ) : '—'}
      </span>

      {/* Right side: unsaved-changes slot, then the auto-save state */}
      <div className="ml-auto flex items-center gap-3 text-[11px]" aria-live="polite">
        {unsaved && (
          <span className="flex items-center gap-1.5 text-accent" title={t('layout.status.unsavedTitle')}>
            <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
            {t('layout.status.unsaved')}
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-success" title={t('layout.status.savedTitle')}>{t('layout.status.saved')}</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-danger" title={t('layout.status.saveFailedTitle')}>{t('layout.status.saveFailed')}</span>
        )}
      </div>
    </footer>
  )
}
