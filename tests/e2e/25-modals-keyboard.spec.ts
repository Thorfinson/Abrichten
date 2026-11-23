import { test, expect } from '@playwright/test'
import { bootWithSample, selectBoard, getBoard, getUI } from './helpers'

/**
 * Keyboard behaviour around modals, the context menu and the command palette:
 * global shortcuts pause behind a modal, Esc closes the topmost thing only,
 * dialogs take focus and give it back.
 */

const boardCount = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => window.__projectStore.getState().project.assemblies.flatMap((a: any) => a.boards).length)

test.describe('Modals and keyboard', () => {
  test('behind an open panel global shortcuts are off; Esc closes the panel and keeps the selection', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, 'b-links')
    const before = await getBoard(page, 'b-links')
    const ui0 = await page.evaluate(() => {
      const s = window.__uiStore.getState()
      return { snap: s.snapEnabled, drawer: s.showAssemblyDrawer, view: s.activeView }
    })
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

    for (const key of ['ArrowRight', 'Delete', 's', '2', 'b', 'd', 'Alt+3']) await page.keyboard.press(key)

    expect(await getBoard(page, 'b-links')).toEqual(before)
    expect(await boardCount(page)).toBe(6)
    const ui = await page.evaluate(() => {
      const s = window.__uiStore.getState()
      return { snap: s.snapEnabled, drawer: s.showAssemblyDrawer, tool: s.activeTool, view: s.activeView, list: s.showCuttingList }
    })
    // Alt+3 must not switch the view (the sample opens in 3D)
    expect(ui).toEqual({ snap: ui0.snap, drawer: ui0.drawer, tool: 'select', view: ui0.view, list: true })

    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => window.__uiStore.getState().showCuttingList)).toBe(false)
    expect((await getUI(page)).selectedBoardIds).toEqual(['b-links'])
    // no modal any more: Esc deselects again
    await page.keyboard.press('Escape')
    expect((await getUI(page)).selectedBoardIds).toEqual([])
  })

  test('joint dialog: J opens it with focus inside, Esc closes it for good and keeps the selection', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.setState({ selectedAssemblyId: 'asm-1', selectedBoardIds: ['b-links', 'b-boden'] }))
    await page.keyboard.press('j')
    const dialog = page.getByRole('dialog', { name: /Verbindung hinzufügen|Add Joint/ })
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)

    // Esc works from a form field inside the dialog too
    await dialog.getByRole('combobox').focus()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    const s = await page.evaluate(() => {
      const u = window.__uiStore.getState()
      return { open: u.showJointDialog, sel: u.selectedBoardIds }
    })
    expect(s).toEqual({ open: false, sel: ['b-links', 'b-boden'] })
  })

  test('joint dialog does not pop up again after its selection went away', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.setState({ selectedAssemblyId: 'asm-1', selectedBoardIds: ['b-links', 'b-boden'] }))
    await page.keyboard.press('j')
    await page.evaluate(() => window.__uiStore.getState().deselectAll())
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => window.__uiStore.getState().showJointDialog)).toBe(false)
    await selectBoardViaStore(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('context menu: Shift+F10 opens it focused, arrows move, Enter runs, Esc closes without deselecting', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, 'b-links')
    await page.keyboard.press('Shift+F10')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const items = menu.getByRole('menuitem')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(items.nth(1)).toBeFocused()
    await page.keyboard.press('End')
    await expect(items.last()).toBeFocused()
    await page.keyboard.press('ArrowDown') // wraps
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    expect((await getUI(page)).selectedBoardIds).toEqual(['b-links'])

    await page.keyboard.press('Shift+F10')
    await page.keyboard.press('Enter') // Duplicate
    await expect(menu).toBeHidden()
    expect(await boardCount(page)).toBe(7)
  })

  test('context menu stays inside the window and opens with the Move submenu collapsed', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__projectStore.getState().addAssembly('Zweite'))
    const vp = page.viewportSize()!
    const open = (x: number, y: number) => page.evaluate(({ x, y }) =>
      window.__uiStore.getState().setContextMenu({ x, y, boardId: 'b-links', assemblyId: 'asm-1' }), { x, y })

    await open(vp.width - 3, vp.height - 3)
    const box = (await page.getByRole('menu').boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height)

    await page.getByRole('menuitem', { name: /In Baugruppe verschieben|Move to Assembly/ }).click()
    await expect(page.getByRole('menu')).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await open(200, 200)
    await expect(page.getByRole('menu')).toHaveCount(1)
  })

  test('command palette: dialog roles, AI command once a key is set, backdrop click keeps the selection', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    // the key is configured after the app started
    await page.evaluate(() => localStorage.setItem('abrichten-settings', JSON.stringify({ apiKey: 'k', modelId: 'm' })))
    await selectBoard(page, assemblyId, 'b-links')

    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog', { name: /Befehlspalette|Command palette/ })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('combobox')).toBeFocused()
    const ai = page.getByRole('option', { name: /KI-Assistent|AI Assistant/ })
    await expect(ai).toBeVisible()

    // the AI toggle reads the current state each time
    await ai.click()
    expect(await page.evaluate(() => window.__uiStore.getState().showChatPanel)).toBe(true)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Control+k')
    await page.getByRole('option', { name: /KI-Assistent|AI Assistant/ }).click()
    expect(await page.evaluate(() => window.__uiStore.getState().showChatPanel)).toBe(false)

    await page.keyboard.press('Control+k')
    await expect(dialog).toBeVisible()
    await page.mouse.click(5, 400) // backdrop
    await expect(dialog).toBeHidden()
    expect((await getUI(page)).selectedBoardIds).toEqual(['b-links'])
  })

  test('closing a dialog gives focus back to the button that opened it', async ({ page }) => {
    await bootWithSample(page)
    const gear = page.getByTitle(/^(Einstellungen|Settings)$/)
    await gear.click()
    await expect(page.getByRole('dialog', { name: /Einstellungen|Settings/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(gear).toBeFocused()
  })

  test('outside a text field Ctrl/⌘+Z, ⇧Z and A stay the app\'s, also behind a dialog; in a field the browser\'s', async ({ page }) => {
    // The page sees a key first. The browser's own undo and select all — on macOS
    // the Edit menu (src/main/appMenu.ts) — act only on keys the page leaves alone;
    // behind a dialog, ⌘Z would undo a text field that no longer has focus.
    const { assemblyId } = await bootWithSample(page)
    await page.evaluate(() => {
      document.body.append(Object.assign(document.createElement('input'), { id: 'probe' }))
      const w = window as unknown as { __prevented: boolean[] }
      w.__prevented = []
      // registered after the app's own handler, so it sees its verdict
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.length === 1) w.__prevented.push(e.defaultPrevented)
      })
    })
    const prevented = async (): Promise<boolean[]> => {
      await page.evaluate(() => { (window as unknown as { __prevented: boolean[] }).__prevented = [] })
      for (const key of ['ControlOrMeta+z', 'ControlOrMeta+Shift+z', 'ControlOrMeta+a']) await page.keyboard.press(key)
      return page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented)
    }
    await selectBoard(page, assemblyId, 'b-links')
    const before = await getBoard(page, 'b-links')

    await page.evaluate(() => window.__uiStore.getState().setShowShortcutsOverlay(true))
    expect(await prevented()).toEqual([true, true, true])
    expect(await getBoard(page, 'b-links')).toEqual(before)
    expect((await getUI(page)).selectedBoardIds).toEqual(['b-links'])

    await page.keyboard.press('Escape')
    await page.locator('#probe').focus()
    expect(await prevented()).toEqual([false, false, false])
  })

  test('plain D duplicates the selected board', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, 'b-links')
    await page.keyboard.press('d')
    expect(await boardCount(page)).toBe(7)
    const sel = (await getUI(page)).selectedBoardIds
    expect(sel).toHaveLength(1)
    expect(sel[0]).not.toBe('b-links')
  })
})

async function selectBoardViaStore(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => window.__uiStore.setState({ selectedAssemblyId: 'asm-1', selectedBoardIds: ['b-links', 'b-boden'] }))
  await page.waitForTimeout(100)
}
