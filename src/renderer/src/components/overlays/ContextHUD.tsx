import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'

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
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide cursor-pointer transition-colors ${
        active
          ? 'bg-success/70 text-white'
          : warn
            ? 'text-danger/90 hover:bg-white/10'
            : 'text-white/35 hover:text-white/70 hover:bg-white/8'
      }`}
    >
      {warn && !active ? '⚠ ' : active ? '● ' : '○ '}{label}
    </button>
  )
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-[3px]">
      <kbd className="font-mono text-[9px] bg-white/10 px-1.5 py-0.5 rounded min-w-[28px] text-center text-white/70 leading-none shrink-0">
        {keys}
      </kbd>
      <span className="text-white/55 text-[10px] leading-none">{label}</span>
    </div>
  )
}

/**
 * Always-visible HUD card anchored to the bottom-left of the canvas.
 * Shows overlay toggle LEDs and context-sensitive keyboard shortcut hints.
 */
export function ContextHUD() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const showStaticOverlay      = useUIStore((s) => s.showStaticOverlay)
  const toggleStaticOverlay    = useUIStore((s) => s.toggleStaticOverlay)
  const showCollisionOverlay   = useUIStore((s) => s.showCollisionOverlay)
  const toggleCollisionOverlay = useUIStore((s) => s.toggleCollisionOverlay)
  const showJointMarkers       = useUIStore((s) => s.showJointMarkers)
  const toggleJointMarkers     = useUIStore((s) => s.toggleJointMarkers)
  const staticWarningCount     = useUIStore((s) => s.staticWarningCount)
  const collisionPairs         = useUIStore((s) => s.collisionPairs)
  const selectedBoardIds       = useUIStore((s) => s.selectedBoardIds)

  const context = selectedBoardIds.length === 2 ? 'two'
                : selectedBoardIds.length === 1  ? 'one'
                : selectedBoardIds.length > 2    ? 'many'
                : 'none'

  const rows: [string, string][] = context === 'none' ? [
    ['F',   lang === 'de' ? 'Ansicht einpassen' : 'Fit view'],
    ['⌘K',  lang === 'de' ? 'Alle Werkzeuge'   : 'All tools'],
    ['B',   lang === 'de' ? 'Baumansicht'       : 'Assembly tree'],
    ['?',   lang === 'de' ? 'Alle Kürzel'       : 'All shortcuts'],
  ] : context === 'one' ? [
    ['G',   lang === 'de' ? 'Verschieben'      : 'Move'],
    ['R',   lang === 'de' ? 'Drehen'           : 'Rotate'],
    ['T',   lang === 'de' ? 'Skalieren'        : 'Scale'],
    ['↑↓←→',lang === 'de' ? 'Pfeile: 1 mm / 1°' : 'Arrows: 1 mm / 1°'],
    ['D',   lang === 'de' ? 'Duplizieren'      : 'Duplicate'],
    ['Del', lang === 'de' ? 'Löschen'          : 'Delete'],
  ] : context === 'two' ? [
    ['J',   lang === 'de' ? 'Verbinden'        : 'Join boards'],
    ['G',   lang === 'de' ? 'Verschieben'      : 'Move'],
    ['T',   lang === 'de' ? 'Skalieren'        : 'Scale'],
    ['D',   lang === 'de' ? 'Duplizieren'      : 'Duplicate'],
    ['Del', lang === 'de' ? 'Löschen'          : 'Delete'],
  ] : [
    ['G',   lang === 'de' ? 'Verschieben'      : 'Move'],
    ['T',   lang === 'de' ? 'Skalieren'        : 'Scale'],
    ['D',   lang === 'de' ? 'Alle duplizieren' : 'Duplicate all'],
    ['Del', lang === 'de' ? 'Alle löschen'     : 'Delete all'],
    ['Esc', lang === 'de' ? 'Aufheben'         : 'Deselect'],
  ]

  return (
    <div
      className="absolute bottom-4 left-4 z-30 select-none pointer-events-auto rounded-xl border border-white/8 shadow-lg bg-gray-900/75 backdrop-blur-sm text-white/80 overflow-hidden min-w-[155px]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Overlay toggle pills */}
      <div className="flex flex-wrap gap-1 px-2.5 pt-2 pb-1.5 border-b border-white/8">
        <LedPill
          label={lang === 'de' ? 'Statik' : 'Static'}
          active={showStaticOverlay}
          warn={!showStaticOverlay && staticWarningCount > 0}
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
      </div>

      {/* Contextual shortcuts */}
      <div className="py-1.5">
        {rows.map(([keys, label]) => (
          <ShortcutRow key={keys} keys={keys} label={label} />
        ))}
      </div>
    </div>
  )
}
