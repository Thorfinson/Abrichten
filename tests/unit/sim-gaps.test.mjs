// Guards the supports counted across a gap (services/static-sim.ts SupportGap:
// side walls 4 mm below the front beam were silently counted as its supports).
// A gap still supports — the statics would otherwise change everywhere — but it is
// reported with its width and the board is never rated "ok" for it, unless hardware
// bridges it on purpose (a drawer runner). One place decides: openGapMm.
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
const { simulateStatics, openGapMm, clearStaticCache } = await import('../../src/renderer/src/services/static-sim.ts')

const board = (id, w, h, d, pos, extra = {}) => ({
  id, name: id, width: w, height: h, depth: d,
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'multiplex-birke', color: '#fff', ...extra
})
/** A beam on two posts; the posts end `gap` mm below it. */
const frame = (gap) => [
  board('postL', 56, 700 - gap, 36, [0, 0, 0], { materialId: 'fichte' }),
  board('postR', 56, 700 - gap, 36, [944, 0, 0], { materialId: 'fichte' }),
  board('beam', 1000, 56, 36, [0, 700, 0], { materialId: 'fichte' })
]
const run = (boards, opts = {}) => { clearStaticCache(); return simulateStatics(boards, { payloadKg: 0, ...opts }) }

test('posts that touch the beam carry it without a remark', () => {
  const r = run(frame(0)).results.get('beam')
  assert.equal(r.gaps, undefined)
  assert.equal(openGapMm(r), null)
  assert.equal(r.status, 'ok')
})

test('posts 4 mm short still carry the beam, but it says so and is not ok', () => {
  const r = run(frame(4)).results.get('beam')
  assert.deepEqual(r.gaps.map((g) => [g.kind, g.mm, g.bridged, g.by]).sort(), [['below', 4, false, 'postL'], ['below', 4, false, 'postR']])
  assert.equal(openGapMm(r), 4)
  assert.equal(r.status, 'warning', 'never green across a gap')
  // where: between the post top (696) and the beam bottom (700)
  assert.ok(Math.abs(r.gaps[0].at.y - 698) < 1e-6)
})

test('half a millimetre is rounding, not a gap', () => {
  const r = run(frame(0.4)).results.get('beam')
  assert.equal(r.gaps, undefined)
  assert.equal(r.status, 'ok')
})

test('an end resting against a board across air is a gap too', () => {
  const boards = [
    board('left', 18, 720, 300, [0, 0, 0]),
    board('right', 18, 720, 300, [586, 0, 0]),
    board('shelf', 564, 19, 300, [18, 400, 0])   // 4 mm short of the right panel
  ]
  const r = run(boards).results.get('shelf')
  assert.deepEqual(r.gaps.map((g) => [g.kind, g.mm, g.by]), [['end', 4, 'right']])
  assert.notEqual(r.status, 'ok')
})

test('a joint across air: a drawer runner bridges it on purpose (shown, no warning), a screw does not', () => {
  const side = board('side', 18, 720, 500, [0, 0, 0])
  const drawer = board('drawerSide', 12, 150, 450, [30.7, 100, 0])   // 12.7 mm beside the carcass side
  const joints = [{ boardA: 'side', boardB: 'drawerSide' }]
  const screwed = run([side, drawer], { joints }).results.get('drawerSide')
  const gap = screwed.gaps?.find((g) => g.kind === 'joint')
  assert.ok(gap, 'the joint across air is reported')
  assert.equal(Math.round(gap.mm * 10) / 10, 12.7)
  assert.equal(gap.bridged, false)
  const runner = run([side, { ...drawer, hardware: [{ hardwareId: 'kugelauszug-500', quantity: 1 }] }], {
    joints, customHardware: [{ id: 'kugelauszug-500', category: 'slides', name: 'Kugel-Vollauszug 500 mm' }]
  }).results.get('drawerSide')
  const g2 = runner.gaps?.find((g) => g.kind === 'joint')
  assert.equal(g2.bridged, true)
  assert.equal(openGapMm(runner), null, 'bridged on purpose: no warning')
})
