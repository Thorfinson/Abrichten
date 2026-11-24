import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useDialogFocus } from '../../hooks/useKeyboard'
import { ALT_KEY, CMD_KEY } from '../../utils/canvasInput'
import { keyCombo } from '../../utils/shortcutKeys'

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <kbd className="font-mono text-[10px] bg-chrome-surface border border-chrome-border px-1.5 py-0.5 rounded text-chrome-secondary shrink-0 min-w-[64px] text-center">
        {keys}
      </kbd>
      <span className="text-xs text-chrome-secondary">{label}</span>
    </div>
  )
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="text-[10px] font-bold text-chrome-muted uppercase tracking-widest mt-3 mb-1 first:mt-0">
      {label}
    </div>
  )
}

/**
 * Full-screen shortcut reference overlay. Toggled by the `?` key.
 * Every entry mirrors a handler in hooks/useKeyboard.ts (Ctrl+K: CommandPalette);
 * mouse and trackpad gestures mirror CameraController / utils/canvasInput.
 * Ctrl / Alt read ⌘ / ⌥ on macOS (utils/shortcutKeys).
 */
export function ShortcutsOverlay() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const de = lang === 'de'

  const show    = useUIStore((s) => s.showShortcutsOverlay)
  const setShow = useUIStore((s) => s.setShowShortcutsOverlay)
  // Esc and ? close it via the global keyboard handler (useKeyboard)
  const dialogRef = useDialogFocus<HTMLDivElement>(show)

  if (!show) return null

  const del = de ? 'Entf' : 'Del'

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onMouseDown={() => setShow(false)}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        className="relative w-full max-w-[880px] max-h-full overflow-y-auto bg-chrome-bg text-chrome-text border border-chrome-border rounded-lg shadow-2xl px-6 py-5 outline-none"
      >
        <h2 id="shortcuts-title" className="text-sm font-semibold text-chrome-text mb-4">
          {de ? 'Tastaturkürzel' : 'Keyboard Shortcuts'}
        </h2>

        <div className="grid grid-cols-3 gap-x-8">
          <div>
            <GroupHeader label={de ? 'Allgemein' : 'General'} />
            <ShortcutRow keys="F"          label={de ? 'Ansicht einpassen' : 'Fit view'} />
            <ShortcutRow keys="S"          label={de ? 'Einrasten (Snap) ein/aus' : 'Snapping on/off'} />
            <ShortcutRow keys={keyCombo('G', ['alt'])} label={de ? 'Raster ein/aus' : 'Grid on/off'} />
            <ShortcutRow keys="B"          label={de ? 'Baugruppen-Leiste' : 'Assembly tree'} />
            <ShortcutRow keys={keyCombo('K', ['cmd'])} label={de ? 'Befehlspalette' : 'Command palette'} />
            <ShortcutRow keys="?"          label={de ? 'Dieses Fenster' : 'This overlay'} />
            <ShortcutRow keys="Esc"        label={de ? 'Aufheben / Abbrechen' : 'Deselect / cancel'} />
            <ShortcutRow keys="+ / −"      label={t('ui.labelSize')} />

            <GroupHeader label={de ? 'Datei' : 'File'} />
            <ShortcutRow keys={keyCombo('O', ['cmd'])} label={de ? 'Projekt öffnen' : 'Open project'} />
            <ShortcutRow keys={keyCombo('S', ['cmd'])} label={de ? 'Speichern' : 'Save'} />
            <ShortcutRow keys={keyCombo('Z', ['cmd'])} label={de ? 'Rückgängig' : 'Undo'} />
            <ShortcutRow keys={keyCombo('Z', ['cmd', 'shift'])} label={`${de ? 'Wiederholen (auch' : 'Redo (also'} ${keyCombo('Y', ['cmd'])})`} />
          </div>

          <div>
            <GroupHeader label={de ? 'Bauteil gewählt' : 'Board selected'} />
            <ShortcutRow keys="G"          label={de ? 'Verschieben' : 'Move (translate)'} />
            <ShortcutRow keys="R"          label={de ? 'Drehen' : 'Rotate'} />
            <ShortcutRow keys="T"          label={de ? 'Skalieren (Pfeile ändern die Größe)' : 'Scale (arrows resize)'} />
            <ShortcutRow keys="↑↓←→"       label={de ? 'Verschieben um 1 mm' : 'Nudge by 1 mm'} />
            <ShortcutRow keys="⇧+↑↓←→"     label={de ? 'Verschieben um 10 mm' : 'Nudge by 10 mm'} />
            <ShortcutRow keys="D"          label={de ? 'Duplizieren' : 'Duplicate'} />
            <ShortcutRow keys={del}        label={de ? 'Löschen' : 'Delete'} />
            <ShortcutRow keys="J"          label={de ? 'Verbinden (2 Teile)' : 'Join (2 boards)'} />
            <ShortcutRow keys={keyCombo('A', ['cmd'])} label={de ? 'Ganze Baugruppe wählen' : 'Select the whole assembly'} />
            <ShortcutRow keys="⇧+F10"      label={t('ui.boardMenu')} />
          </div>

          <div>
            <GroupHeader label={de ? 'Werkzeuge & Ansichten' : 'Tools & Views'} />
            <ShortcutRow keys="1 / 2"      label={`${t('tools.select')} / ${t('tools.measure')}`} />
            <ShortcutRow keys="3 / 4"      label={`${t('tools.angle')} / ${t('tools.area')}`} />
            <ShortcutRow keys={keyCombo('1', ['alt'])} label={t('views.front')} />
            <ShortcutRow keys={keyCombo('2', ['alt'])} label={t('views.side')} />
            <ShortcutRow keys={keyCombo('3', ['alt'])} label={t('views.top')} />
            <ShortcutRow keys={keyCombo('4', ['alt'])} label={t('views.3d')} />
            <ShortcutRow keys={keyCombo('1', ['cmd'])} label={`${t('workspace.label')}: ${t('workspace.design')}`} />
            <ShortcutRow keys={keyCombo('2', ['cmd'])} label={`${t('workspace.label')}: ${t('workspace.assembly')}`} />

            <GroupHeader label={de ? 'Maus' : 'Mouse'} />
            <ShortcutRow keys={de ? 'Rad' : 'Wheel'}        label="Zoom" />
            <ShortcutRow keys={de ? 'Rechts' : 'Right'}     label={de ? 'Ziehen: Ansicht schieben' : 'Drag: pan'} />
            <ShortcutRow keys={de ? 'Mitte' : 'Middle'}     label={de ? 'Ziehen: 3D drehen (2D: schieben)' : 'Drag: orbit 3D (2D: pan)'} />
            <ShortcutRow keys={`${CMD_KEY}+${de ? 'Klick' : 'click'}`} label={de ? 'Mehrfachauswahl' : 'Add to selection'} />

            <GroupHeader label={t('input.trackpad')} />
            <ShortcutRow keys={t('input.twoFinger')}                     label={t('input.pan')} />
            <ShortcutRow keys={t('input.pinch')}                         label={t('input.zoomToPointer')} />
            <ShortcutRow keys={`${CMD_KEY} + ${t('input.twoFinger')}`}   label="Zoom" />
            <ShortcutRow keys={`${ALT_KEY} + ${t('input.twoFinger')}`}   label={t('input.orbit3d')} />
            <ShortcutRow keys={`${ALT_KEY} + ${t('input.drag')}`}        label={t('input.orbit3dPan2d')} />
            <ShortcutRow keys={`⇧${ALT_KEY} + ${t('input.drag')}`}       label={t('input.pan')} />
            <p className="mt-1 text-[10px] text-chrome-hint">{t('input.settingHint')}</p>
          </div>
        </div>

        <p className="mt-5 text-[11px] text-chrome-hint text-center">
          {de
            ? 'Drücke ? oder Esc zum Schließen'
            : 'Press ? or Esc to close'}
        </p>
      </div>
    </div>
  )
}
