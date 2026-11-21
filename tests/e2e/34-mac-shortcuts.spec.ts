import { test, expect, type Page } from '@playwright/test'
import { bootWithSample, getBoard } from './helpers'

/**
 * Keyboard shortcuts on macOS (hooks/useKeyboard.ts, utils/shortcutKeys.ts).
 * There is no application menu, so nothing but useKeyboard turns ⌘S / ⌘Z
 * into save / undo. On a Mac ⌘ works like Ctrl (Ctrl still works, see
 * 06-undo-redo); elsewhere metaKey is the Windows key and does nothing.
 * Option changes the typed character on macOS (⌥1 → "¡", ⌥G → "©"), so the
 * Alt shortcuts go by the physical key (e.code).
 *
 * The platform is pinned per test (navigator.platform), so this runs the
 * same on a Mac, Linux or Windows runner.
 */

async function pretendPlatform(page: Page, platform: string): Promise<void> {
  await page.addInitScript((p) => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => p, configurable: true })
  }, platform)
}

async function blurAll(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
}

/** A keydown the way macOS sends it with Option held: e.key is the typed character. */
async function optionKey(page: Page, key: string, code: string): Promise<void> {
  await page.evaluate(({ key, code }) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, altKey: true, bubbles: true, cancelable: true }))
  }, { key, code })
}

const ui = <T>(page: Page, pick: (s: any) => T): Promise<T> =>
  page.evaluate(`(${pick.toString()})(window.__uiStore.getState())`) as Promise<T>

test.describe('macOS shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await pretendPlatform(page, 'MacIntel')
  })

  test('⌘Z undoes, ⇧⌘Z redoes, ⌘S saves, ⌘O opens — none toggles a plain-letter shortcut', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    const initialWidth = (await getBoard(page, firstBoardId)).width
    await page.evaluate(({ a, b }) => {
      window.__projectStore.getState().updateBoard(a, b, { width: 999 })
    }, { a: assemblyId, b: firstBoardId })
    await blurAll(page)

    await page.keyboard.press('Meta+z')
    expect((await getBoard(page, firstBoardId)).width).toBe(initialWidth)
    await page.keyboard.press('Meta+Shift+z')
    expect((await getBoard(page, firstBoardId)).width).toBe(999)
    await page.keyboard.press('Meta+z')
    await page.keyboard.press('Meta+y')
    expect((await getBoard(page, firstBoardId)).width).toBe(999)

    // ⌘S saves (the browser build downloads the file) and leaves snapping as it was
    const snapBefore = await ui(page, (s) => s.snapEnabled)
    const download = page.waitForEvent('download')
    await page.keyboard.press('Meta+s')
    expect((await download).suggestedFilename()).toMatch(/\.abrichten\.json$/)
    expect(await ui(page, (s) => s.snapEnabled)).toBe(snapBefore)

    // ⌘O asks for a file (nothing unsaved after the save, so no confirm first)
    await page.evaluate(() => {
      const w = window as any
      w.__openCalls = 0
      w.electronAPI = { ...w.electronAPI, fileOpen: async () => { w.__openCalls++; return null } }
    })
    await page.keyboard.press('Meta+o')
    await expect.poll(() => page.evaluate(() => (window as any).__openCalls)).toBe(1)

    // ⌘A selects the whole assembly
    await page.evaluate(({ a, b }) => window.__uiStore.getState().selectBoard(a, b), { a: assemblyId, b: firstBoardId })
    const boardCount = await page.evaluate(() => window.__projectStore.getState().project.assemblies[0].boards.length)
    await page.keyboard.press('Meta+a')
    expect(await ui(page, (s) => s.selectedBoardIds.length)).toBe(boardCount)

    // ⌘ + a plain-letter shortcut does nothing: R, F, J, T, B stay off
    const before = await ui(page, (s) => ({ mode: s.transformMode, drawer: s.showAssemblyDrawer, tool: s.activeTool }))
    for (const key of ['Meta+r', 'Meta+t', 'Meta+b', 'Meta+2']) await page.keyboard.press(key)
    expect(await ui(page, (s) => ({ mode: s.transformMode, drawer: s.showAssemblyDrawer, tool: s.activeTool }))).toEqual(before)
  })

  test('⌥1–⌥4 switch the view and ⌥G the grid, although Option types "¡" / "©"', async ({ page }) => {
    await bootWithSample(page)
    await blurAll(page)

    for (const [key, code, view] of [
      ['¡', 'Digit1', 'front'], ['™', 'Digit2', 'side'], ['£', 'Digit3', 'top'], ['¢', 'Digit4', '3d']
    ] as const) {
      await optionKey(page, key, code)
      expect(await ui(page, (s) => s.activeView), `${code} → ${view}`).toBe(view)
    }

    await page.evaluate(() => window.__uiStore.getState().setTransformMode('rotate'))
    const grid = await ui(page, (s) => s.showGrid)
    await optionKey(page, '©', 'KeyG')
    expect(await ui(page, (s) => s.showGrid)).toBe(!grid)
    expect(await ui(page, (s) => s.transformMode), '⌥G is not G (move)').toBe('rotate')
  })

  test('the shortcut overlay names ⌘ and ⌥', async ({ page }) => {
    await bootWithSample(page)
    await blurAll(page)
    await page.keyboard.press('?')
    const dialog = page.getByRole('dialog', { name: /Tastaturkürzel|Keyboard Shortcuts/ })
    for (const label of ['⌘S', '⌘Z', '⇧⌘Z', '⌘K', '⌥G', '⌥1']) {
      await expect(dialog.getByText(label, { exact: true }), label).toBeVisible()
    }
    await expect(dialog.getByText('Ctrl+S', { exact: true })).toHaveCount(0)
  })
})

test.describe('Windows / Linux shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await pretendPlatform(page, 'Win32')
  })

  test('the Windows key is no Ctrl, and the overlay names Ctrl and Alt', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    const initialWidth = (await getBoard(page, firstBoardId)).width
    await page.evaluate(({ a, b }) => {
      window.__projectStore.getState().updateBoard(a, b, { width: 999 })
    }, { a: assemblyId, b: firstBoardId })
    await blurAll(page)

    await page.keyboard.press('Meta+z')
    expect((await getBoard(page, firstBoardId)).width).toBe(999)
    await page.keyboard.press('Control+z')
    expect((await getBoard(page, firstBoardId)).width).toBe(initialWidth)
    await page.keyboard.press('Control+Shift+z')
    expect((await getBoard(page, firstBoardId)).width).toBe(999)

    // Alt+digit by physical key as well
    await optionKey(page, '2', 'Digit2')
    expect(await ui(page, (s) => s.activeView)).toBe('side')

    await page.keyboard.press('?')
    const dialog = page.getByRole('dialog', { name: /Tastaturkürzel|Keyboard Shortcuts/ })
    for (const label of ['Ctrl+S', 'Ctrl+⇧+Z', 'Alt+G', 'Alt+1']) {
      await expect(dialog.getByText(label, { exact: true }), label).toBeVisible()
    }
  })
})
