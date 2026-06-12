import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <kbd className="font-mono text-[10px] bg-chrome-surface border border-chrome-border px-1.5 py-0.5 rounded text-chrome-muted shrink-0 min-w-[56px] text-center">
        {keys}
      </kbd>
      <span className="text-xs text-chrome-secondary">{label}</span>
    </div>
  )
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-bold text-chrome-muted uppercase tracking-widest mt-3 mb-1 first:mt-0">
      {label}
    </div>
  )
}

/**
 * Full-screen shortcut reference overlay. Toggled by the `?` key.
 */
export function ShortcutsOverlay() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const show    = useUIStore((s) => s.showShortcutsOverlay)
  const setShow = useUIStore((s) => s.setShowShortcutsOverlay)

  // Close on Escape
  useEffect(() => {
    if (!show) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setShow(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [show, setShow])

  if (!show) return null

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onMouseDown={() => setShow(false)}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-[580px] bg-chrome-deep border border-chrome-border rounded-xl shadow-2xl p-6">
        <h2 className="text-sm font-semibold text-chrome-text mb-4">
          {lang === 'de' ? 'Tastaturkürzel' : 'Keyboard Shortcuts'}
        </h2>

        <div className="grid grid-cols-2 gap-x-8">
          {/* Left column */}
          <div>
            <GroupHeader label={lang === 'de' ? 'Allgemein' : 'General'} />
            <ShortcutRow keys="F"          label={lang === 'de' ? 'Ansicht einpassen' : 'Fit view'} />
            <ShortcutRow keys="S"          label={lang === 'de' ? 'Raster ein/aus'    : 'Toggle snap'} />
            <ShortcutRow keys="B"          label={lang === 'de' ? 'Baumansicht'       : 'Assembly tree'} />
            <ShortcutRow keys="Ctrl+K"     label={lang === 'de' ? 'Befehlspalette'    : 'Command palette'} />
            <ShortcutRow keys="?"          label={lang === 'de' ? 'Dieses Fenster'    : 'This overlay'} />
            <ShortcutRow keys="Esc"        label={lang === 'de' ? 'Aufheben / Abbruch': 'Deselect / cancel'} />

            <GroupHeader label={lang === 'de' ? 'Datei' : 'File'} />
            <ShortcutRow keys="Ctrl+O"     label={lang === 'de' ? 'Projekt öffnen'    : 'Open project'} />
            <ShortcutRow keys="Ctrl+S"     label={lang === 'de' ? 'Speichern'         : 'Save'} />
            <ShortcutRow keys="Ctrl+Z"     label={lang === 'de' ? 'Rückgängig'        : 'Undo'} />
            <ShortcutRow keys="Ctrl+⇧+Z"   label={lang === 'de' ? 'Wiederholen'       : 'Redo'} />
          </div>

          {/* Right column */}
          <div>
            <GroupHeader label={lang === 'de' ? 'Bauteil gewählt' : 'Board selected'} />
            <ShortcutRow keys="D"          label={lang === 'de' ? 'Duplizieren'       : 'Duplicate'} />
            <ShortcutRow keys="Del"        label={lang === 'de' ? 'Löschen'           : 'Delete'} />
            <ShortcutRow keys="G"          label={lang === 'de' ? 'Verschieben'       : 'Move (translate)'} />
            <ShortcutRow keys="R"          label={lang === 'de' ? 'Drehen'            : 'Rotate'} />
            <ShortcutRow keys="T"          label={lang === 'de' ? 'Skalieren (Pfeile)': 'Scale (arrows)'} />
            <ShortcutRow keys="J"          label={lang === 'de' ? 'Verbinden (2 Teile)': 'Join (2 boards)'} />

            <GroupHeader label={lang === 'de' ? 'Werkzeuge & Ansichten' : 'Tools & Views'} />
            <ShortcutRow keys="1–4"        label={lang === 'de' ? 'Werkzeug wählen'   : 'Select tool'} />
            <ShortcutRow keys="Alt+1"      label={lang === 'de' ? 'Vorderansicht'     : 'Front view'} />
            <ShortcutRow keys="Alt+2"      label={lang === 'de' ? 'Seitenansicht'     : 'Side view'} />
            <ShortcutRow keys="Alt+3"      label={lang === 'de' ? 'Draufsicht'        : 'Top view'} />
            <ShortcutRow keys="Alt+4"      label={lang === 'de' ? '3D-Ansicht'        : '3D view'} />
            <ShortcutRow keys="↑↓←→"       label={lang === 'de' ? 'Bauteil verschieben' : 'Nudge board'} />
            <ShortcutRow keys="⇧+↑↓←→"    label={lang === 'de' ? 'Grob verschieben'  : 'Nudge ×10'} />
          </div>
        </div>

        <p className="mt-5 text-[10px] text-chrome-hint text-center">
          {lang === 'de'
            ? 'Drücke ? oder Esc zum Schließen'
            : 'Press ? or Esc to close'}
        </p>
      </div>
    </div>
  )
}
