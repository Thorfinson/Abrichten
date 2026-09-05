import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, deselectAll, setView, getBoard, getUI,
  boardCentre, projectToCanvas, dragCanvas, fitView, findBoardIdByName,
  findHandleWorld
} from './helpers'

/**
 * Regression: dragging a board (or a gizmo handle) in an ortho view used to
 * also run the MarqueeSelect rubber-band invisibly — on pointerup every board
 * inside the drag rectangle got selected, replacing the dragged board's
 * selection. Fixed by stopping the NATIVE pointerdown propagation in
 * Board3D / TranslateHandles3D / FaceHandles3D / ResizeHandles3D /
 * RotationHandle3D so the marquee never starts.
 */
test.describe('Ortho drag keeps selection on the dragged board', () => {
  test('direct board drag across other boards does not marquee-select them', async ({ page }) => {
    await bootWithSample(page)
    const targetId = await findBoardIdByName(page, 'Rückwand')

    await setView(page, 'front')
    await deselectAll(page)
    await fitView(page)
    await page.waitForTimeout(300)

    const centre = await boardCentre(page, targetId)
    const centrePixel = await projectToCanvas(page, centre)

    // Long drag across the whole cabinet — the old bug would select every
    // board whose AABB overlaps this rectangle.
    const start = { x: centrePixel.x + 120, y: centrePixel.y - 80 }
    const end = { x: start.x + 250, y: start.y + 200 }
    await dragCanvas(page, start, end)

    const ui = await getUI(page)
    expect(ui.selectedBoardIds).toEqual([targetId])
  })

  test('translate-arrow drag does not marquee-select boards under the drag rect', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const targetId = await findBoardIdByName(page, 'Rückwand')

    await setView(page, 'front')
    await selectBoard(page, assemblyId, targetId)
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, targetId)
    const centre = await boardCentre(page, targetId)
    const arrowWorld = await findHandleWorld(page, centre, 'x', 1, 'cylinder')
    const arrowPixel = await projectToCanvas(page, arrowWorld)

    // Diagonal drag so the implied marquee rectangle covers other boards
    await dragCanvas(page, arrowPixel, { x: arrowPixel.x + 200, y: arrowPixel.y + 150 })

    const after = await getBoard(page, targetId)
    expect(after.position.x).toBeGreaterThan(before.position.x + 5)

    const ui = await getUI(page)
    expect(ui.selectedBoardIds).toEqual([targetId])
  })
})
