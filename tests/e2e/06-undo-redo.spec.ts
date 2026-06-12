import { test, expect } from '@playwright/test'
import { bootWithSample, selectBoard, getBoard } from './helpers'

test.describe('Undo / Redo', () => {
  test('Ctrl+Z reverts the most recent mutation, Ctrl+Y restores it', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, firstBoardId)

    const initial = await getBoard(page, firstBoardId)

    // Mutate 1: move position
    await page.evaluate(({ a, b }) => {
      window.__projectStore.getState().updateBoard(a, b, { position: { x: 200, y: 100, z: 50 } })
    }, { a: assemblyId, b: firstBoardId })
    expect((await getBoard(page, firstBoardId)).position.x).toBe(200)

    // Mutate 2: dim
    await page.evaluate(({ a, b }) => {
      window.__projectStore.getState().updateBoard(a, b, { width: 999 })
    }, { a: assemblyId, b: firstBoardId })
    expect((await getBoard(page, firstBoardId)).width).toBe(999)

    // Mutate 3: rot
    await page.evaluate(({ a, b }) => {
      window.__projectStore.getState().updateBoard(a, b, { rotation: { x: 0, y: 0, z: 45 } })
    }, { a: assemblyId, b: firstBoardId })
    expect((await getBoard(page, firstBoardId)).rotation.z).toBe(45)

    // Ctrl+Z three times — focus document first
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(80)

    const undone = await getBoard(page, firstBoardId)
    expect(undone.position.x).toBe(initial.position.x)
    expect(undone.width).toBe(initial.width)
    expect(undone.rotation.z).toBe(initial.rotation.z)

    // Redo with Ctrl+Y restores the first change forward (position update)
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(80)
    const redone = await getBoard(page, firstBoardId)
    expect(redone.position.x).toBe(200)
  })
})
