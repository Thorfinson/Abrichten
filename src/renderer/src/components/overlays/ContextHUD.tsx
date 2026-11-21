import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { Icon } from '../layout/Icon'
import { isHudAutoCompact } from '../layout/layoutRules'
import { IS_MAC } from '../../utils/canvasInput'

function LedPill({
  label, active, warn, onClick
}: {
  label: string
  active: boolean
  warn?: boolean
  onClick: () => void
}) {
  return (
    <button
      role="switch"
      aria-checked={active}
      onClick={onClick}
      className={`h-5 flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold uppercase tracking-wide cursor-pointer transition-colors ${
        active
          ? 'bg-success-dim text-success-text hover:bg-success/40'
          : warn
            ? 'text-danger hover:bg-danger-dim/60'
            : 'text-chrome-muted hover:text-chrome-text hover:bg-chrome-surface'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-success' : warn ? 'bg-danger' : 'border border-chrome-hint'}`}
      />
      {label}
    </button>
  )
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-[3px]">
      <kbd className="font-mono text-[10px] bg-chrome-surface px-1.5 py-0.5 rounded min-w-[32px] text-center text-chrome-secondary leading-none shrink-0">
        {keys}
      </kbd>
      <span className="text-chrome-muted text-[11px] leading-none">{label}</span>
    </div>
  )
}

/**
 * HUD card anchored to the bottom-left of the canvas: overlay toggle LEDs and
 * context-sensitive keyboard shortcut hints. The shortcut list folds away —
 * the user's choice is remembered; in the quad layout and on narrow canvases
 * it starts folded (expandable until the layout changes again).
 */
export function ContextHUD() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const showStaticOverlay      = useUIStore((s) => s.showStaticOverlay)
  const toggleStaticOverlay    = useUIStore((s) => s.toggleStaticOverlay)
  const showCollisionOverlay   = useUIStore((s) => s.showCollisionOverlay)
  const toggleCollisionOverlay = useUIStore((s) => s.toggleCollisionOverlay)
  const showJointMarkers       = useUIStore((s) => s.showJointMarkers)
  const toggleJointMarkers     = useUIStore((s) => s.toggleJointMarkers)
  const collisionPairs         = useUIStore((s) => s.collisionPairs)
  const selectedBoardIds       = useUIStore((s) => s.selectedBoardIds)
  const viewLayout             = useUIStore((s) => s.viewLayout)
  const hudCollapsed           = useUIStore((s) => s.hudCollapsed)
  const setHudCollapsed        = useUIStore((s) => s.setHudCollapsed)

  // Width of the canvas area the HUD floats in
  const rootRef = useRef<HTMLDivElement>(null)
  const [areaWidth, setAreaWidth] = useState(Number.POSITIVE_INFINITY)
  useEffect(() => {
    const area = rootRef.current?.parentElement
    if (!area) return
    const observer = new ResizeObserver(([entry]) => setAreaWidth(entry.contentRect.width))
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  const autoCompact = isHudAutoCompact(areaWidth, viewLayout)
  // While auto-compact, "expand" only peeks; it folds again when the layout changes
  const [peek, setPeek] = useState(false)
  useEffect(() => setPeek(false), [autoCompact])
  const expanded = autoCompact ? peek : !hudCollapsed
  const toggleExpanded = () => (autoCompact ? setPeek(!peek) : setHudCollapsed(!hudCollapsed))

  const context = selectedBoardIds.length === 2 ? 'two'
                : selectedBoardIds.length === 1  ? 'one'
                : selectedBoardIds.length > 2    ? 'many'
                : 'none'

  const del = lang === 'de' ? 'Entf' : 'Del'
  const rows: [string, string][] = context === 'none' ? [
    ['F',      lang === 'de' ? 'Ansicht einpassen' : 'Fit view'],
    ['1–4',    lang === 'de' ? 'Werkzeug wählen'   : 'Pick a tool'],
    [IS_MAC ? '⌘K' : 'Ctrl K', lang === 'de' ? 'Alle Werkzeuge'    : 'All tools'],
    ['B',      lang === 'de' ? 'Baugruppen'        : 'Assembly tree'],
    ['?',      lang === 'de' ? 'Alle Kürzel'       : 'All shortcuts'],
  ] : context === 'one' ? [
    ['G',    lang === 'de' ? 'Verschieben'      : 'Move'],
    ['R',    lang === 'de' ? 'Drehen'           : 'Rotate'],
    ['T',    lang === 'de' ? 'Skalieren'        : 'Scale'],
    ['↑↓←→', lang === 'de' ? 'Pfeile: 1 mm (⇧ 10 mm)' : 'Arrows: 1 mm (⇧ 10 mm)'],
    ['D',    lang === 'de' ? 'Duplizieren'      : 'Duplicate'],
    [del,    lang === 'de' ? 'Löschen'          : 'Delete'],
  ] : context === 'two' ? [
    ['J',    lang === 'de' ? 'Verbinden'        : 'Join boards'],
    ['G',    lang === 'de' ? 'Verschieben'      : 'Move'],
    ['T',    lang === 'de' ? 'Skalieren'        : 'Scale'],
    ['D',    lang === 'de' ? 'Duplizieren'      : 'Duplicate'],
    [del,    lang === 'de' ? 'Löschen'          : 'Delete'],
  ] : [
    ['G',    lang === 'de' ? 'Verschieben'      : 'Move'],
    ['T',    lang === 'de' ? 'Skalieren'        : 'Scale'],
    ['D',    lang === 'de' ? 'Alle duplizieren' : 'Duplicate all'],
    [del,    lang === 'de' ? 'Alle löschen'     : 'Delete all'],
    ['Esc',  lang === 'de' ? 'Aufheben'         : 'Deselect'],
  ]

  return (
    <div
      ref={rootRef}
      data-testid="context-hud"
      data-expanded={expanded}
      className="absolute bottom-3 left-3 z-30 select-none pointer-events-auto rounded-lg border border-chrome-border shadow-lg bg-chrome-bg/95 text-chrome-text overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Overlay toggles + fold button */}
      <div className="flex items-center gap-0.5 px-1.5 py-1.5">
        <LedPill
          label={lang === 'de' ? 'Statik' : 'Static'}
          active={showStaticOverlay}
          onClick={toggleStaticOverlay}
        />
        <LedPill
          label={lang === 'de' ? 'Kollision' : 'Collision'}
          active={showCollisionOverlay}
          warn={!showCollisionOverlay && collisionPairs.length > 0}
          onClick={toggleCollisionOverlay}
        />
        <LedPill
          label={lang === 'de' ? 'Verbindungen' : 'Joints'}
          active={showJointMarkers}
          onClick={toggleJointMarkers}
        />
        <button
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? t('layout.hud.collapse') : t('layout.hud.expand')}
          title={expanded ? t('layout.hud.collapse') : t('layout.hud.expand')}
          className="ml-0.5 w-5 h-5 flex items-center justify-center rounded text-chrome-muted hover:text-chrome-text hover:bg-chrome-surface transition-colors"
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronUp'} className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Contextual shortcuts */}
      {expanded && (
        <div className="py-1.5 border-t border-chrome-border">
          {rows.map(([keys, label]) => (
            <ShortcutRow key={keys} keys={keys} label={label} />
          ))}
        </div>
      )}
    </div>
  )
}
