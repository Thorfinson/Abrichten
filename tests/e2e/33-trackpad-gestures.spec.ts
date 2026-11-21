import { test, expect, type Page } from '@playwright/test'
import {
  bootWithSample, setView, setMode, selectBoard, fitView, canvasRect, dragCanvas,
  getCameraInfo, getUI, boardCentre, findHandleWorld, projectToCanvas
} from './helpers'

// Trackpad gestures (utils/canvasInput + CameraController):
//   two-finger scroll = pan, pinch (wheel + ctrlKey) = zoom towards the cursor,
//   ⌥ + scroll / ⌥ + drag = orbit in 3D (2D: pan), ⇧⌥ + drag = pan.
// A mouse wheel notch keeps zooming as before (12-camera-pan-zoom.spec.ts).

/** Dispatches a wheel event like a trackpad / mouse would, over the canvas at (x, y). */
async function wheel(page: Page, x: number, y: number, init: WheelEventInit): Promise<void> {
  await page.evaluate(({ x, y, init }) => {
    window.__r3f.gl.domElement.dispatchEvent(new WheelEvent('wheel', {
      clientX: x, clientY: y, bubbles: true, cancelable: true, ...init
    }))
  }, { x, y, init })
  await page.waitForTimeout(16)
}

/** Ortho: world point under a client position. */
async function worldUnder(page: Page, x: number, y: number): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate(({ x, y }) => {
    const r = window.__r3f
    const rect = r.gl.domElement.getBoundingClientRect()
    const v = new r.THREE.Vector3(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1, 0)
    v.unproject(r.camera)
    return { x: v.x, y: v.y, z: v.z }
  }, { x, y })
}

/** 3D: camera, orbit target, view direction and the point under (x, y) on the plane through the target. */
async function orbitState(page: Page, x = 0, y = 0) {
  return page.evaluate(({ x, y }) => {
    const r = window.__r3f as any
    const T = r.THREE
    const cam = r.camera
    const target = r.controls.target
    const dir = cam.getWorldDirection(new T.Vector3())
    const rect = r.gl.domElement.getBoundingClientRect()
    const ray = new T.Raycaster()
    ray.setFromCamera(new T.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), cam)
    const p = ray.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(dir, target), new T.Vector3())
    const xyz = (v: any) => ({ x: v.x, y: v.y, z: v.z })
    return { pos: xyz(cam.position), target: xyz(target), dir: xyz(dir), dist: cam.position.distanceTo(target), under: p && xyz(p) }
  }, { x, y })
}

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

async function setInputDevice(page: Page, device: 'auto' | 'mouse' | 'trackpad'): Promise<void> {
  await page.evaluate((d) => window.__uiStore.getState().setInputDevice(d), device)
}

test.describe('Trackpad: ortho views', () => {
  test('FRONT: pinch (wheel + ctrlKey) zooms in towards the cursor', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const at = { x: rect.x + rect.width * 0.7, y: rect.y + rect.height * 0.35 }
    const before = await getCameraInfo(page)
    const worldBefore = await worldUnder(page, at.x, at.y)
    // pinch-out: small negative deltas with ctrlKey, as Chromium sends them
    for (let i = 0; i < 10; i++) await wheel(page, at.x, at.y, { deltaY: -6, ctrlKey: true })

    const after = await getCameraInfo(page)
    expect(after.zoom).toBeGreaterThan(before.zoom * 1.6)
    expect(after.zoom).toBeLessThan(before.zoom * 2.2) // continuous, not 10 wheel notches
    const worldAfter = await worldUnder(page, at.x, at.y)
    expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThan(1)
    expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThan(1)
  })

  test('FRONT: two-finger scroll pans the view, zoom unchanged', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const before = await getCameraInfo(page)
    for (let i = 0; i < 10; i++) await wheel(page, cx, cy, { deltaX: 8, deltaY: 6 })
    const after = await getCameraInfo(page)

    expect(after.zoom).toBeCloseTo(before.zoom, 6)
    // scrolling right / down moves the view right / down: 80 px and 60 px of screen
    expect(after.position.x - before.position.x).toBeCloseTo(80 / before.zoom, 0)
    expect(before.position.y - after.position.y).toBeCloseTo(60 / before.zoom, 0)
  })

  test('TOP: two-finger scroll pans in the XZ plane', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'top')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const before = await getCameraInfo(page)
    for (let i = 0; i < 8; i++) await wheel(page, rect.x + 200, rect.y + 200, { deltaY: 10 })
    const after = await getCameraInfo(page)
    expect(Math.abs(after.position.z - before.position.z)).toBeGreaterThan(70 / before.zoom)
    expect(after.zoom).toBeCloseTo(before.zoom, 6)
  })

  test('FRONT: ⌥-drag on empty canvas pans, no marquee, selection kept', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const start = { x: rect.x + 80, y: rect.y + 80 }
    const before = await getCameraInfo(page)
    await page.keyboard.down('Alt')
    await dragCanvas(page, start, { x: start.x + 200, y: start.y + 100 }, 20)
    await page.keyboard.up('Alt')
    const after = await getCameraInfo(page)

    // content follows the pointer: the camera moves the other way
    expect(before.position.x - after.position.x).toBeCloseTo(200 / before.zoom, 0)
    expect(after.position.y - before.position.y).toBeCloseTo(100 / before.zoom, 0)
    expect((await getUI(page)).selectedBoardIds).toEqual([firstBoardId])
  })

  test('FRONT: a gizmo drag is not panned away by trackpad scroll momentum', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const centre = await boardCentre(page, firstBoardId)
    const start = await projectToCanvas(page, await findHandleWorld(page, centre, 'x', 1, 'cylinder'))
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 40, start.y, { steps: 4 })

    const before = await getCameraInfo(page)
    for (let i = 0; i < 5; i++) await wheel(page, start.x + 40, start.y, { deltaX: 30, deltaY: 20, buttons: 1 })
    const during = await getCameraInfo(page)
    await page.mouse.up()

    expect(during.position.x).toBeCloseTo(before.position.x, 6)
    expect(during.position.y).toBeCloseTo(before.position.y, 6)
  })

  test('Mouse setting: small wheel deltas zoom in notches, ⌥-drag stays a marquee', async ({ page }) => {
    await bootWithSample(page)
    await setInputDevice(page, 'mouse')
    await setView(page, 'front')
    await fitView(page)
    await page.waitForTimeout(200)

    const rect = await canvasRect(page)
    const before = await getCameraInfo(page)
    await wheel(page, rect.x + rect.width / 2, rect.y + rect.height / 2, { deltaY: -4 })
    const zoomed = await getCameraInfo(page)
    expect(zoomed.zoom / before.zoom).toBeCloseTo(1.08, 6)

    const start = { x: rect.x + 80, y: rect.y + 80 }
    await page.keyboard.down('Alt')
    await dragCanvas(page, start, { x: start.x + 200, y: start.y + 100 }, 20)
    await page.keyboard.up('Alt')
    const after = await getCameraInfo(page)
    expect(after.position.x).toBeCloseTo(zoomed.position.x, 6)
    expect(after.position.y).toBeCloseTo(zoomed.position.y, 6)
  })
})

test.describe('Trackpad: 3D view', () => {
  test('3D: pinch zooms towards the cursor', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    const at = { x: rect.x + rect.width * 0.65, y: rect.y + rect.height * 0.4 }
    const before = await orbitState(page, at.x, at.y)
    for (let i = 0; i < 10; i++) await wheel(page, at.x, at.y, { deltaY: -8, ctrlKey: true })
    const after = await orbitState(page, at.x, at.y)

    expect(after.dist).toBeLessThan(before.dist * 0.6)
    // same view direction, and the point under the cursor stayed under it
    expect(dist(after.dir, before.dir)).toBeLessThan(1e-6)
    const px = await projectToCanvas(page, before.under!)
    expect(Math.abs(px.x - at.x)).toBeLessThan(1.5)
    expect(Math.abs(px.y - at.y)).toBeLessThan(1.5)
  })

  test('3D: two-finger scroll pans camera and target together', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    const before = await orbitState(page)
    for (let i = 0; i < 10; i++) await wheel(page, rect.x + rect.width / 2, rect.y + rect.height / 2, { deltaX: 10, deltaY: -5 })
    const after = await orbitState(page)

    expect(dist(after.target, before.target)).toBeGreaterThan(20)
    expect(after.dist).toBeCloseTo(before.dist, 3)
    expect(dist(after.dir, before.dir)).toBeLessThan(1e-6)
  })

  test('3D: ⌥ + two-finger scroll orbits around the target', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    const before = await orbitState(page)
    for (let i = 0; i < 10; i++) await wheel(page, rect.x + rect.width / 2, rect.y + rect.height / 2, { deltaX: -15, altKey: true })
    const after = await orbitState(page)

    expect(dist(after.target, before.target)).toBeLessThan(1e-6)
    expect(after.dist).toBeCloseTo(before.dist, 3)
    expect(dist(after.dir, before.dir)).toBeGreaterThan(0.3)
  })

  test('3D: ⌥-drag orbits without selecting, ⇧⌥-drag pans', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    // starts over the model: a plain press here would select a board
    const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    const selection = (await getUI(page)).selectedBoardIds
    const before = await orbitState(page)
    await page.keyboard.down('Alt')
    await dragCanvas(page, start, { x: start.x + 200, y: start.y + 60 }, 20)
    const orbited = await orbitState(page)
    expect(dist(orbited.target, before.target)).toBeLessThan(1e-6)
    expect(dist(orbited.dir, before.dir)).toBeGreaterThan(0.3)
    expect((await getUI(page)).selectedBoardIds).toEqual(selection)

    await page.keyboard.down('Shift')
    await dragCanvas(page, start, { x: start.x - 150, y: start.y + 80 }, 20)
    await page.keyboard.up('Shift')
    await page.keyboard.up('Alt')
    const panned = await orbitState(page)
    expect(dist(panned.target, orbited.target)).toBeGreaterThan(20)
    expect(dist(panned.dir, orbited.dir)).toBeLessThan(1e-6)
    expect((await getUI(page)).selectedBoardIds).toEqual(selection)
  })

  test('3D: a mouse wheel notch still dollies through OrbitControls', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await page.waitForTimeout(300)

    const rect = await canvasRect(page)
    const before = await orbitState(page)
    await wheel(page, rect.x + rect.width / 2, rect.y + rect.height / 2, { deltaY: -120 })
    const after = await orbitState(page)
    expect(after.dist).toBeLessThan(before.dist * 0.99)
    // OrbitControls dollies towards its target: the target doesn't move
    expect(dist(after.target, before.target)).toBeLessThan(1e-6)
  })
})
