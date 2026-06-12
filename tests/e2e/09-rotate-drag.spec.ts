import { test, expect } from '@playwright/test'
import {
  bootWithSample, selectBoard, setView, setMode, getBoard,
  boardCentre, projectToCanvas, dragCanvas, fitView, findBoardIdByName
} from './helpers'

test.describe('Rotation ring drag (Blender-style torus)', () => {
  test('Z-axis ring drag in FRONT view changes board.rotation.z only', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    // Pick the back panel — biggest screen footprint so the Z ring is clearly
    // visible and the X/Y edge-on rings project to lines we can avoid.
    const boardId = await findBoardIdByName(page, 'Rückwand')

    await setView(page, 'front')
    await selectBoard(page, assemblyId, boardId)
    await setMode(page, 'rotate')
    await fitView(page)
    await page.waitForTimeout(300)

    const before = await getBoard(page, boardId)
    const centre = await boardCentre(page, boardId)

    // Pick a world point on the Z ring's perimeter at the 45° position so the
    // click misses the perpendicular X-ring (vertical line at centre.x) and
    // Y-ring (horizontal line at centre.y) projections in front view.
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
    // Drag tangentially — a sweep that produces a clear angle change
    const end = { x: start.x - 120, y: start.y + 120 }

    await dragCanvas(page, start, end)

    const after = await getBoard(page, boardId)
    expect(after.rotation.z).not.toBe(before.rotation.z)
    // Other axes unchanged
    expect(after.rotation.x).toBe(before.rotation.x)
    expect(after.rotation.y).toBe(before.rotation.y)
    // Dimensions and position untouched
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)
    expect(after.position.x).toBe(before.position.x)
    expect(after.position.y).toBe(before.position.y)
  })
})
