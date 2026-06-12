import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, setView, setMode, fitView,
  dragCanvas, getCameraInfo, boardCentre, projectToCanvas
} from './helpers'

// Specifically targets: middle-click / right-click on TC gizmo handles in
// 3D view. Three.js TransformControls fires its mouseDown for any button
// (because the picker captures), and the handler disables OrbitControls.
// If the user expected the camera to rotate, the camera stops — exactly
// matching the user-reported "stops after a very short time" symptom.

test.describe('Camera controls hit gizmos directly', () => {
  test('3D middle-click directly on TC gizmo: OrbitControls still rotates afterwards', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, '3d')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const centre = await boardCentre(page, firstBoardId)
    const centrePx = await projectToCanvas(page, centre)

    // First do a middle-click drag that STARTS on the board centre (which
    // is also where the TC gizmo sits). We expect the camera to rotate even
    // though the pointer-down was on a TC handle.
    const before = await getCameraInfo(page)
    await dragCanvas(page, centrePx, { x: centrePx.x + 300, y: centrePx.y + 150 }, 40, 'middle')

    const after = await getCameraInfo(page)
    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
                + Math.abs(after.position.z - before.position.z)
    expect(moved).toBeGreaterThan(20)
  })

  test('3D right-click directly on TC gizmo: OrbitControls still pans', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, '3d')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const centre = await boardCentre(page, firstBoardId)
    const centrePx = await projectToCanvas(page, centre)

    const before = await getCameraInfo(page)
    await dragCanvas(page, centrePx, { x: centrePx.x + 250, y: centrePx.y + 100 }, 30, 'right')

    const after = await getCameraInfo(page)
    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
                + Math.abs(after.position.z - before.position.z)
    expect(moved).toBeGreaterThan(10)
  })

  test('After interrupted middle-click on gizmo, subsequent OrbitControls still works', async ({ page }) => {
    // Even if the first middle-click is blocked, doing it again should work.
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, '3d')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const centre = await boardCentre(page, firstBoardId)
    const centrePx = await projectToCanvas(page, centre)

    // Try once — may or may not work
    await dragCanvas(page, centrePx, { x: centrePx.x + 50, y: centrePx.y + 50 }, 5, 'middle')
    await page.waitForTimeout(150)

    // Now drag clearly off-gizmo and assert camera moves
    const before = await getCameraInfo(page)
    const corner = { x: 100, y: 100 }
    await dragCanvas(page, corner, { x: corner.x + 300, y: corner.y + 200 }, 30, 'middle')
    const after = await getCameraInfo(page)
    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
                + Math.abs(after.position.z - before.position.z)
    expect(moved).toBeGreaterThan(30)
  })
})
