import { test, expect, Page } from '@playwright/test'
import {
  bootWithSample, setView, deselectAll, fitView, getBoard, projectToCanvas, dragCanvas,
  selectBoard, findHandleWorld, boardCentre
} from './helpers'

/**
 * Face snapping: a board dragged close to another (within ~8 px) lands exactly
 * against it — in the direct ortho drag and with the translate arrows. Alt
 * turns snapping off.
 */

/** A 100 mm cube right of the sample cabinet (whose right side ends at x = 600). */
async function addCube(page: Page): Promise<string> {
  return page.evaluate(() => window.__projectStore.getState().addBoard('asm-1', {
    name: 'Klotz', width: 100, height: 100, depth: 100, materialId: 'buche', color: '#D4A574',
    position: { x: 700, y: 100, z: 0 }, rotation: { x: 0, y: 0, z: 0 }
  }) as string)
}

/** Screen pixels per mm along world x in the active ortho view. */
async function pxPerMm(page: Page): Promise<number> {
  const a = await projectToCanvas(page, { x: 0, y: 150, z: 50 })
  const b = await projectToCanvas(page, { x: 100, y: 150, z: 50 })
  return (b.x - a.x) / 100
}

test.describe('Snapping to other boards', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await deselectAll(page)
  })

  test('a direct board drag ending 3 px off the side panel touches it exactly', async ({ page }) => {
    const id = await addCube(page)
    await fitView(page)
    await page.waitForTimeout(300)
    const scale = await pxPerMm(page)
    const start = await projectToCanvas(page, { x: 750, y: 150, z: 50 })
    // left face from x = 700 to 3 px right of x = 600
    const dx = (600 - 700) * scale + 3
    await dragCanvas(page, start, { x: start.x + dx, y: start.y })
    const b = await getBoard(page, id)
    expect(b.position.x).toBe(600)
    expect(b.position.y).toBe(100)
  })

  test('holding Alt keeps the board where it was dropped', async ({ page }) => {
    const id = await addCube(page)
    await fitView(page)
    await page.waitForTimeout(300)
    const scale = await pxPerMm(page)
    const start = await projectToCanvas(page, { x: 750, y: 150, z: 50 })
    const dx = (600 - 700) * scale + 3
    await page.keyboard.down('Alt')
    await dragCanvas(page, start, { x: start.x + dx, y: start.y })
    await page.keyboard.up('Alt')
    const b = await getBoard(page, id)
    expect(b.position.x).toBeGreaterThan(600)
    expect(b.position.x).toBeLessThan(600 + 6 / scale + 1)
  })

  test('far from any face the drag is not pulled', async ({ page }) => {
    const id = await addCube(page)
    await fitView(page)
    await page.waitForTimeout(300)
    const scale = await pxPerMm(page)
    const start = await projectToCanvas(page, { x: 750, y: 150, z: 50 })
    const dx = (600 - 700) * scale + 40   // 40 px short of the side panel
    await dragCanvas(page, start, { x: start.x + dx, y: start.y })
    const b = await getBoard(page, id)
    expect(b.position.x).toBeGreaterThan(600 + 30 / scale)
  })

  test('the translate arrow snaps the face onto the side panel too', async ({ page }) => {
    const id = await addCube(page)
    await selectBoard(page, 'asm-1', id)
    await fitView(page)
    await page.waitForTimeout(300)
    const scale = await pxPerMm(page)
    const centre = await boardCentre(page, id)
    const arrow = await findHandleWorld(page, centre, 'x', -1, 'cylinder')
    const from = await projectToCanvas(page, arrow)
    const dx = (600 - 700) * scale + 3
    await dragCanvas(page, from, { x: from.x + dx, y: from.y })
    const b = await getBoard(page, id)
    expect(b.position.x).toBe(600)
    expect(b.position.y).toBe(100)
    // the snap indicator is gone after the drag
    expect(await page.evaluate(() => window.__uiStore.getState().snapIndicatorPos)).toBeNull()
  })
})
