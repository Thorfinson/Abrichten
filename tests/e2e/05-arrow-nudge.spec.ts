import { test, expect } from '@playwright/test'
import { bootWithSample, selectBoard, setView, setMode, getBoard } from './helpers'

test.describe('Arrow-key nudge (CAD-style step transforms)', () => {
  test('G mode: ArrowRight increases x, Shift+ArrowRight by 10mm', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

    const before = await getBoard(page, firstBoardId)

    await page.keyboard.press('ArrowRight')
    const after1 = await getBoard(page, firstBoardId)
    expect(after1.position.x).toBe(before.position.x + 1)

    await page.keyboard.press('Shift+ArrowRight')
    const after2 = await getBoard(page, firstBoardId)
    expect(after2.position.x).toBe(after1.position.x + 10)

    await page.keyboard.press('ArrowUp')
    const after3 = await getBoard(page, firstBoardId)
    expect(after3.position.y).toBe(after2.position.y + 1)
  })

  test('T mode: ArrowRight grows width (front view), ArrowUp grows height', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'scale')
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

    const before = await getBoard(page, firstBoardId)

    await page.keyboard.press('Shift+ArrowRight')
    const after1 = await getBoard(page, firstBoardId)
    expect(after1.width).toBe(before.width + 10)
    expect(after1.height).toBe(before.height)
    expect(after1.depth).toBe(before.depth)

    await page.keyboard.press('Shift+ArrowUp')
    const after2 = await getBoard(page, firstBoardId)
    expect(after2.height).toBe(before.height + 10)
    expect(after2.width).toBe(after1.width)
  })

  test('T mode in SIDE view: ArrowRight grows depth (not width)', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'side')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'scale')
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

    const before = await getBoard(page, firstBoardId)
    await page.keyboard.press('Shift+ArrowRight')
    const after = await getBoard(page, firstBoardId)
    expect(after.depth).toBe(before.depth + 10)
    expect(after.width).toBe(before.width)
  })
})
