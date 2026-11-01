// Guards computeJointPosition (utils/geometry.ts): both joint dialogs place a joint at the
// centre of the region where the two boards touch, so JointGrooves3D draws the dado at the shelf.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// the app imports siblings without extension (Vite style); let Node try "<spec>.ts"
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const { computeJointPosition, grooveBox } = await import('../../src/renderer/src/utils/geometry.ts')

const board = (x, y, z, width, height, depth, rotation = { x: 0, y: 0, z: 0 }) => ({
  id: `${x}-${y}-${z}`, name: 'b', width, height, depth,
  position: { x, y, z }, rotation, materialId: 'buche', color: '#fff'
})

test('shelf against a side panel: joint sits at the centre of the shelf end, not above it', () => {
  const side = board(0, 0, 0, 18, 720, 560)
  const shelf = board(18, 300, 0, 564, 18, 560)
  assert.deepEqual(computeJointPosition(side, shelf), { x: 18, y: 309, z: 280 })
  assert.deepEqual(computeJointPosition(shelf, side), { x: 18, y: 309, z: 280 }, 'order of the boards does not matter')
})

test('a shelf let into a dado overlaps the side: centre of the overlap volume', () => {
  const side = board(0, 0, 0, 18, 720, 560)
  const shelf = board(10, 300, 20, 500, 18, 500)
  assert.deepEqual(computeJointPosition(side, shelf), { x: 14, y: 309, z: 270 })
})

test('boards with a gap: midpoint of the gap on that axis', () => {
  const a = board(0, 0, 0, 100, 100, 100)
  const b = board(110, 20, 0, 100, 40, 100)
  assert.deepEqual(computeJointPosition(a, b), { x: 105, y: 40, z: 50 })
})

test('dado groove: horizontal, at shelf height, cut into the side panel face that faces the shelf', () => {
  const side = board(0, 0, 0, 18, 720, 560)
  const shelf = board(18, 300, 0, 564, 18, 560)
  const { centre, size } = grooveBox(computeJointPosition(side, shelf), side, shelf)
  // depth 6.3 mm (35 % of 18) into x from the inner face at x=18; 18 high at y 300–318; full 560 deep
  assert.deepEqual(size.map((n) => +n.toFixed(2)), [6.8, 18, 561])
  assert.deepEqual(centre.map((n) => +n.toFixed(2)), [14.85, 309, 280])

  const rightSide = board(582, 0, 0, 18, 720, 560)
  assert.equal(+grooveBox(computeJointPosition(rightSide, shelf), rightSide, shelf).centre[0].toFixed(2), 585.15, 'right side: groove on its left face')
})

test('rabbet for a back panel: runs along the side height, as wide as the back is thick', () => {
  const side = board(0, 0, 0, 18, 720, 560)
  const back = board(10, 0, 548, 580, 720, 6)
  const { centre, size } = grooveBox(computeJointPosition(side, back), side, back)
  assert.deepEqual(size.map((n) => +n.toFixed(2)), [6.8, 721, 6])
  assert.deepEqual(centre.map((n) => +n.toFixed(2)), [14.85, 360, 551])
})

test('rotated boards use their rotated bounding box', () => {
  // 600 × 18 × 560 shelf turned 90° about Z stands upright: x 291–309, y -291–309 around its centre
  const upright = board(0, 0, 0, 600, 18, 560, { x: 0, y: 0, z: 90 })
  const floor = board(-500, -309, 0, 1600, 18, 560)
  const p = computeJointPosition(upright, floor)
  assert.ok(Math.abs(p.x - 300) < 1e-9, `x=${p.x}`)
  assert.ok(Math.abs(p.y - -291) < 1e-9, `y=${p.y}`)
  assert.ok(Math.abs(p.z - 280) < 1e-9, `z=${p.z}`)
})
