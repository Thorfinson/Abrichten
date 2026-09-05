import { test, expect } from '@playwright/test'
import { bootWithSample, findBoardIdByName } from './helpers'

test.describe('Board cutouts (cooktop / sink openings)', () => {
  test('adding a cutout switches the mesh to a holed extrude geometry', async ({ page }) => {
    await bootWithSample(page)
    const targetId = await findBoardIdByName(page, 'Rückwand')

    const result = await page.evaluate((id) => {
      const proj = window.__projectStore.getState()
      const assembly = proj.project.assemblies.find((a: any) =>
        a.boards.some((b: any) => b.id === id)
      )
      const board = assembly.boards.find((b: any) => b.id === id)
      // Cutout sized from the board's own dims so it always fits
      proj.updateBoard(assembly.id, id, {
        cutouts: [{
          id: 'cut-1',
          x: board.width / 4, z: board.depth / 4,
          width: board.width / 2, depth: board.depth / 2
        }]
      })
      return new Promise<{ types: string[] }>((resolve) => {
        // give R3F a frame to rebuild the memoized geometry
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const types: string[] = []
          window.__r3f.scene.traverse((o: any) => {
            if (o.isMesh && o.geometry?.type === 'ExtrudeGeometry') types.push(o.geometry.type)
          })
          resolve({ types })
        }))
      })
    }, targetId)

    expect(result.types.length).toBeGreaterThan(0)

    // Removing the cutout restores a plain box
    const afterRemove = await page.evaluate((id) => {
      const proj = window.__projectStore.getState()
      const assembly = proj.project.assemblies.find((a: any) =>
        a.boards.some((b: any) => b.id === id)
      )
      proj.updateBoard(assembly.id, id, { cutouts: [] })
      return new Promise<number>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          let extrudes = 0
          window.__r3f.scene.traverse((o: any) => {
            if (o.isMesh && o.geometry?.type === 'ExtrudeGeometry') extrudes++
          })
          resolve(extrudes)
        }))
      })
    }, targetId)

    expect(afterRemove).toBe(0)
  })
})
