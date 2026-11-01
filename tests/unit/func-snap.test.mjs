// Guards utils/snap.ts: a dragged board snaps face-to-face (touching) or flush to
// other boards per drag axis, closest candidate within the threshold wins.
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
const { snapBox, snapBoardToBoards, boardBox } = await import('../../src/renderer/src/utils/snap.ts')

const board = (id, w, h, d, pos, rot = [0, 0, 0]) => ({
  id, name: id, width: w, height: h, depth: d,
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: rot[0], y: rot[1], z: rot[2] },
  materialId: 'spanplatte', color: '#fff'
})
const box = (min, max) => ({ min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } })

const side = board('side', 18, 720, 300, [0, 0, 0])

test('touching: the moving min face snaps onto the other max face', () => {
  const shelf = board('shelf', 564, 18, 300, [21, 300, 0])   // 3 mm right of the side
  const r = snapBoardToBoards(shelf, [side], ['x', 'y'], 5)
  assert.equal(r.position.x, 18)
  assert.deepEqual(r.snapped, ['x'])
  assert.equal(r.indicator.x, 18, 'indicator sits on the plane where the faces meet')
})

test('touching from the other side: max face onto min face', () => {
  const left = board('left', 100, 100, 100, [-104, 0, 0])
  const r = snapBoardToBoards(left, [side], ['x'], 5)
  assert.equal(r.position.x, -100)
})

test('flush: min onto min and max onto max', () => {
  const top = board('top', 564, 18, 300, [18, 702, 3])
  assert.equal(snapBoardToBoards(top, [side], ['z'], 5).position.z, 0, 'front edges flush')
  const shelf = board('shelf', 100, 18, 100, [50, 698, 0])
  assert.equal(snapBoardToBoards(shelf, [side], ['y'], 5).position.y, 702, 'top faces flush')
})

test('nothing within the threshold: position unchanged, no indicator', () => {
  const far = board('far', 100, 100, 100, [40, 300, 0])
  const r = snapBoardToBoards(far, [side], ['x'], 5)
  assert.deepEqual(r.position, far.position)
  assert.deepEqual(r.snapped, [])
  assert.equal(r.indicator, null)
})

test('the closest candidate wins', () => {
  const a = box([0, 0, 0], [100, 10, 10])
  const b = box([0, 0, 0], [103, 10, 10])
  const moving = box([104, 0, 0], [200, 10, 10])
  assert.equal(snapBox(moving, [a, b], ['x'], 10).offset.x, -1)
})

test('each axis snaps on its own and only along the drag axes', () => {
  const moving = box([102, 3, 2], [200, 50, 50])
  const other = box([0, 0, 0], [100, 100, 100])
  const r = snapBox(moving, [other], ['x', 'y'], 5)
  assert.deepEqual(r.offset, { x: -2, y: -3, z: 0 }, 'z is not a drag axis and stays')
  assert.deepEqual(r.planes, { x: 100, y: 0 })
})

test('rotated boards snap by their bounding box', () => {
  // 18 × 720 × 300 turned 90° about y: the box is 300 wide in x and 18 deep in z
  const turned = board('turned', 18, 720, 300, [0, 0, 0], [0, 90, 0])
  const b = boardBox(turned)
  assert.ok(Math.abs(b.max.x - b.min.x - 300) < 1e-9)
  const r = snapBoardToBoards(turned, [board('wall', 10, 720, 300, [b.max.x + 2, 0, 0])], ['x'], 5)
  assert.ok(Math.abs(r.position.x - (turned.position.x + 2)) < 1e-9, 'shifted by the same 2 mm as its box')
})
