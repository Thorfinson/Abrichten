import { test, expect, type Page } from '@playwright/test'
import {
  bootWithSample, selectBoard, deselectAll, setView, setMode, getBoard, getUI, boardCentre,
  findHandleWorld, projectToCanvas, fitView, dragCanvas, undoState
} from './helpers'

/**
 * Interrupting a drag must never leave the app stuck: Esc cancels and
 * restores, other shortcuts wait for the drag to end, and a handle that
 * disappears mid-drag still ends it (drag lock released, undo resumed).
 */

/** Selects b-links in front view (translate) and presses on its +X arrow. */
async function pressOnXArrow(page: Page): Promise<{ x: number; y: number }> {
  const { assemblyId } = await bootWithSample(page)
  await setView(page, 'front')
  await selectBoard(page, assemblyId, 'b-links')
  await setMode(page, 'translate')
  await fitView(page)
  await page.waitForTimeout(300)
  const arrow = await findHandleWorld(page, await boardCentre(page, 'b-links'), 'x', 1, 'cylinder')
  const start = await projectToCanvas(page, arrow)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.waitForTimeout(30)
  await page.mouse.move(start.x + 120, start.y, { steps: 8 })
  return start
}

test.describe('Interrupting a drag', () => {
  test('Esc mid-drag cancels: board restored, no undo step, and the next drag undoes alone', async ({ page }) => {
    const start = await pressOnXArrow(page)
    expect((await getBoard(page, 'b-links')).position.x).toBeGreaterThan(5) // live update while dragging
    expect((await undoState(page)).tracking).toBe(false) // paused during the drag

    await page.keyboard.press('Escape')
    expect((await getBoard(page, 'b-links')).position.x).toBe(0)
    await page.mouse.move(start.x + 200, start.y, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(100)

    expect((await getBoard(page, 'b-links')).position.x).toBe(0)
    const undo = await undoState(page)
    expect(undo.tracking).toBe(true)
    expect((await getUI(page)).selectedBoardIds).toEqual(['b-links']) // Esc cancelled the drag only

    // A fresh drag records exactly one step: one Ctrl+Z goes back to x = 0
    const arrow = await findHandleWorld(page, await boardCentre(page, 'b-links'), 'x', 1, 'cylinder')
    const s2 = await projectToCanvas(page, arrow)
    await dragCanvas(page, s2, { x: s2.x + 100, y: s2.y })
    expect((await getBoard(page, 'b-links')).position.x).toBeGreaterThan(5)
    expect((await undoState(page)).past).toBe(undo.past + 1)
    await page.keyboard.press('Control+z')
    expect((await getBoard(page, 'b-links')).position.x).toBe(0)
  })

  test('mode, tool, view and delete shortcuts are ignored while dragging', async ({ page }) => {
    const start = await pressOnXArrow(page)
    for (const key of ['r', 't', '2', 'Alt+2', 'Delete', 'Control+z']) await page.keyboard.press(key)
    const ui = await getUI(page)
    expect(ui.transformMode).toBe('translate')
    expect(ui.activeTool).toBe('select')
    expect(ui.activeView).toBe('front')
    expect(ui.selectedBoardIds).toEqual(['b-links'])

    await page.mouse.move(start.x + 150, start.y, { steps: 3 })
    await page.mouse.up()
    await page.waitForTimeout(100)
    const moved = await getBoard(page, 'b-links')
    expect(moved.position.x).toBeGreaterThan(5)
    expect((await undoState(page)).tracking).toBe(true)
  })

  test('a handle unmounted mid-drag ends the drag: undo resumes and the move is one step', async ({ page }) => {
    const start = await pressOnXArrow(page)
    const undoBefore = (await undoState(page)).past
    // The arrows unmount (e.g. selection cleared from elsewhere) while the button is held
    await page.evaluate(() => window.__uiStore.getState().deselectAll())
    await page.waitForTimeout(100)
    await page.mouse.move(start.x + 150, start.y, { steps: 3 })
    await page.mouse.up()
    await page.waitForTimeout(100)

    const undo = await undoState(page)
    expect(undo.tracking).toBe(true)
    expect(undo.past).toBe(undoBefore + 1)
    const movedX = (await getBoard(page, 'b-links')).position.x
    expect(movedX).toBeGreaterThan(5)

    // Later edits are undoable again, one step each
    await page.evaluate(() => window.__projectStore.getState().updateBoard('asm-1', 'b-boden', { name: 'X' }))
    expect((await undoState(page)).past).toBe(undo.past + 1)
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    expect((await getBoard(page, 'b-links')).position.x).toBe(0)
  })

  for (const interrupt of ['Esc', 'deselect'] as const) {
    test(`3D TransformControls drag interrupted by ${interrupt}: mesh back, orbit and undo work again`, async ({ page }) => {
      const { assemblyId } = await bootWithSample(page)
      await setView(page, '3d')
      await selectBoard(page, assemblyId, 'b-links')
      await setMode(page, 'translate')
      await fitView(page)
      await page.waitForTimeout(400)
      const before = await getBoard(page, 'b-links')
      const centre = await boardCentre(page, 'b-links')

      // Screen position of TC's X-arrow picker and the screen direction of +X
      const grip = await page.evaluate(() => {
        const r = window.__r3f
        const THREE = r.THREE
        let picker: any = null
        r.scene.traverse((o: any) => {
          if (o.type === 'TransformControlsGizmo') picker = o.picker.translate.children.find((c: any) => c.name === 'X')
        })
        const rect = r.gl.domElement.getBoundingClientRect()
        const toScreen = (v: any) => {
          const p = v.clone().project(r.camera)
          return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
        }
        const c = new THREE.Box3().setFromObject(picker).getCenter(new THREE.Vector3())
        return { at: toScreen(c), ahead: toScreen(c.clone().add(new THREE.Vector3(100, 0, 0))) }
      })
      const meshX = () => page.evaluate(() => {
        let x = NaN
        window.__r3f.scene.traverse((o: any) => { if (o.isMesh && o.name === 'b-links') x = o.position.x })
        return x
      })
      const dir = { x: grip.ahead.x - grip.at.x, y: grip.ahead.y - grip.at.y }
      const len = Math.hypot(dir.x, dir.y)
      await page.mouse.move(grip.at.x, grip.at.y)
      await page.waitForTimeout(50)
      await page.mouse.down()
      await page.mouse.move(grip.at.x + dir.x / len * 80, grip.at.y + dir.y / len * 80, { steps: 6 })
      expect(await meshX()).toBeGreaterThan(centre.x + 5) // TC moved the mesh

      if (interrupt === 'Esc') await page.keyboard.press('Escape')
      else await page.evaluate(() => window.__uiStore.getState().deselectAll())
      await page.waitForTimeout(100)
      expect(await meshX()).toBe(centre.x) // drag dropped, mesh back where the board is
      await page.mouse.up()
      await page.waitForTimeout(100)

      expect(await getBoard(page, 'b-links')).toEqual(before)
      expect((await undoState(page)).tracking).toBe(true)
      // OrbitControls was re-enabled: a middle drag in a free corner orbits
      const cam0 = await page.evaluate(() => window.__r3f.camera.position.toArray())
      await dragCanvas(page, { x: 120, y: 160 }, { x: 420, y: 320 }, 20, 'middle')
      const cam1 = await page.evaluate(() => window.__r3f.camera.position.toArray())
      expect(Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2])).toBeGreaterThan(20)
    })
  }

  test('Esc during a direct board drag puts the board mesh back', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await deselectAll(page)
    await fitView(page)
    await page.waitForTimeout(300)
    const id = 'b-rueckwand'
    const before = await getBoard(page, id)
    const c = await boardCentre(page, id)
    const p = await projectToCanvas(page, c)
    const start = { x: p.x + 120, y: p.y - 80 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.waitForTimeout(30)
    await page.mouse.move(start.x + 150, start.y - 60, { steps: 6 })
    await page.keyboard.press('Escape')
    await page.mouse.move(start.x + 200, start.y - 60, { steps: 2 })
    await page.mouse.up()
    await page.waitForTimeout(100)

    expect(await getBoard(page, id)).toEqual(before)
    // the visual mesh sits where the board is (564 × 684 back panel)
    const meshPos = await page.evaluate(() => {
      let out: { x: number; y: number } | null = null
      window.__r3f.scene.traverse((o: any) => {
        const g = o.geometry?.parameters
        if (o.isMesh && g?.width === 564 && g?.height === 684 && o.material?.opacity !== 0.25) out = { x: o.position.x, y: o.position.y }
      })
      return out
    })
    expect(meshPos).toEqual({ x: c.x, y: c.y })
    expect((await undoState(page)).tracking).toBe(true)
  })
})
