import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'

// ── Save toast (floating pill, above status bar) ──────────────────────────────

export function SaveToast() {
  const saveStatus   = useUIStore((s) => s.saveStatus)
  const exportStatus = useUIStore((s) => s.exportStatus)
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const msg = exportStatus
    ?? (saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? `⚠ ${lang === 'de' ? 'Speichern fehlgeschlagen' : 'Save failed'}` : null)

  if (!msg) return null

  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40
      bg-chrome-deep border border-chrome-border rounded-full
      px-3 py-1 text-[11px] font-mono shadow-lg pointer-events-none
      ${saveStatus === 'error' ? 'text-danger' : 'text-success'}`}>
      {msg}
    </div>
  )
}

// ── Status bar ────────────────────────────────────────────────────────────────

export function StatusBar() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const project        = useProjectStore((s) => s.project)
  const setDisplayUnit = useProjectStore((s) => s.setDisplayUnit)

  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const snapSize    = useUIStore((s) => s.snapSize)
  const toggleSnap  = useUIStore((s) => s.toggleSnap)
  const setSnapSize = useUIStore((s) => s.setSnapSize)
  const showGrid    = useUIStore((s) => s.showGrid)
  const toggleGrid  = useUIStore((s) => s.toggleGrid)

  const hoveredWorldPos = useUIStore((s) => s.hoveredWorldPos)
  const activeView      = useUIStore((s) => s.activeView)

  // Snap size cycling
  const SNAP_SIZES = [1, 5, 10, 25, 50, 100]
  const cycleSnap = (dir: 1 | -1) => {
    const idx = SNAP_SIZES.indexOf(snapSize)
    const next = SNAP_SIZES[(idx + dir + SNAP_SIZES.length) % SNAP_SIZES.length]
    setSnapSize(next)
    if (!snapEnabled) toggleSnap()
  }

  // Unit cycling
  const UNITS = ['mm', 'cm', 'm'] as const
  const cycleUnit = () => {
    const idx = UNITS.indexOf(project.displayUnit)
    setDisplayUnit(UNITS[(idx + 1) % UNITS.length])
  }

  return (
    <div className="h-6 bg-chrome-deep border-t border-chrome-border flex items-center px-3 gap-3 shrink-0 select-none">

      {/* Snap stepper */}
      <div className={`flex items-center rounded border transition-colors ${
        snapEnabled ? 'border-accent' : 'border-chrome-border'
      }`}>
        <button
          onClick={() => cycleSnap(-1)}
          className={`w-5 h-4 flex items-center justify-center text-[11px] leading-none rounded-l transition-colors ${
            snapEnabled
              ? 'text-accent-text hover:bg-accent-dim'
              : 'text-chrome-muted hover:text-chrome-secondary hover:bg-chrome-surface'
          }`}
        >−</button>
        <button
          onClick={toggleSnap}
          title={lang === 'de' ? 'Raster ein/aus (S)' : 'Toggle snap (S)'}
          className={`px-1.5 h-4 font-mono text-[10px] leading-none transition-colors ${
            snapEnabled
              ? 'text-accent-text bg-accent-dim'
              : 'text-chrome-secondary hover:text-chrome-text'
          }`}
        >
          {snapSize}mm
        </button>
        <button
          onClick={() => cycleSnap(1)}
          className={`w-5 h-4 flex items-center justify-center text-[11px] leading-none rounded-r transition-colors ${
            snapEnabled
              ? 'text-accent-text hover:bg-accent-dim'
              : 'text-chrome-muted hover:text-chrome-secondary hover:bg-chrome-surface'
          }`}
        >+</button>
      </div>

      {/* Grid toggle */}
      <button
        onClick={toggleGrid}
        title={lang === 'de' ? 'Raster anzeigen (Alt+G)' : 'Toggle grid (Alt+G)'}
        className={`h-4 w-5 flex items-center justify-center rounded text-[11px] transition-colors ${
          showGrid
            ? 'text-accent-text bg-accent-dim'
            : 'text-chrome-muted hover:text-chrome-secondary hover:bg-chrome-surface'
        }`}
      >⊞</button>

      {/* Unit cycler */}
      <button
        onClick={cycleUnit}
        title={lang === 'de' ? 'Einheit wechseln' : 'Cycle unit'}
        className="h-4 px-1.5 rounded font-mono text-[10px] text-chrome-secondary hover:text-chrome-text hover:bg-chrome-surface transition-colors flex items-center gap-0.5"
      >
        {project.displayUnit}
        <span className="text-chrome-hint text-[8px]">▸</span>
      </button>

      {/* Separator */}
      <div className="w-px h-3 bg-chrome-divider shrink-0" />

      {/* World position readout */}
      {hoveredWorldPos && (
        <span className="font-mono text-[10px] text-chrome-hint">
          X{Math.round(hoveredWorldPos.x)}&thinsp;Y{Math.round(hoveredWorldPos.y)}
          {activeView !== 'top' && <>&thinsp;Z{Math.round(hoveredWorldPos.z)}</>}
        </span>
      )}

    </div>
  )
}
