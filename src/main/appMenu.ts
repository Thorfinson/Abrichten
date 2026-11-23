import type { MenuItemConstructorOptions } from 'electron'

/**
 * The macOS application menu. Windows and Linux get none (src/main/index.ts).
 *
 * macOS always has a menu bar, and Menu.setApplicationMenu(null) does not empty
 * it: Electron's default menu stays, with View › Reload (⌘R), Toggle Developer
 * Tools (⌥⌘I) and zoom. This one replaces it with standard roles only:
 *
 * - the app menu: hide (⌘H), quit (⌘Q)
 * - Edit: copy, paste … in text fields — macOS hands ⌘C, ⌘V, ⌘Z there to the
 *   menu, not to the field
 * - Window: minimize (⌘M), close (⌘W)
 *
 * A menu shortcut fires only for a key the page leaves alone (no preventDefault).
 * ⌘Z, ⇧⌘Z and ⌘A outside a text field are the app's undo, redo and select all
 * (hooks/useKeyboard.ts). Give no item an accelerator of the app's own
 * shortcuts — ⌘S, ⌘O, ⌘K, ⌘D: a menu item would take the key from the page
 * whenever the page does not handle it, e.g. under a dialog.
 */
export function appMenuTemplate(german: boolean, name = 'Abrichten'): MenuItemConstructorOptions[] {
  const t = (de: string, en: string): string => (german ? de : en)
  return [
    {
      label: name,
      submenu: [
        { role: 'about', label: t(`Über ${name}`, `About ${name}`) },
        { type: 'separator' },
        { role: 'hide', label: t(`${name} ausblenden`, `Hide ${name}`) },
        { role: 'hideOthers', label: t('Andere ausblenden', 'Hide Others') },
        { role: 'unhide', label: t('Alle einblenden', 'Show All') },
        { type: 'separator' },
        { role: 'quit', label: t(`${name} beenden`, `Quit ${name}`) }
      ]
    },
    {
      label: t('Bearbeiten', 'Edit'),
      submenu: [
        { role: 'undo', label: t('Widerrufen', 'Undo') },
        { role: 'redo', label: t('Wiederholen', 'Redo') },
        { type: 'separator' },
        { role: 'cut', label: t('Ausschneiden', 'Cut') },
        { role: 'copy', label: t('Kopieren', 'Copy') },
        { role: 'paste', label: t('Einsetzen', 'Paste') },
        { role: 'pasteAndMatchStyle', label: t('Einsetzen und Stil anpassen', 'Paste and Match Style') },
        { role: 'delete', label: t('Löschen', 'Delete') },
        { role: 'selectAll', label: t('Alles auswählen', 'Select All') }
      ]
    },
    {
      label: t('Fenster', 'Window'),
      submenu: [
        { role: 'minimize', label: t('Im Dock ablegen', 'Minimize') },
        { role: 'close', label: t('Fenster schließen', 'Close Window') }
      ]
    }
  ]
}
