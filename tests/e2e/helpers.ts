import { Page, expect } from '@playwright/test'
import type * as THREE from 'three'

// ─── Type stubs for the dev-only window globals ──────────────────────────
declare global {
  interface Window {
    __uiStore: {
      getState: () => any
      setState: (s: any) => void
      subscribe: (fn: any) => () => void
    }
    __projectStore: {
      getState: () => any
      setState: (s: any) => void
      temporal: { getState: () => { undo: () => void; redo: () => void } }
    }
    __r3f: {
      camera: THREE.Camera
      scene: THREE.Scene
      size: { width: number; height: number }
      gl: THREE.WebGLRenderer
      THREE: typeof THREE
    }
  }
}

export interface BoardState {
  id: string
  name: string
  width: number
  height: number
  depth: number
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
}

/**
 * Loads the app and dismisses the welcome dialog by loading the sample project.
 * Returns the id of the first board in the first assembly for easy chaining.
 */
export async function bootWithSample(page: Page): Promise<{ assemblyId: string; firstBoardId: string }> {
  // Ensure the welcome flag is unset so we start from a known state, then go.
  await page.addInitScript(() => {
    try { localStorage.removeItem('abrichten-welcomed') } catch {}
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Welcome dialog is present — click "Beispielprojekt laden"
  const sampleBtn = page.getByRole('button', { name: /Beispielprojekt laden|Load Sample Project/i })
  await expect(sampleBtn).toBeVisible({ timeout: 10_000 })
  await sampleBtn.click()

  // Wait for the sample project + R3F scene to be ready
  await page.waitForFunction(() => {
    const proj = window.__projectStore?.getState().project
    return proj?.assemblies?.length > 0 && !!window.__r3f
  }, undefined, { timeout: 10_000 })

  const ids = await page.evaluate(() => {
    const proj = window.__projectStore.getState().project
    const a = proj.assemblies[0]
    return { assemblyId: a.id, firstBoardId: a.boards[0].id }
  })
  return ids
}

export async function setView(page: Page, view: 'front' | 'side' | 'top' | '3d'): Promise<void> {
  await page.evaluate((v) => window.__uiStore.getState().setActiveView(v), view)
  // give R3F one frame to swap cameras
  await page.waitForTimeout(120)
}

export async function setMode(page: Page, mode: 'translate' | 'rotate' | 'scale'): Promise<void> {
  await page.evaluate((m) => window.__uiStore.getState().setTransformMode(m), mode)
  await page.waitForTimeout(80)
}

export async function selectBoard(page: Page, assemblyId: string, boardId: string): Promise<void> {
  await page.evaluate(
    ({ a, b }) => window.__uiStore.getState().selectBoard(a, b),
    { a: assemblyId, b: boardId }
  )
  await page.waitForTimeout(80)
}

export async function deselectAll(page: Page): Promise<void> {
  await page.evaluate(() => window.__uiStore.getState().deselectAll())
  await page.waitForTimeout(60)
}

/**
 * Returns the id of the first board whose name matches the supplied substring
 * (case-insensitive) in the first assembly. Throws if no match.
 */
export async function findBoardIdByName(page: Page, namePart: string): Promise<string> {
  const id = await page.evaluate((np: string) => {
    const proj = window.__projectStore.getState().project
    const needle = np.toLowerCase()
    for (const a of proj.assemblies) {
      const b = a.boards.find((x: any) => String(x.name).toLowerCase().includes(needle))
      if (b) return b.id as string
    }
    return null
  }, namePart)
  if (!id) throw new Error(`no board found with name containing "${namePart}"`)
  return id
}

export async function getBoard(page: Page, boardId: string): Promise<BoardState> {
  return page.evaluate((id) => {
    const proj = window.__projectStore.getState().project
    for (const a of proj.assemblies) {
      const b = a.boards.find((x: any) => x.id === id)
      if (b) {
        return {
          id: b.id, name: b.name,
          width: b.width, height: b.height, depth: b.depth,
          position: { ...b.position },
          rotation: { ...b.rotation }
        }
      }
    }
    throw new Error(`board ${id} not found`)
  }, boardId)
}

export async function getUI(page: Page): Promise<{ activeView: string; transformMode: string; selectedBoardIds: string[]; activeTool: string }> {
  return page.evaluate(() => {
    const s = window.__uiStore.getState()
    return {
      activeView: s.activeView,
      transformMode: s.transformMode,
      selectedBoardIds: [...s.selectedBoardIds],
      activeTool: s.activeTool
    }
  })
}

/** Counts geometries in the scene for the active set of overlay handles. */
export async function gizmoInventory(page: Page): Promise<{
  cylinders: number   // translate arrow shafts
  cones: number       // translate arrow tips
  torus: number       // rotation rings
  resizeCubes: number // resize handle cubes (visible 16mm box)
  tcGroup: number     // TransformControlsGizmo count (3D mode)
}> {
  return page.evaluate(() => {
    const r = window.__r3f
    const out = { cylinders: 0, cones: 0, torus: 0, resizeCubes: 0, tcGroup: 0 }
    if (!r) return out
    r.scene.traverse((o: any) => {
      if (o.type === 'TransformControlsGizmo') out.tcGroup++
      if (!o.isMesh || !o.geometry) return
      const t = o.geometry.type
      if (t === 'CylinderGeometry') out.cylinders++
      else if (t === 'ConeGeometry') out.cones++
      else if (t === 'TorusGeometry') out.torus++
      else if (t === 'BoxGeometry' && o.geometry.parameters?.width === 16) out.resizeCubes++
    })
    return out
  })
}

/**
 * Project a world position to screen-space pixels using the active camera.
 * Returns { x, y } in canvas-local pixels — already offset by canvas bounding
 * rect, so it can be passed directly to mouse.move()/mouse.down().
 */
export async function projectToCanvas(page: Page, world: { x: number; y: number; z: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ wx, wy, wz }) => {
    const r = window.__r3f
    const THREE = r.THREE
    const v = new THREE.Vector3(wx, wy, wz)
    v.project(r.camera)
    const rect = r.gl.domElement.getBoundingClientRect()
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height
    }
  }, { wx: world.x, wy: world.y, wz: world.z })
}

/** Returns the canvas client bounding rect — used by drag-tests for fallback. */
export async function canvasRect(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const r = window.__r3f
    const rect = r.gl.domElement.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
}

/** Fit-view: triggers the store's fitViewTrigger so the active camera frames the scene. */
export async function fitView(page: Page): Promise<void> {
  await page.evaluate(() => window.__uiStore.getState().triggerFitView())
  await page.waitForTimeout(220)
}

/**
 * Compute the centre of a board in world coords (mm) — boards are positioned
 * by their min-corner, so the centre is position + half of each dim.
 */
export async function boardCentre(page: Page, boardId: string): Promise<{ x: number; y: number; z: number }> {
  const b = await getBoard(page, boardId)
  return {
    x: b.position.x + b.width / 2,
    y: b.position.y + b.height / 2,
    z: b.position.z + b.depth / 2
  }
}

/**
 * Walk the scene and return the world position of the visible mesh that
 * sits the furthest along (sign * axis) from `centre`. Used to locate a
 * specific gizmo arrow / cube without depending on render order.
 *
 * `kind`:
 *   'cylinder'  — arrow shaft (translate handle)
 *   'cube16'    — visible 16-mm resize cube
 *   'torus'     — rotation ring
 */
export async function findHandleWorld(
  page: Page,
  centre: { x: number; y: number; z: number },
  axis: 'x' | 'y' | 'z',
  sign: -1 | 1,
  kind: 'cylinder' | 'cube16' | 'torus'
): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate(
    ({ centre, axis, sign, kind }) => {
      const r = window.__r3f
      const THREE = r.THREE
      let best: { x: number; y: number; z: number } | null = null
      let bestProj = -Infinity
      r.scene.traverse((o: any) => {
        if (!o.isMesh || !o.geometry) return
        const t = o.geometry.type
        if (kind === 'cylinder' && t !== 'CylinderGeometry') return
        if (kind === 'torus' && t !== 'TorusGeometry') return
        if (kind === 'cube16') {
          if (t !== 'BoxGeometry') return
          if (o.geometry.parameters?.width !== 16) return
        }
        const w = new THREE.Vector3()
        o.getWorldPosition(w)
        const dx = w.x - centre.x, dy = w.y - centre.y, dz = w.z - centre.z
        const proj = sign * (axis === 'x' ? dx : axis === 'y' ? dy : dz)
        if (proj <= bestProj) return
        const ortho = axis === 'x' ? Math.hypot(dy, dz)
          : axis === 'y' ? Math.hypot(dx, dz)
          : Math.hypot(dx, dy)
        // Want the projection to dominate over the orthogonal offset
        if (Math.abs(proj) < 1) return
        if (ortho > Math.abs(proj) * 0.8) return
        bestProj = proj
        best = { x: w.x, y: w.y, z: w.z }
      })
      if (!best) throw new Error(`no ${kind} found for axis=${axis} sign=${sign}`)
      return best
    },
    { centre, axis, sign, kind }
  )
}

/**
 * Drives a real PointerEvent drag against the canvas. Playwright's `mouse.*`
 * generates Pointer events in Chromium and R3F listens for `pointerdown` on
 * the canvas; the gizmos then attach their own pointermove/up listeners and
 * call setPointerCapture, so subsequent moves route to the canvas regardless
 * of where the cursor goes.
 *
 * `steps` defaults to 10 to simulate a realistic continuous drag. The gizmo
 * handlers used to re-register on every store update (useEffect deps included
 * `board`), which terminated the drag after the first pointermove — that bug
 * is fixed, so multi-step drags should now fully apply the cumulative delta.
 */
export async function dragCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
  button: 'left' | 'right' | 'middle' = 'left'
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.waitForTimeout(30)
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(30)
  await page.mouse.up({ button })
  await page.waitForTimeout(80)
}

/**
 * Reads the active camera's world position. Used to verify that pan/zoom
 * actually moved the camera (or that nothing moved when it shouldn't).
 */
export async function getCameraInfo(page: Page): Promise<{
  type: 'OrthographicCamera' | 'PerspectiveCamera' | string
  position: { x: number; y: number; z: number }
  zoom: number
}> {
  return page.evaluate(() => {
    const c: any = window.__r3f.camera
    return {
      type: c.type,
      position: { x: c.position.x, y: c.position.y, z: c.position.z },
      zoom: c.zoom
    }
  })
}

/** Dispatches a wheel event over the canvas at (x, y). Positive deltaY = zoom out. */
export async function wheelOverCanvas(
  page: Page,
  x: number,
  y: number,
  deltaY: number
): Promise<void> {
  await page.evaluate(({ x, y, deltaY }) => {
    const canvas = window.__r3f.gl.domElement
    const evt = new WheelEvent('wheel', {
      clientX: x, clientY: y, deltaY,
      bubbles: true, cancelable: true
    })
    canvas.dispatchEvent(evt)
  }, { x, y, deltaY })
  await page.waitForTimeout(60)
}
