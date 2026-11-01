import { test, expect, type Page } from '@playwright/test'
import {
  bootWithSample, selectBoard, deselectAll, setView, getUI, boardCentre,
  projectToCanvas, fitView
} from './helpers'

/**
 * Pointer details on boards: clicking the selected board in 3D keeps it
 * selected (the click must not fall through to the board behind it), and a
 * right-drag pan that ends on a board is not a context-menu request.
 */

/** A pixel on `boardId` (well away from its TC gizmo) whose ray hits that board first and another board behind it. */
async function pixelWithBoardBehind(page: Page, boardId: string): Promise<{ x: number; y: number; behind: string } | null> {
  return page.evaluate((id) => {
    const r = window.__r3f
    const THREE = r.THREE
    const boards: any[] = []
    r.scene.traverse((o: any) => { if (o.isMesh && /^b-/.test(o.name)) boards.push(o) })
    const target = boards.find((b) => b.name === id)
    const rect = r.gl.domElement.getBoundingClientRect()
    const toScreen = (v: any) => ({ x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height })
    const centre = toScreen(target.getWorldPosition(new THREE.Vector3()).project(r.camera))
    const box = new THREE.Box3().setFromObject(target)
    const raycaster = new THREE.Raycaster()
    for (let i = 1; i < 10; i++) {
      for (let j = 1; j < 10; j++) {
        for (let k = 1; k < 10; k++) {
          const p = new THREE.Vector3(
            box.min.x + (box.max.x - box.min.x) * i / 10,
            box.min.y + (box.max.y - box.min.y) * j / 10,
            box.min.z + (box.max.z - box.min.z) * k / 10
          ).project(r.camera)
          const s = toScreen(p)
          if (Math.hypot(s.x - centre.x, s.y - centre.y) < 140) continue
          if (document.elementFromPoint(s.x, s.y) !== r.gl.domElement) continue // e.g. the selection toolbar
          raycaster.setFromCamera(new THREE.Vector2(p.x, p.y), r.camera)
          const hits = raycaster.intersectObjects(boards, false)
          if (hits[0]?.object.name === id && hits.some((h: any) => h.object.name !== id)) {
            return { ...s, behind: hits.find((h: any) => h.object.name !== id)!.object.name }
          }
        }
      }
    }
    return null
  }, boardId)
}

test.describe('Board pointer handling', () => {
  test('3D: clicking the selected board keeps it selected instead of picking the board behind', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await fitView(page)
    await selectBoard(page, assemblyId, 'b-rechts')
    await page.waitForTimeout(300)

    const px = await pixelWithBoardBehind(page, 'b-rechts')
    expect(px, 'a pixel where another board lies behind the right side panel').not.toBeNull()
    await page.mouse.move(px!.x, px!.y)
    await page.waitForTimeout(50)
    await page.mouse.click(px!.x, px!.y)
    await page.waitForTimeout(100)
    expect((await getUI(page)).selectedBoardIds).toEqual(['b-rechts'])
  })

  test('a right-drag pan that ends on a board opens no context menu; a right click does', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await deselectAll(page)
    await fitView(page)
    await page.waitForTimeout(300)
    const p = await projectToCanvas(page, await boardCentre(page, 'b-rueckwand'))
    const menu = () => page.evaluate(() => window.__uiStore.getState().contextMenu)
    // Windows fires contextmenu on release, other platforms on press: send one at the
    // release point explicitly so the test behaves the same everywhere.
    const contextMenuAt = (x: number, y: number) => page.evaluate(({ x, y }) => {
      if (window.__uiStore.getState().contextMenu) return
      window.__r3f.gl.domElement.dispatchEvent(new MouseEvent('contextmenu', { clientX: x, clientY: y, button: 2, bubbles: true, cancelable: true }))
    }, { x, y })

    // Pan: the scene follows the pointer, so the same board is under it at the end
    await page.mouse.move(p.x, p.y)
    await page.mouse.down({ button: 'right' })
    await page.evaluate(() => window.__uiStore.getState().setContextMenu(null)) // a press-time menu is not what we test
    await page.mouse.move(p.x + 90, p.y + 40, { steps: 6 })
    await page.mouse.up({ button: 'right' })
    await contextMenuAt(p.x + 90, p.y + 40)
    await page.waitForTimeout(100)
    expect(await menu()).toBeNull()

    // A plain right click on the board still opens it
    await page.mouse.click(p.x + 90, p.y + 40, { button: 'right' })
    await contextMenuAt(p.x + 90, p.y + 40)
    await page.waitForTimeout(100)
    expect((await menu())?.boardId).toBe('b-rueckwand')
  })
})
