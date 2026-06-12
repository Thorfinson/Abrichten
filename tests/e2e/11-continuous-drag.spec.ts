import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, setView, setMode, getBoard,
  boardCentre, findHandleWorld, projectToCanvas, dragCanvas, fitView, findBoardIdByName
} from './helpers'

// Continuous-drag regression: previously the gizmo's useEffect listed `board`
// in its deps, so updateBoard() during a pointermove tore the handler down
// after the first frame. These tests use steps=20 to exercise a real,
// continuous drag and assert the cumulative delta lands, not just the first
// step's worth.

test.describe('Continuous (multi-step) gizmo drag — drag does not self-terminate', () => {
  test('Translate arrow: cumulative drag reaches the target position', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await setView(page, 'front')
    await selectBoard(page, assemblyId, firstBoardId)
    await setMode(page, 'translate')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, firstBoardId)
    const centre = await boardCentre(page, firstBoardId)
    const arrowWorld = await findHandleWorld(page, centre, 'x', 1, 'cylinder')

    const start = await projectToCanvas(page, arrowWorld)
    // Drag 300 px right over 30 steps — pre-fix this would only commit ~10 px
    const end = { x: start.x + 300, y: start.y }
    await dragCanvas(page, start, end, 30)

    const after = await getBoard(page, firstBoardId)
    const deltaX = after.position.x - before.position.x
    // 300 screen px at default fit-zoom should map to far more than 100 mm in
    // world space. A "stuck after first step" drag yields <30 mm.
    expect(deltaX).toBeGreaterThan(100)
    expect(after.position.y).toBe(before.position.y)
    expect(after.position.z).toBe(before.position.z)
  })

  test('Resize cube: cumulative drag grows the dimension all the way', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const boardId = await findBoardIdByName(page, 'Boden')
    await setView(page, 'front')
    await selectBoard(page, assemblyId, boardId)
    await setMode(page, 'scale')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, boardId)
    const centre = await boardCentre(page, boardId)
    const cubeWorld = await findHandleWorld(page, centre, 'x', 1, 'cube16')

    const start = await projectToCanvas(page, cubeWorld)
    const end = { x: start.x + 250, y: start.y }
    await dragCanvas(page, start, end, 25)

    const after = await getBoard(page, boardId)
    const deltaW = after.width - before.width
    // Same reasoning — must be a big delta, not a tiny first-step crumb.
    expect(deltaW).toBeGreaterThan(100)
    expect(after.position.x).toBe(before.position.x)
    expect(after.height).toBe(before.height)
  })

  test('Rotation ring: continuous sweep produces a real angle delta', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const boardId = await findBoardIdByName(page, 'Rückwand')
    await setView(page, 'front')
    await selectBoard(page, assemblyId, boardId)
    await setMode(page, 'rotate')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, boardId)
    const centre = await boardCentre(page, boardId)

    // Same Z-ring 45° pick as the existing rotate test.
    const ringPoint = await page.evaluate(({ cx, cy, cz }) => {
      const r = window.__r3f
      const THREE = r.THREE
      let zMesh: any = null
      let bestZMatch = 0
      r.scene.traverse((o: any) => {
        if (!o.isMesh || o.geometry?.type !== 'TorusGeometry') return
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
          o.getWorldQuaternion(new THREE.Quaternion())
        )
        const m = Math.abs(normal.z)
        if (m > bestZMatch) { bestZMatch = m; zMesh = o }
      })
      if (!zMesh) throw new Error('Z ring mesh not found')
      const radius = zMesh.geometry.parameters.radius ?? 30
      const scale = zMesh.scale.x
      const r45 = radius * scale / Math.SQRT2
      return { x: cx + r45, y: cy + r45, z: cz }
    }, { cx: centre.x, cy: centre.y, cz: centre.z })

    const start = await projectToCanvas(page, ringPoint)
    const end = { x: start.x - 200, y: start.y + 200 }
    await dragCanvas(page, start, end, 25)

    const after = await getBoard(page, boardId)
    // Non-trivial rotation: at least 15° away from start
    const dz = Math.abs(after.rotation.z - before.rotation.z)
    expect(dz).toBeGreaterThan(15)
    expect(after.rotation.x).toBe(before.rotation.x)
    expect(after.rotation.y).toBe(before.rotation.y)
  })

  test('Board ortho drag: cumulative drag moves the board fully', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const boardId = await findBoardIdByName(page, 'Rückwand')
    await setView(page, 'front')
    await selectBoard(page, assemblyId, boardId)
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, boardId)
    const centre = await boardCentre(page, boardId)
    const centrePixel = await projectToCanvas(page, centre)
    const start = { x: centrePixel.x + 120, y: centrePixel.y - 80 }
    const end = { x: start.x + 250, y: start.y - 150 }

    await dragCanvas(page, start, end, 25)

    const after = await getBoard(page, boardId)
    expect(after.position.x - before.position.x).toBeGreaterThan(100)
    expect(after.position.y - before.position.y).toBeGreaterThan(60)
    expect(after.position.z).toBe(before.position.z)
  })
})
