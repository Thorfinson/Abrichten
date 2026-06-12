import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, deselectAll, setView, getBoard,
  boardCentre, projectToCanvas, dragCanvas, fitView, findBoardIdByName
} from './helpers'

test.describe('Direct board drag in ortho view', () => {
  test('Click-and-drag on a board surface moves position in the view plane', async ({ page }) => {
    // Use the back panel (Rückwand) — it is the widest board and we can click
    // an offset position that's clear of any selection-gizmo overlay.
    const { assemblyId } = await bootWithSample(page)
    const targetId = await findBoardIdByName(page, 'Rückwand')

    await setView(page, 'front')
    await deselectAll(page) // no gizmos render while nothing is selected
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, targetId)
    const centre = await boardCentre(page, targetId)
    const centrePixel = await projectToCanvas(page, centre)

    // Click 120 px right and 80 px above the centre — comfortably inside this
    // 564 × 702 panel (so we land on its mesh) and far from any gizmo handle.
    const start = { x: centrePixel.x + 120, y: centrePixel.y - 80 }
    const end = { x: start.x + 180, y: start.y - 100 }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, targetId)
    // World +x is screen +x, world +y is screen -y in front view
    expect(after.position.x).toBeGreaterThan(before.position.x + 5)
    expect(after.position.y).toBeGreaterThan(before.position.y + 5)
    // The perpendicular axis (z in front view) is untouched
    expect(after.position.z).toBe(before.position.z)
    // Dims unchanged
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)

    // Board is now selected as a side effect of clicking on it
    const selected = await page.evaluate(() => window.__uiStore.getState().selectedBoardIds)
    expect(selected).toContain(targetId)
  })
})
