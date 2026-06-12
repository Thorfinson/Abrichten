import { test, expect } from '@playwright/test'
import {
  bootWithSample, setView, fitView, canvasRect, dragCanvas,
  getCameraInfo, wheelOverCanvas
} from './helpers'

// Blender-style camera controls:
//   - Ortho views: middle-click drag = pan, right-click drag = pan,
//     wheel = zoom toward cursor
//   - 3D view: OrbitControls. Middle = rotate, right = pan, left = picking

test.describe('Camera pan and zoom — continuous, never self-terminates', () => {
  test('FRONT view: middle-click pan moves camera continuously', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2

    const before = await getCameraInfo(page)
    expect(before.type).toBe('OrthographicCamera')

    // 40-step middle-click drag — long enough to fail loudly if it stops
    await dragCanvas(page, { x: cx, y: cy }, { x: cx + 300, y: cy + 200 }, 40, 'middle')

    const after = await getCameraInfo(page)
    // Camera position must move by approx the world equivalent of the screen
    // delta. Direction: panning right shifts the camera left so the world
    // appears to move right (i.e. camera.position.x DECREASES, world target
    // moves right). Either way, |Δposition| must be large.
    const dx = Math.abs(after.position.x - before.position.x)
    const dy = Math.abs(after.position.y - before.position.y)
    expect(dx + dy).toBeGreaterThan(50)
  })

  test('FRONT view: right-click pan moves camera continuously', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2

    const before = await getCameraInfo(page)
    await dragCanvas(page, { x: cx, y: cy }, { x: cx - 250, y: cy + 150 }, 30, 'right')

    const after = await getCameraInfo(page)
    const dx = Math.abs(after.position.x - before.position.x)
    const dy = Math.abs(after.position.y - before.position.y)
    expect(dx + dy).toBeGreaterThan(50)
  })

  test('TOP view: right-click pan changes ortho camera position', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'top')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2

    const before = await getCameraInfo(page)
    await dragCanvas(page, { x: cx, y: cy }, { x: cx + 200, y: cy + 150 }, 25, 'right')

    const after = await getCameraInfo(page)
    // Top view: world XZ plane. Camera position.x and position.z should shift.
    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.z - before.position.z)
    expect(moved).toBeGreaterThan(50)
  })

  test('FRONT view: wheel zooms camera toward cursor', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const before = await getCameraInfo(page)
    const rect = await canvasRect(page)
    // Wheel up (negative deltaY) = zoom in
    await wheelOverCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2, -120)
    await wheelOverCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2, -120)
    await wheelOverCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2, -120)

    const after = await getCameraInfo(page)
    expect(after.zoom).toBeGreaterThan(before.zoom * 1.1)
  })

  test('FRONT view: wheel zoom-out reduces ortho zoom level', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const before = await getCameraInfo(page)
    const rect = await canvasRect(page)
    await wheelOverCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2, 120)
    await wheelOverCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2, 120)
    await wheelOverCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2, 120)

    const after = await getCameraInfo(page)
    expect(after.zoom).toBeLessThan(before.zoom * 0.95)
  })

  test('FRONT view: pan target preserved when switching views and back', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    await dragCanvas(page, { x: cx, y: cy }, { x: cx + 200, y: cy }, 25, 'middle')

    const afterPan = await getCameraInfo(page)
    await setView(page, 'side')
    await page.waitForTimeout(150)
    await setView(page, 'front')
    await page.waitForTimeout(150)

    const restored = await getCameraInfo(page)
    // After returning to front, the camera should snap back to the panned target
    expect(Math.abs(restored.position.x - afterPan.position.x)).toBeLessThan(2)
    expect(Math.abs(restored.position.y - afterPan.position.y)).toBeLessThan(2)
  })
})

test.describe('3D view OrbitControls', () => {
  test('3D view: middle-click rotates the perspective camera', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2

    const before = await getCameraInfo(page)
    expect(before.type).toBe('PerspectiveCamera')

    await dragCanvas(page, { x: cx, y: cy }, { x: cx + 250, y: cy + 100 }, 30, 'middle')

    const after = await getCameraInfo(page)
    // OrbitControls rotation changes the camera's world position.
    const dx = Math.abs(after.position.x - before.position.x)
    const dy = Math.abs(after.position.y - before.position.y)
    const dz = Math.abs(after.position.z - before.position.z)
    expect(dx + dy + dz).toBeGreaterThan(20)
  })

  test('3D view: right-click pans the perspective camera', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2

    const before = await getCameraInfo(page)
    await dragCanvas(page, { x: cx, y: cy }, { x: cx + 200, y: cy + 100 }, 25, 'right')

    const after = await getCameraInfo(page)
    const moved = Math.abs(after.position.x - before.position.x)
                + Math.abs(after.position.y - before.position.y)
                + Math.abs(after.position.z - before.position.z)
    expect(moved).toBeGreaterThan(10)
  })
})
