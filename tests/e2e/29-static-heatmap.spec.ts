import { test, expect, type Page } from '@playwright/test'
import { bootWithSample, findBoardIdByName, selectBoard, deselectAll, setView, getUI, fitView, undoState } from './helpers'

/**
 * Static heat map (2D load simulation):
 *  - every rated board gets an FE-style mesh with a colour per node, varying across
 *    both face axes
 *  - the payload changes colours and labels; a ring and label mark the maximum
 *  - the result type switch shows stress or deflection; the deformation toggle the sag
 *  - "Last setzen" places a load with a click (one undo step, an arrow, a new maximum);
 *    Esc leaves the mode, and the properties card lists, edits and removes the load
 *  - with the mode off, the overlay never takes the clicks meant for the boards
 */

interface Heat { colors: number[]; values: number[]; pos: number[]; minY: number; mode: string }

async function heat(page: Page, boardId: string): Promise<Heat | null> {
  return page.evaluate((id) => {
    let out: Heat | null = null
    window.__r3f.scene.traverse((o: any) => {
      if (!o.isMesh || o.userData?.staticBoardId !== id) return
      const g = o.geometry
      const p = g.attributes.position
      const pos: number[] = []
      let minY = Infinity
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i) + o.position.x, p.getY(i) + o.position.y, p.getZ(i) + o.position.z)
        minY = Math.min(minY, p.getY(i) + o.position.y)
      }
      out = {
        colors: Array.from(g.attributes.color.array as ArrayLike<number>),
        values: Array.from(g.attributes.value.array as ArrayLike<number>),
        pos, minY, mode: o.userData.mode
      }
    })
    return out
  }, boardId)
}

/** World position of a board's hot-spot ring, or null. */
async function hotspot(page: Page, boardId: string): Promise<{ x: number; y: number; z: number } | null> {
  return page.evaluate((id) => {
    let out: { x: number; y: number; z: number } | null = null
    window.__r3f.scene.traverse((o: any) => {
      if (o.userData?.staticHotspot !== id) return
      const v = new window.__r3f.THREE.Vector3()
      o.getWorldPosition(v)
      out = { x: v.x, y: v.y, z: v.z }
    })
    return out
  }, boardId)
}

/** Static overlay on, on the absolute colour scale (100 % = breaks) unless told otherwise — most checks compare absolute values. */
async function showOverlay(page: Page, scaleMode: 'model' | 'board' | 'absolute' = 'absolute'): Promise<void> {
  await page.evaluate((mode) => {
    const ui = window.__uiStore.getState(); if (!ui.showStaticOverlay) ui.toggleStaticOverlay()
    ;(window as any).__staticStore.getState().setScaleMode(mode)
  }, scaleMode)
  await page.waitForTimeout(150)
}

const label = (page: Page, boardId: string) => page.locator(`[data-testid="static-label"][data-board-id="${boardId}"]`)
const setPayload = async (page: Page, kg: number) => {
  await page.evaluate((v) => window.__uiStore.getState().setStaticLoadKg(v), kg)
  await page.waitForTimeout(150)
}
const staticState = (page: Page) => page.evaluate(() => {
  const s = (window as any).__staticStore.getState()
  return { placing: s.placingLoad as boolean, resultType: s.resultType as string }
})
const shelfBoard = (page: Page, id: string) => page.evaluate((bid) =>
  window.__projectStore.getState().project.assemblies.flatMap((a: any) => a.boards).find((b: any) => b.id === bid), id)

/** Top-face vertices (normal up) of a heat mesh: [x, z, value]. */
function topFace(h: Heat): [number, number, number][] {
  const maxY = Math.max(...h.pos.filter((_, i) => i % 3 === 1))
  const out: [number, number, number][] = []
  for (let i = 0; i < h.values.length; i++) {
    if (Math.abs(h.pos[3 * i + 1] - maxY) < 0.5) out.push([h.pos[3 * i], h.pos[3 * i + 2], h.values[i]])
  }
  return out
}

test.describe('Static heat map', () => {
  test('every rated board gets a heat-map mesh with a colour and a value per vertex', async ({ page }) => {
    await bootWithSample(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await setView(page, '3d')
    await showOverlay(page)
    const info = await page.evaluate(() => {
      let group: any = null, meshes = 0, coloured = 0
      window.__r3f.scene.traverse((o: any) => {
        if (o.name === 'static-heatmap') group = o
        if (o.isMesh && o.userData?.staticBoardId) {
          meshes++
          if (o.geometry.attributes.color?.itemSize === 4 && o.geometry.attributes.value) coloured++
        }
      })
      return { group: !!group, ms: group?.userData.simulationMs, meshes, coloured, boards: window.__projectStore.getState().project.assemblies[0].boards.length }
    })
    expect(info.group).toBe(true)
    expect(typeof info.ms).toBe('number')
    expect(info.meshes).toBe(info.boards)
    expect(info.coloured).toBe(info.meshes)
    // off again: the overlay is gone
    await page.evaluate(() => window.__uiStore.getState().toggleStaticOverlay())
    await page.waitForTimeout(100)
    expect(await heat(page, await findBoardIdByName(page, 'Einlegeboden'))).toBeNull()
    expect(errors).toEqual([])
  })

  test('the field is two-dimensional: the colours vary across both face axes', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    // on four shelf pins the shelf carries its load to four points: a truly 2D field
    await page.evaluate(({ a, s }) => window.__projectStore.getState().updateBoard(a, s, { hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 4 }] }), { a: assemblyId, s: shelf })
    await setPayload(page, 60)
    const top = topFace((await heat(page, shelf))!)
    const xs = [...new Set(top.map((p) => Math.round(p[0])))].sort((a, b) => a - b)
    const zs = [...new Set(top.map((p) => Math.round(p[1])))].sort((a, b) => a - b)
    expect(xs.length).toBeGreaterThanOrEqual(15)
    expect(zs.length).toBeGreaterThanOrEqual(8)
    const spread = (pts: [number, number, number][]) => Math.max(...pts.map((p) => p[2])) - Math.min(...pts.map((p) => p[2]))
    const midX = xs[Math.floor(xs.length / 2)], midZ = zs[Math.floor(zs.length / 2)]
    const acrossDepth = top.filter((p) => Math.round(p[0]) === midX)
    const alongWidth = top.filter((p) => Math.round(p[1]) === midZ)
    expect(spread(alongWidth)).toBeGreaterThan(0.02)
    expect(spread(acrossDepth)).toBeGreaterThan(0.002)
  })

  test('colour scales: model (default) and per board spread a lightly loaded field, absolute does not; the label stays absolute', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    expect(await page.evaluate(() => (window as any).__staticStore.getState().scaleMode)).toBe('model')
    await showOverlay(page, 'model')
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    await page.evaluate(({ a, s }) => window.__uiStore.getState().selectBoard(a, s), { a: assemblyId, s: shelf })
    // a placed load makes the shelf the most used board of the model
    await page.evaluate(({ a, s }) => window.__projectStore.getState().updateBoard(a, s, { loads: [{ id: 'l1', x: 70, z: 220, kg: 40, w: 100, d: 100 }] }), { a: assemblyId, s: shelf })
    await setPayload(page, 20)
    const redness = (h: Heat) => Math.max(...h.colors.filter((_, i) => i % 4 === 0).map((r, k) => r - h.colors[k * 4 + 1]))
    const model = (await heat(page, shelf))!
    // the model maximum lies on this shelf: its hot spot reaches the top of the scale
    expect(Math.max(...model.values)).toBeCloseTo(1, 5)
    await page.getByTestId('static-scale-board').click()
    await page.waitForTimeout(150)
    const board = (await heat(page, shelf))!
    expect(Math.max(...board.values)).toBeCloseTo(1, 5)
    await page.getByTestId('static-scale-absolute').click()
    await page.waitForTimeout(150)
    const abs = (await heat(page, shelf))!
    expect(Math.max(...abs.values)).toBeLessThan(0.5)
    expect(redness(model)).toBeGreaterThan(redness(abs))
    // the marker keeps the absolute percentage in every scale
    await expect(label(page, shelf)).toHaveText(/^max\. \d+ %/)
  })

  test('the payload changes the colours, the label and the hot spot', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    await selectBoard(page, assemblyId, shelf)

    await setPayload(page, 20)
    await expect(label(page, shelf)).toHaveText(/^max\. \d+ %( · ([Dd]urchbiegung|sag) [\d.,]+ mm)?$/)
    const light = await heat(page, shelf)

    // heavy: the shelf sags past span/200 and turns red in the middle
    await setPayload(page, 250)
    await expect(label(page, shelf)).toHaveText(/Durchbiegung [\d,]+ mm \(zul\. 1,9\)|Sag [\d.]+ mm/)
    const heavy = await heat(page, shelf)
    expect(heavy!.colors).not.toEqual(light!.colors)
    const redness = (h: Heat) => Math.max(...h.colors.filter((_, i) => i % 4 === 0).map((r, k) => r - h.colors[k * 4 + 1]))
    expect(redness(heavy!)).toBeGreaterThan(redness(light!))

    // past 100 %: "Bruch" and a ring at the maximum
    await setPayload(page, 1000)
    await expect(label(page, shelf)).toHaveText(/^(Bruch|Breaks) · \d+ %$/)
    expect(await hotspot(page, shelf)).not.toBeNull()
    // an ok board that is not selected gets neither
    await deselectAll(page)
    await setPayload(page, 20)
    await expect(label(page, shelf)).toHaveCount(0)
    expect(await hotspot(page, shelf)).toBeNull()
  })

  test('the hot-spot ring and label sit at the maximum of the field', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    await fitView(page)
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    // a heavy load near the front-left corner: the maximum is there, off the middle (60 kg
    // stays below 100 % under permanent load, where the colours saturate and the peak is unique)
    await page.evaluate(({ a, s }) => window.__projectStore.getState().updateBoard(a, s, { loads: [{ id: 'l1', x: 20, z: 170, kg: 60, w: 100, d: 100 }] }), { a: assemblyId, s: shelf })
    await selectBoard(page, assemblyId, shelf)
    await page.waitForTimeout(200)
    const h = (await heat(page, shelf))!
    const top = topFace(h)
    const peak = top.reduce((best, p) => (p[2] > best[2] ? p : best))
    const ring = (await hotspot(page, shelf))!
    expect(Math.hypot(ring.x - peak[0], ring.z - peak[1])).toBeLessThan(1)
    expect(ring.x).toBeLessThan(150)   // near the load, not mid-span (x 300)
    // the label is drawn right above the ring on screen
    const screen = await page.evaluate((p) => {
      const r = window.__r3f
      const v = new r.THREE.Vector3(p.x, p.y, p.z).project(r.camera)
      const rect = r.gl.domElement.getBoundingClientRect()
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
    }, ring)
    const box = (await label(page, shelf).boundingBox())!
    expect(Math.abs(box.x + box.width / 2 - screen.x)).toBeLessThan(4)
    expect(box.y + box.height).toBeLessThan(screen.y)
    expect(screen.y - (box.y + box.height)).toBeLessThan(40)
  })

  test('the result type switch shows the deflection instead of the stress', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    await selectBoard(page, assemblyId, shelf)
    await setPayload(page, 60)
    const stress = (await heat(page, shelf))!
    expect(stress.mode).toBe('stress')
    await page.getByTestId('static-result-deflection').click()
    await page.waitForTimeout(150)
    expect((await staticState(page)).resultType).toBe('deflection')
    const sag = (await heat(page, shelf))!
    expect(sag.mode).toBe('deflection')
    expect(sag.values).not.toEqual(stress.values)
    // deflection: zero where it rests on the side panels, most in the middle
    const top = topFace(sag)
    const at = (x: number) => Math.max(...top.filter((p) => Math.abs(p[0] - x) < 1).map((p) => p[2]))
    expect(at(18)).toBeLessThan(0.01)
    expect(at(300)).toBeGreaterThan(0.2)
    await expect(label(page, shelf)).toHaveText(/^(Durchbiegung|Sag) [\d.,]+ mm/)
    await page.getByTestId('static-result-stress').click()
    await page.waitForTimeout(150)
    expect((await heat(page, shelf))!.mode).toBe('stress')
  })

  test('the deformation toggle draws the sag', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    await setPayload(page, 100)
    const flat = await heat(page, shelf)
    await page.evaluate(() => (window as any).__staticStore.getState().toggleDeformation())
    await page.waitForTimeout(150)
    const sagging = await heat(page, shelf)
    // shelf bottom at y = 340; the exaggerated sag pulls the middle well below it
    expect(flat!.minY).toBeGreaterThan(339)
    expect(sagging!.minY).toBeLessThan(flat!.minY - 10)
    await page.evaluate(() => (window as any).__staticStore.getState().toggleDeformation())
  })

  test('"Last setzen": a click places a load (one undo step) with an arrow and a new maximum; Esc ends it', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    await fitView(page)
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    await selectBoard(page, assemblyId, shelf)
    await setPayload(page, 20)
    const before = (await heat(page, shelf))!
    const ringBefore = (await hotspot(page, shelf))!

    await page.getByTestId('static-place-load').click()
    expect((await staticState(page)).placing).toBe(true)
    await expect(page.getByTestId('static-place-hint')).toBeVisible()
    const past = (await undoState(page)).past

    // a pixel on the shelf's top face near its front-left corner, not covered by a label or card
    const pixel = await page.evaluate((id) => {
      const r = window.__r3f, THREE = r.THREE
      const meshes: any[] = []
      r.scene.traverse((o: any) => { if (o.isMesh && o.userData?.staticBoardId) meshes.push(o) })
      const rect = r.gl.domElement.getBoundingClientRect()
      const ray = new THREE.Raycaster()
      for (const [x, z] of [[90, 240], [110, 220], [80, 200], [130, 250], [150, 230]]) {
        const p = new THREE.Vector3(x, 358, z).project(r.camera)
        const s = { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
        if (document.elementFromPoint(s.x, s.y) !== r.gl.domElement) continue
        ray.setFromCamera(new THREE.Vector2(p.x, p.y), r.camera)
        const hit = ray.intersectObjects(meshes, false)[0]
        if (hit?.object.userData.staticBoardId === id && hit.face && hit.face.normal.y > 0.5) return s
      }
      return null
    }, shelf)
    expect(pixel).not.toBeNull()
    await page.mouse.click(pixel!.x, pixel!.y)
    await page.waitForTimeout(250)

    const board = await shelfBoard(page, shelf)
    expect(board.loads).toHaveLength(1)
    expect(board.loads[0]).toMatchObject({ kg: 10, w: 100, d: 100 })
    expect(board.loads[0].x).toBeLessThan(150)
    expect((await undoState(page)).past).toBe(past + 1)
    // the selection is untouched, the arrow is there with its weight, the field and its maximum moved
    expect((await getUI(page)).selectedBoardIds).toEqual([shelf])
    const arrows = await page.evaluate(() => {
      const out: number[] = []
      window.__r3f.scene.traverse((o: any) => { if (o.userData?.staticLoadArrow) out.push(o.userData.kg) })
      return out
    })
    expect(arrows).toEqual([10])
    await expect(page.locator('[data-testid="static-load-label"]')).toHaveText('10 kg')
    expect((await heat(page, shelf))!.values).not.toEqual(before.values)
    const ringAfter = (await hotspot(page, shelf))!
    expect(ringAfter.x).toBeLessThan(ringBefore.x)

    // Esc leaves the mode and keeps the selection
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    expect((await staticState(page)).placing).toBe(false)
    expect((await getUI(page)).selectedBoardIds).toEqual([shelf])

    // the properties card lists the load: change its weight, then remove it (one undo step each)
    const kg = page.getByTestId('board-placed-load-kg')
    await expect(kg).toHaveValue('10')
    await kg.fill('30')
    await kg.press('Enter')
    await page.waitForTimeout(100)
    expect((await shelfBoard(page, shelf)).loads[0].kg).toBe(30)
    await expect(page.locator('[data-testid="static-load-label"]')).toHaveText('30 kg')
    await page.getByTestId('board-placed-load-delete').click()
    await page.waitForTimeout(100)
    expect((await shelfBoard(page, shelf)).loads).toBeUndefined()
    expect((await undoState(page)).past).toBe(past + 3)
  })

  test('the overlay does not take clicks: a click on a board still selects it', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    await fitView(page)
    await deselectAll(page)
    const top = await findBoardIdByName(page, 'Deckel')
    // a pixel whose ray hits this board first (the heat map lies on top of it)
    const pixel = await page.evaluate((id) => {
      const r = window.__r3f
      const THREE = r.THREE
      const boards: any[] = []
      r.scene.traverse((o: any) => { if (o.isMesh && o.name && !o.userData?.staticBoardId) boards.push(o) })
      const target = boards.find((b) => b.name === id)
      const box = new THREE.Box3().setFromObject(target)
      const rect = r.gl.domElement.getBoundingClientRect()
      const raycaster = new THREE.Raycaster()
      for (let i = 2; i < 9; i++) {
        for (let j = 1; j < 10; j++) {
          for (let k = 2; k < 9; k++) {
            const p = new THREE.Vector3(
              box.min.x + (box.max.x - box.min.x) * i / 10,
              box.min.y + (box.max.y - box.min.y) * j / 10,
              box.min.z + (box.max.z - box.min.z) * k / 10
            ).project(r.camera)
            const s = { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
            if (document.elementFromPoint(s.x, s.y) !== r.gl.domElement) continue // a label or toolbar
            raycaster.setFromCamera(new THREE.Vector2(p.x, p.y), r.camera)
            if (raycaster.intersectObjects(boards, false)[0]?.object.name === id) return s
          }
        }
      }
      return null
    }, top)
    expect(pixel).not.toBeNull()
    await page.mouse.click(pixel!.x, pixel!.y)
    await page.waitForTimeout(150)
    expect((await getUI(page)).selectedBoardIds).toEqual([top])
  })

  test('the supports of the selected board show its joints apart from what it rests on', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    // the sample's top is screwed to both side panels (joint lines) and rests on the back's edge
    const top = await findBoardIdByName(page, 'Deckel')
    await selectBoard(page, assemblyId, top)
    await page.waitForTimeout(150)
    const markers = await page.evaluate((id) => {
      const out: Record<string, number> = {}
      window.__r3f.scene.traverse((o: any) => { if (o.userData?.staticSupports === id) out[o.userData.kind] = o.userData.count })
      return out
    }, top)
    expect(markers.joint).toBeGreaterThan(4)
    expect(markers.contact).toBeGreaterThan(0)
    // a shelf on pins rests on four points and has no joint
    const shelf = await findBoardIdByName(page, 'Einlegeboden')
    await page.evaluate(({ a, s }) => window.__projectStore.getState().updateBoard(a, s, { hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 4 }] }), { a: assemblyId, s: shelf })
    await selectBoard(page, assemblyId, shelf)
    await page.waitForTimeout(150)
    const pins = await page.evaluate((id) => {
      const out: Record<string, number> = {}
      window.__r3f.scene.traverse((o: any) => { if (o.userData?.staticSupports === id) out[o.userData.kind] = o.userData.count })
      return out
    }, shelf)
    expect(pins).toEqual({ contact: 4, joint: 0 })
  })

  test('the legend folds to its title row (remembered) and its × switches the overlay off', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    const legend = page.getByTestId('static-legend')
    await expect(legend.getByTestId('static-result-stress')).toBeVisible()
    await page.getByTestId('static-legend-fold').click()
    await expect(legend.getByTestId('static-result-stress')).toHaveCount(0)
    await expect(legend).toContainText(/Statik-Simulation|Load simulation/)
    expect(await page.evaluate(() => localStorage.getItem('abrichten-static-legend-collapsed'))).toBe('1')
    await page.getByTestId('static-legend-fold').click()
    await expect(legend.getByTestId('static-result-stress')).toBeVisible()
    await page.getByTestId('static-legend-close').click()
    await expect(legend).toHaveCount(0)
    expect(await page.evaluate(() => window.__uiStore.getState().showStaticOverlay)).toBe(false)
  })

  test('the weight field: empty shows the weight from material and size, a datasheet weight replaces it', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await setView(page, '3d')
    await showOverlay(page)
    const back = await findBoardIdByName(page, 'Rückwand')
    await selectBoard(page, assemblyId, back)
    const field = page.getByTestId('board-weight-field')
    await expect(field).toHaveValue('')
    expect(Number(await field.getAttribute('placeholder'))).toBeGreaterThan(1)   // 564 × 684 × 8 mm HDF
    await field.fill('4.5')
    await field.press('Enter')
    await page.waitForTimeout(100)
    expect((await shelfBoard(page, back)).weightKg).toBe(4.5)
    await field.fill('')
    await field.press('Enter')
    await page.waitForTimeout(100)
    expect((await shelfBoard(page, back)).weightKg).toBeUndefined()
  })
})
