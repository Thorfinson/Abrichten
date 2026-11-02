// Guards utils/collision.ts: a back panel sitting in the grooves of the parts it is
// joined to by a dado/rabbet joint is not a collision; anything deeper still is.
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
const { detectCollisions3D } = await import('../../src/renderer/src/utils/collision.ts')

const board = (id, w, h, d, pos) => ({
  id, name: id, width: w, height: h, depth: d,
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff'
})
const joint = (type, a, b) => ({ id: `${a}-${b}`, type, boardA: a, boardB: b, position: { x: 0, y: 0, z: 0 }, fasteners: [] })

// 600 × 720 × 570 carcass, 18 mm, 6 mm back 8 mm deep in grooves 6 mm from the back edge
const side = board('side', 18, 720, 570, [0, 0, 0])
const bottom = board('bottom', 564, 18, 570, [18, 0, 0])
const back = board('back', 580, 700, 6, [10, 10, 558])

test('a grooved back overlaps the parts it sits in', () => {
  assert.equal(detectCollisions3D([side, bottom, back]).length, 2)
})

test('dado joints make the groove overlap intended', () => {
  const joints = [joint('dado', 'back', 'side'), joint('rabbet', 'bottom', 'back')]
  assert.deepEqual(detectCollisions3D([side, bottom, back], joints), [])
  // a butt joint does not excuse the overlap
  assert.equal(detectCollisions3D([side, bottom, back], [joint('butt', 'back', 'side')]).length, 2)
})

test('an overlap deeper than half the grooved board is still reported', () => {
  const deep = board('back', 594, 700, 6, [3, 10, 558])   // 15 mm into the 18 mm side
  assert.equal(detectCollisions3D([side, deep], [joint('dado', 'back', 'side')]).length, 1)
})

test('boards that only touch through float dust do not collide; a real overlap does', () => {
  // 1435 + 52.3 ends a hair past 1487.3, where the next board starts (found by a random search)
  const left = board('left', 52.3, 70, 15, [1435, 0, 0])
  const right = board('right', 13.5, 70, 15, [1487.3, 0, 0])
  assert.deepEqual(detectCollisions3D([left, right]), [])
  const into = board('into', 13.5, 70, 15, [1487.3 - 0.5, 0, 0])
  assert.equal(detectCollisions3D([left, into]).length, 1)
})
