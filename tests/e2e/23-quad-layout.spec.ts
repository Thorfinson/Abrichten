import { test, expect, type Page } from '@playwright/test'
import {
  bootWithSample, selectBoard, deselectAll, setMode, getBoard, boardCentre,
  projectInView, dragCanvas
} from './helpers'

/**
 * Quad layout: every quadrant must work in its own view — the board drag
 * plane, the handles and TransformControls follow the quadrant, not the
 * store's activeView (which stays 'front' or whatever it was before).
 */

async function enterQuad(page: Page): Promise<void> {
  await page.evaluate(() => window.__uiStore.getState().setViewLayout('quad'))
  await page.waitForFunction(() => {
    const v = window.__r3fViews
    return !!(v?.front && v.side && v.top && v['3d'])
  })
  await page.evaluate(() => window.__uiStore.getState().triggerFitView())
  await page.waitForTimeout(400)
}

/** Gizmo inventory of one quadrant's scene */
async function quadrantGizmos(page: Page, view: 'front' | 'side' | 'top' | '3d'): Promise<{ arrows: number; tc: number }> {
  return page.evaluate((v) => {
    const out = { arrows: 0, tc: 0 }
    window.__r3fViews![v]!.scene.traverse((o: any) => {
      if (o.type === 'TransformControlsGizmo') out.tc++
      // our translate arrows: cone tips drawn on top (TC's own cones sit inside its gizmo)
      if (o.isMesh && o.geometry?.type === 'ConeGeometry' && o.renderOrder === 999) out.arrows++
    })
    return out
  }, view)
}

test.describe('Quad layout uses each quadrant\'s own view', () => {
  test('dragging a board in the Side quadrant moves it in z/y', async ({ page }) => {
    await bootWithSample(page)
    await deselectAll(page)
    await enterQuad(page)

    // In side view the right side panel (x 582–600) is closest to the camera
    const id = 'b-rechts'
    const before = await getBoard(page, id)
    const centre = await boardCentre(page, id)
    const p = await projectInView(page, 'side', centre)
    const start = { x: p.x + 15, y: p.y - 40 }
    await dragCanvas(page, start, { x: start.x + 60, y: start.y - 50 })

    const after = await getBoard(page, id)
    expect(Math.abs(after.position.z - before.position.z)).toBeGreaterThan(5)
    expect(after.position.y).toBeGreaterThan(before.position.y + 5)
    expect(after.position.x).toBe(before.position.x)
    expect(await page.evaluate(() => window.__uiStore.getState().selectedBoardIds)).toEqual([id])
  })

  test('ortho quadrants show handles, only the 3D quadrant shows TransformControls', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    // even when the store's view was 3D before entering quad
    await page.evaluate(() => window.__uiStore.getState().setActiveView('3d'))
    await enterQuad(page)
    await selectBoard(page, assemblyId, 'b-links')
    await setMode(page, 'translate')
    await page.waitForTimeout(200)

    for (const v of ['front', 'side', 'top'] as const) {
      const g = await quadrantGizmos(page, v)
      expect(g.tc, `${v}: no TransformControls`).toBe(0)
      expect(g.arrows, `${v}: 6 translate arrows`).toBe(6)
    }
    const g3d = await quadrantGizmos(page, '3d')
    expect(g3d.tc).toBe(1)
    expect(g3d.arrows).toBe(0)
  })
})
