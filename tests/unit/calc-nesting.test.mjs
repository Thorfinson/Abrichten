// Guards utils/nesting.ts: grain orientation, kerf only between parts, and an
// efficiency figure that counts placed parts only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const { nestBoards } = await import('../../src/renderer/src/utils/nesting.ts')

let n = 0
const board = (w, h, d, extra = {}) => ({
  id: `b${++n}`, name: `b${n}`, width: w, height: h, depth: d,
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff', ...extra
})
const placed = (r) => r.groups.flatMap((g) => g.sheets.flatMap((s) => s.placed))

test('grain runs along the sheet length (sheet X) and is not rotated', () => {
  const veneer = { materialId: 'eiche-furniert' }
  const door = board(400, 700, 18, { ...veneer, grainDirection: 'width' })
  const [p] = placed(nestBoards([door], 2800, 2070, 3))
  assert.deepEqual({ w: p.w, h: p.h, rotated: p.rotated }, { w: 400, h: 700, rotated: false })
  const tall = board(400, 700, 18, { ...veneer, grainDirection: 'height' })
  const [q] = placed(nestBoards([tall], 2800, 2070, 3))
  assert.deepEqual({ w: q.w, h: q.h, rotated: q.rotated }, { w: 700, h: 400, rotated: false })
})

test('a grain direction on a grainless material (chipboard) does not lock the part', () => {
  // 400 × 2200 face, grain across the 400: locked it stands 2200 high on a 2070 sheet and fails
  const long = { grainDirection: 'width' }
  assert.equal(nestBoards([board(400, 18, 2200, { ...long, materialId: 'eiche-furniert' })], 2800, 2070, 3).groups[0].unplacedCount, 1)
  assert.equal(nestBoards([board(400, 18, 2200, { ...long, materialId: 'spanplatte' })], 2800, 2070, 3).groups[0].unplacedCount, 0)
})

test('kerf is only needed between parts, not at the sheet edge', () => {
  const r = nestBoards([board(2800, 18, 600)], 2800, 2070, 3)
  assert.equal(r.groups[0].unplacedCount, 0)
  assert.equal(r.totalSheets, 1)
  // two parts side by side still keep a kerf between them
  const two = placed(nestBoards([board(1400, 18, 600), board(1400, 18, 600)], 2800, 2070, 3))
  const overlapX = two.length === 2 && two[0].y === two[1].y
    ? Math.abs(two[0].x - two[1].x) >= 1400 + 3
    : true
  assert.ok(overlapX)
})

test('efficiency counts placed parts only', () => {
  const r = nestBoards([board(1000, 18, 1000), board(3000, 18, 2000)], 2800, 2070, 3)
  const g = r.groups[0]
  assert.equal(g.unplacedCount, 1)
  const expected = 1e6 / (2800 * 2070)
  assert.ok(Math.abs(g.efficiency - expected) < 1e-9, `group ${g.efficiency}`)
  assert.ok(Math.abs(r.overallEfficiency - expected) < 1e-9, `overall ${r.overallEfficiency}`)
})

test('custom materials get their name, unknown ids are flagged', () => {
  const custom = { id: 'my-board', name: 'Mein Brett', nameEn: 'My board', category: 'panel', density: 600, eModul: 2000, bendingStrength: 10, defaultThickness: [18], color: '#fff', grain: false }
  const r = nestBoards([board(500, 18, 500, { materialId: 'my-board' }), board(500, 18, 500, { materialId: 'gone' })], 2800, 2070, 3, false, [custom])
  const byId = Object.fromEntries(r.groups.map((g) => [g.materialId, g]))
  assert.equal(byId['my-board'].materialName, 'Mein Brett')
  assert.equal(byId['my-board'].materialKnown, true)
  assert.equal(byId['gone'].materialKnown, false)
  assert.equal(byId['gone'].materialName, 'gone')
})
