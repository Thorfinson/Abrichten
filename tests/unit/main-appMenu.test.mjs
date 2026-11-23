// Guards the macOS application menu (src/main/appMenu.ts): standard roles only,
// so it never adds Electron's Reload / Developer Tools, and no accelerators of
// its own that could take the app's shortcuts (⌘S, ⌘O, ⌘K …) from the page.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { appMenuTemplate } = await import('../../src/main/appMenu.ts')

const items = (template) => template.flatMap((top) => top.submenu).filter((i) => i.type !== 'separator')

test('the menu is the app menu, Edit and Window, built from roles', () => {
  const template = appMenuTemplate(false)
  assert.deepEqual(template.map((top) => top.label), ['Abrichten', 'Edit', 'Window'])
  assert.deepEqual(items(template).map((i) => i.role), [
    'about', 'hide', 'hideOthers', 'unhide', 'quit',
    'undo', 'redo', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'delete', 'selectAll',
    'minimize', 'close'
  ])
})

test('no item brings an accelerator or a click handler of its own', () => {
  for (const german of [false, true]) {
    for (const item of items(appMenuTemplate(german))) {
      assert.equal(item.accelerator, undefined, item.role)
      assert.equal(item.click, undefined, item.role)
    }
  }
})

test('labels follow the system language like the unsaved-changes dialog', () => {
  const de = appMenuTemplate(true)
  assert.deepEqual(de.map((top) => top.label), ['Abrichten', 'Bearbeiten', 'Fenster'])
  const byRole = Object.fromEntries(items(de).map((i) => [i.role, i.label]))
  assert.equal(byRole.quit, 'Abrichten beenden')
  assert.equal(byRole.paste, 'Einsetzen')
  assert.equal(byRole.undo, 'Widerrufen')
})
