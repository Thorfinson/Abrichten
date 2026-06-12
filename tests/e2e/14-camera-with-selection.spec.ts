import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, setView, setMode, fitView, canvasRect,
  dragCanvas, getCameraInfo, deselectAll
} from './helpers'

// Edge case: even when a board is selected (so TransformControls is mounted
// in 3D view, or gizmo arrows / cubes are visible in ortho views), camera
// controls must still work continuously. Hypothesis behind the user's
// "stops after a short time" report: TC or gizmo pickers steal the
// pointerdown for middle/right buttons and disable OrbitControls or otherwise
// prevent the camera from panning/rotating.

test.describe('Camera controls work even with a selection and gizmos visible', () => {
  test('3D view + selected board + translate gizmo: middle-click rotates camera', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, '3d')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    // Drag from an empty-canvas area (corner) so we don't hit the TC gizmo
    const start = { x: rect.x + 100, y: rect.y + 100 }
    const end = { x: start.x + 250, y: start.y + 150 }

    const before = await getCameraInfo(page)
    await dragCanvas(page, start, end, 35, 'middle')
    const after = await getCameraInfo(page)

    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
                + Math.abs(after.position.z - before.position.z)
    expect(moved).toBeGreaterThan(20)
  })

  test('3D view + selected board: right-click pans camera', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, '3d')
    await selectBoard(page, assemblyId, firstBoardId)
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    const start = { x: rect.x + 100, y: rect.y + 100 }
    const end = { x: start.x + 200, y: start.y + 100 }

    const before = await getCameraInfo(page)
    await dragCanvas(page, start, end, 25, 'right')
    const after = await getCameraInfo(page)

    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
                + Math.abs(after.position.z - before.position.z)
    expect(moved).toBeGreaterThan(5)
  })

  test('FRONT view + scale mode (resize cubes visible): right-click still pans', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'scale')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    // Start at a corner away from the board / gizmos
    const start = { x: rect.x + 80, y: rect.y + 80 }
    const end = { x: start.x + 250, y: start.y + 150 }

    const before = await getCameraInfo(page)
    await dragCanvas(page, start, end, 30, 'right')
    const after = await getCameraInfo(page)

    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
    expect(moved).toBeGreaterThan(50)
  })

  test('FRONT view + rotate mode (rings visible): middle-click still pans', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'rotate')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    const start = { x: rect.x + 80, y: rect.y + 80 }
    const end = { x: start.x + 250, y: start.y + 150 }

    const before = await getCameraInfo(page)
    await dragCanvas(page, start, end, 30, 'middle')
    const after = await getCameraInfo(page)

    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
    expect(moved).toBeGreaterThan(50)
  })

  test('After a gizmo drag, camera pan still works (no leftover transformLock)', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    // Do a gizmo drag first
    const rect = await canvasRect(page)
    const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    await dragCanvas(page, start, { x: start.x + 50, y: start.y }, 5, 'left')
    await page.waitForTimeout(150)

    // Then a camera pan
    const before = await getCameraInfo(page)
    const corner = { x: rect.x + 80, y: rect.y + 80 }
    await dragCanvas(page, corner, { x: corner.x + 200, y: corner.y + 100 }, 25, 'right')
    const after = await getCameraInfo(page)

    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
    expect(moved).toBeGreaterThan(30)
  })

  test('Camera pan after deselect works without lingering state', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(200)
    await deselectAll(page)
    await page.waitForTimeout(100)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const before = await getCameraInfo(page)
    await dragCanvas(page, { x: cx, y: cy }, { x: cx + 250, y: cy + 150 }, 30, 'middle')
    const after = await getCameraInfo(page)
    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
    expect(moved).toBeGreaterThan(50)
  })
})
