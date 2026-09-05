import { test, expect } from '@playwright/test'
import { bootWithSample, findBoardIdByName } from './helpers'

/**
 * Data-integrity guards on the project store:
 *  - deleting a board also drops every joint that referenced it
 *  - joints can be removed individually
 *  - loadProject rejects malformed data and leaves the current project intact
 */
test.describe('Project integrity', () => {
  test('removing a board prunes its joints; undo restores them', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const sideId = await findBoardIdByName(page, 'Seitenwand Links')

    const before = await page.evaluate((aid) => {
      const a = window.__projectStore.getState().project.assemblies.find((x: any) => x.id === aid)
      return a.joints.length
    }, assemblyId)
    expect(before).toBeGreaterThan(0)

    const after = await page.evaluate(({ aid, bid }) => {
      const store = window.__projectStore.getState()
      store.removeBoard(aid, bid)
      const fresh = window.__projectStore.getState().project.assemblies.find((x: any) => x.id === aid)
      return {
        dangling: fresh.joints.filter((j: any) => j.boardA === bid || j.boardB === bid).length,
        remaining: fresh.joints.length,
        boards: fresh.boards.length
      }
    }, { aid: assemblyId, bid: sideId })
    expect(after.dangling).toBe(0)
    expect(after.remaining).toBeLessThan(before)

    const undone = await page.evaluate((aid) => {
      window.__projectStore.temporal.getState().undo()
      const a = window.__projectStore.getState().project.assemblies.find((x: any) => x.id === aid)
      return a.joints.length
    }, assemblyId)
    expect(undone).toBe(before)
  })

  test('removeJoint deletes exactly one joint', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const result = await page.evaluate((aid) => {
      const store = window.__projectStore.getState()
      const a = store.project.assemblies.find((x: any) => x.id === aid)
      const n = a.joints.length
      store.removeJoint(aid, a.joints[0].id)
      const fresh = window.__projectStore.getState().project.assemblies.find((x: any) => x.id === aid)
      return { n, m: fresh.joints.length, gone: !fresh.joints.some((j: any) => j.id === a.joints[0].id) }
    }, assemblyId)
    expect(result.m).toBe(result.n - 1)
    expect(result.gone).toBe(true)
  })

  test('loadProject rejects malformed data and keeps the current project', async ({ page }) => {
    await bootWithSample(page)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    const result = await page.evaluate(() => {
      const store = window.__projectStore.getState()
      const nameBefore = store.project.name
      const errors: string[] = []
      const bad = [
        { foo: 1 },
        { assemblies: [{ boards: [{ width: 'abc', height: 1, depth: 1, position: { x: 0, y: 0, z: 0 } }] }] },
        { assemblies: [{ boards: [{ width: 10, height: 10, depth: 10, position: { x: NaN, y: 0, z: 0 } }] }] }
      ]
      for (const b of bad) {
        try { store.loadProject(b); errors.push('no error') } catch (e: any) { errors.push(e.message) }
      }
      // Minimal valid file with junk in every optional slot: defaults applied,
      // malformed nested data dropped, dangling / position-less joints dropped.
      store.loadProject({
        parameters: { H: 720, bad: 'x' },
        customMaterials: 'nope',
        assemblies: [{
          boards: [
            { id: 'a', width: 10, height: 10, depth: 10, position: { x: 0, y: 0, z: 0 }, cutouts: 'nope', hardware: { x: 1 } },
            { id: 'b', width: 10, height: 10, depth: 10, position: { x: 0, y: 0, z: 0 },
              cutouts: [{ x: 1, z: 1, width: 5, depth: 5 }, { x: 'bad' }], hardware: [{ hardwareId: 'h1', quantity: 2 }, { quantity: 1 }] }
          ],
          joints: [
            { id: 'j-dangling', type: 'butt', boardA: 'nope', boardB: 'a', position: { x: 0, y: 0, z: 0 }, fasteners: [] },
            { id: 'j-nopos', type: 'butt', boardA: 'a', boardB: 'b', fasteners: [] },
            { id: 'j-badtype', type: 'weird', boardA: 'a', boardB: 'b', position: { x: 0, y: 0, z: 0 } }
          ]
        }]
      })
      const p = window.__projectStore.getState().project
      const [a, b] = p.assemblies[0].boards
      return {
        errors,
        nameUnchangedDuringErrors: nameBefore,
        loaded: {
          unit: p.displayUnit, lang: p.language, visible: p.assemblies[0].visible,
          params: p.parameters, customMaterials: p.customMaterials,
          aCutouts: a.cutouts, aHardware: a.hardware,
          bCutouts: b.cutouts.length, bHardware: b.hardware,
          joints: p.assemblies[0].joints.map((j: any) => [j.id, j.type, j.fasteners]),
          rot: a.rotation, hasId: !!a.id
        }
      }
    })
    expect(result.errors).toHaveLength(3)
    for (const e of result.errors) expect(e).not.toBe('no error')
    expect(result.loaded).toEqual({
      unit: 'mm', lang: 'de', visible: true,
      params: { H: 720 }, customMaterials: undefined,
      aCutouts: undefined, aHardware: undefined,
      bCutouts: 1, bHardware: [{ hardwareId: 'h1', quantity: 2 }],
      joints: [['j-badtype', 'butt', []]],
      rot: { x: 0, y: 0, z: 0 }, hasId: true
    })
    // The sanitised project must render without throwing (there is no ErrorBoundary)
    await page.waitForTimeout(300)
    expect(pageErrors).toEqual([])
  })

  test('joints may span assemblies: kept on load with fasteners and note, pruned when the partner board is removed', async ({ page }) => {
    await bootWithSample(page)
    const result = await page.evaluate(() => {
      const store = window.__projectStore.getState()
      store.loadProject({
        assemblies: [
          { id: 'A', boards: [{ id: 'a1', width: 10, height: 10, depth: 10, position: { x: 0, y: 0, z: 0 } }],
            joints: [{ id: 'jx', type: 'screw', boardA: 'a1', boardB: 'b1', position: { x: 0, y: 0, z: 0 }, note: 'schräg',
                       fasteners: [{ id: 'f1', type: 'wood_screw', diameter: 5, length: 80, quantity: 2 }, { type: 'bogus', diameter: 1, length: 1, quantity: 1 }] }] },
          { id: 'B', boards: [{ id: 'b1', width: 10, height: 10, depth: 10, position: { x: 20, y: 0, z: 0 } }] }
        ]
      })
      const afterLoad = window.__projectStore.getState().project.assemblies[0].joints
      window.__projectStore.getState().removeBoard('B', 'b1')
      const afterRemove = window.__projectStore.getState().project.assemblies[0].joints.length
      return { afterLoad, afterRemove }
    })
    expect(result.afterLoad).toHaveLength(1)
    expect(result.afterLoad[0].note).toBe('schräg')
    expect(result.afterLoad[0].fasteners).toEqual([{ id: 'f1', type: 'wood_screw', diameter: 5, length: 80, quantity: 2, headType: 'countersunk', material: 'steel' }])
    expect(result.afterRemove).toBe(0)
  })
})
