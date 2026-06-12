import { test, expect } from '@playwright/test'
import { bootWithSample, selectBoard, setView, getUI, gizmoInventory, setMode } from './helpers'

test.describe('Blender-style mode shortcuts (G/R/T)', () => {
  test('G switches to translate, R to rotate, T to scale', async ({ page }) => {
    await bootWithSample(page)

    // Make sure focus is in the document (not in any input)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

    await page.keyboard.press('g')
    expect((await getUI(page)).transformMode).toBe('translate')

    await page.keyboard.press('r')
    expect((await getUI(page)).transformMode).toBe('rotate')

    await page.keyboard.press('t')
    expect((await getUI(page)).transformMode).toBe('scale')

    // Back to G
    await page.keyboard.press('g')
    expect((await getUI(page)).transformMode).toBe('translate')
  })

  test('each mode shows the correct overlay gizmo in FRONT view', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    // give R3F a frame to mount the overlays
    await page.waitForTimeout(200)

    // Translate: ≥4 arrow shafts (cylinders) + ≥4 tips (cones)
    await setMode(page, 'translate')
    await page.waitForTimeout(150)
    const tInv = await gizmoInventory(page)
    expect(tInv.cylinders).toBeGreaterThanOrEqual(4)
    expect(tInv.cones).toBeGreaterThanOrEqual(4)
    expect(tInv.torus).toBe(0)
    expect(tInv.resizeCubes).toBe(0)

    // Rotate: 3 rotation rings (torus)
    await setMode(page, 'rotate')
    await page.waitForTimeout(150)
    const rInv = await gizmoInventory(page)
    expect(rInv.torus).toBeGreaterThanOrEqual(3)
    expect(rInv.resizeCubes).toBe(0)

    // Scale: 6 resize cubes
    await setMode(page, 'scale')
    await page.waitForTimeout(150)
    const sInv = await gizmoInventory(page)
    expect(sInv.resizeCubes).toBeGreaterThanOrEqual(4) // 6 total but a few may be hidden behind
    expect(sInv.torus).toBe(0)
  })

  test('3D view uses TransformControls gizmo regardless of mode', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, '3d')
    await selectBoard(page, assemblyId, firstBoardId)
    await page.waitForTimeout(250)

    for (const mode of ['translate', 'rotate', 'scale'] as const) {
      await setMode(page, mode)
      await page.waitForTimeout(220)
      const inv = await gizmoInventory(page)
      expect(inv.tcGroup, `mode=${mode}: TransformControlsGizmo mounted`).toBeGreaterThanOrEqual(1)
    }
  })
})
