// Guards the hot spots of the 2D load simulation (services/static-sim.ts, static-fe.ts):
// a shelf on four shelf pins, a load placed near a corner, a cutout, a rail on edge
// between two posts, a plank lifting off a support, and the Board.loads trust boundary.
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
const { simulateStatics, faceToWorld, worldToFace } = await import('../../src/renderer/src/services/static-sim.ts')
const { GRAVITY } = await import('../../src/renderer/src/services/static-calc.ts')
const { getMaterialById, permanentMaterial } = await import('../../src/renderer/src/data/materials.ts')
const { validateBoard, MAX_LOADS_PER_BOARD } = await import('../../src/renderer/src/utils/validateProject.ts')

const board = (id, w, h, d, pos, extra = {}) => ({
  id, name: id, width: w, height: h, depth: d,
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff', ...extra
})
const weightN = (b) => (b.width * b.height * b.depth / 1e9) * getMaterialById(b.materialId).density * GRAVITY
const run = (boards, payloadKg = 20) => simulateStatics(boards, { payloadKg })
const near = (a, b, rel, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-9), `${msg} ${a} ≠ ${b}`)
/** Field value nearest to (a, b) mm from the board's min corner along field.axes. */
const at = (r, key, a, b) => {
  const f = r.field, s0 = f.a[0], t0 = f.b[0]
  const i = f.a.reduce((best, v, k) => (Math.abs(v - s0 - a) < Math.abs(f.a[best] - s0 - a) ? k : best), 0)
  const j = f.b.reduce((best, v, k) => (Math.abs(v - t0 - b) < Math.abs(f.b[best] - t0 - b) ? k : best), 0)
  return f[key][j * f.a.length + i]
}
const PINS = { hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 4 }] }

/** Two side panels on the floor and a 19 mm shelf between them at 400. */
const cabinet = (shelfExtra = {}, width = 564, depth = 300) => [
  board('left', 18, 720, depth, [0, 0, 0], { materialId: 'multiplex-birke' }),
  board('right', 18, 720, depth, [18 + width, 0, 0], { materialId: 'multiplex-birke' }),
  board('shelf', width, 19, depth, [18, 400, 0], shelfExtra)
]

test('a shelf on four shelf pins hands point loads to the side panels at the pin positions', () => {
  const dado = run(cabinet()).results
  const pins = run(cabinet(PINS)).results
  const shelf = pins.get('shelf')
  // two pins per side, 37 mm in from the front and back edges, a quarter of the load each
  assert.equal(shelf.reactions.length, 4)
  for (const r of shelf.reactions) {
    assert.ok([18, 582].includes(r.x) && [37, 263].includes(r.z) && r.y === 400, JSON.stringify(r))
    near(r.F, shelf.totalLoadN / 4, 1e-6, 'a quarter each')
  }
  assert.deepEqual(shelf.reactions.map((r) => r.to).sort(), ['left', 'left', 'right', 'right'])
  // the side panel is pressed down at the pins: its in-plane displacement peaks there
  const left = pins.get('left')
  assert.deepEqual(left.field.axes, ['z', 'y'])
  assert.ok(at(left, 'w', 37, 400) > 1.05 * at(left, 'w', 150, 400), 'pin vs between the pins')
  const dadoLeft = dado.get('left')
  near(at(dadoLeft, 'w', 37, 400), at(dadoLeft, 'w', 150, 400), 0.05, 'a dado line loads it evenly')
  // the shelf itself: its corners beyond the pins dip, and its maximum differs from the dado shelf
  assert.ok(at(shelf, 'w', 0, 0) > 1e-4, `corner ${at(shelf, 'w', 0, 0)}`)
  near(at(dado.get('shelf'), 'w', 0, 0), 0, 1e-9, 'dado: held along the end')
  assert.notEqual(shelf.uMax, dado.get('shelf').uMax)
  assert.ok(shelf.deflectionMm > dado.get('shelf').deflectionMm)
})

test('a 30 kg load placed near a corner moves the maximum there', () => {
  const plain = run(cabinet(), 0).results.get('shelf')
  assert.equal(plain.maxLocal.a, 282, 'own weight alone: mid-span')
  const loaded = run(cabinet({ loads: [{ id: 'l1', x: 30, z: 220, kg: 30, w: 60, d: 60 }] }), 0).results.get('shelf')
  assert.ok(loaded.maxLocal.a < 120 && loaded.maxLocal.b > 180, JSON.stringify(loaded.maxLocal))
  assert.ok(loaded.uMax > 3 * plain.uMax)
  near(loaded.placedKg, 30, 1e-9)
  near(loaded.totalLoadN, plain.totalLoadN + 30 * GRAVITY, 1e-9, 'it is carried')
  // a load placed on the face of a turned shelf lands where the face is now
  const turned = board('t', 400, 19, 200, [0, 0, 0], { rotation: { x: 0, y: 90, z: 0 } })
  const map = faceToWorld(turned)
  const p = map(50, 20)
  const back = worldToFace(turned, p)
  near(back.x, 50, 1e-9); near(back.z, 20, 1e-9)
})

test('a cutout raises the stress at its corners', () => {
  const plain = run(cabinet({}, 1000, 600), 30).results.get('shelf')
  const cut = run(cabinet({ cutouts: [{ id: 'c', x: 300, z: 200, width: 400, depth: 200 }] }, 1000, 600), 30).results.get('shelf')
  for (const [x, z] of [[300, 200], [700, 200], [300, 400], [700, 400]]) {
    assert.ok(at(cut, 'u', x, z) > 1.3 * at(plain, 'u', x, z), `corner ${x}/${z}: ${at(cut, 'u', x, z)} vs ${at(plain, 'u', x, z)}`)
  }
  // the hot spot is at the edge of the cutout, beside it where the moment has to pass
  const { a, b } = cut.maxLocal
  assert.ok(a >= 280 && a <= 720 && (Math.abs(b - 200) < 30 || Math.abs(b - 400) < 30 || b < 30 || b > 570), JSON.stringify(cut.maxLocal))
  assert.ok(cut.uMax > plain.uMax)
  // no material in the hole
  assert.equal(cut.field.cells.filter((c) => c === 0).length > 0, true)
})

test('a rail on edge between two posts bends in its plane like a beam', () => {
  const posts = [
    board('p1', 40, 720, 40, [0, 0, 0], { materialId: 'fichte' }),
    board('p2', 40, 720, 40, [840, 0, 0], { materialId: 'fichte' })
  ]
  const rail = board('rail', 800, 100, 20, [40, 600, 10], { materialId: 'multiplex-birke', loadKg: 50 })
  const r = run([...posts, rail]).results.get('rail')
  assert.equal(r.model, 'plane')
  assert.deepEqual(r.field.axes, ['x', 'y'])
  const q = (50 * GRAVITY + weightN(rail)) / 800
  const M = q * 800 ** 2 / 8, W = 20 * 100 ** 2 / 6
  near(r.uMax, M / W / permanentMaterial(getMaterialById('multiplex-birke')).bendingStrength, 0.08, 'σ = M/W')
  near(r.maxLocal.a, 400, 0.08, 'at mid-span')
  assert.ok(r.maxLocal.b < 1 || r.maxLocal.b > 99, 'at an edge fibre')
  // deflection: bending plus shear (Timoshenko), against span/300
  const E = permanentMaterial(getMaterialById('multiplex-birke')).eModul, G = E / 2.6, I = 20 * 100 ** 3 / 12   // final, creep included
  near(r.deflectionMm, 5 * q * 800 ** 4 / (384 * E * I) + q * 800 ** 2 / (8 * (5 / 6) * G * 20 * 100), 0.1, 'δ')
  assert.equal(r.spanMm, 800)
  // its ends hang on the posts
  near(r.reactions.reduce((s, x) => s + x.F, 0), r.totalLoadN, 1e-9)
  assert.deepEqual([...new Set(r.reactions.map((x) => x.to))].sort(), ['p1', 'p2'])
})

test('supports only push: a plank loaded in its first span lifts off the third rail', () => {
  const rails = [0, 580, 1160].map((x, k) => board(`r${k}`, 40, 400, 300, [x, 0, 0], { materialId: 'fichte' }))
  const plank = board('plank', 1200, 19, 300, [0, 400, 0], { loads: [{ id: 'p', x: 120, z: 100, kg: 60, w: 100, d: 100 }] })
  const sim = run([...rails, plank], 0).results
  const p = sim.get('plank')
  // nothing goes to the third rail; the plank rises above it
  assert.equal(p.reactions.filter((r) => r.to === 'r2').length, 0)
  near(sim.get('r2').totalLoadN, weightN(rails[2]), 1e-9, 'r2 carries only itself')
  assert.ok(at(p, 'w', 1180, 150) < 0, 'lifted')
  near(p.reactions.reduce((s, x) => s + x.F, 0), p.totalLoadN, 1e-9)
  // with a load in both spans it rests on all three
  const both = run([...rails, { ...plank, loads: [...plank.loads, { id: 'q', x: 900, z: 100, kg: 60, w: 100, d: 100 }] }], 0).results
  assert.ok(both.get('plank').reactions.some((r) => r.to === 'r2'))
})

test('a board whose supports cannot hold it is flagged: on one end only, or tipping off a post', () => {
  const side = board('side', 18, 720, 300, [0, 0, 0])
  assert.equal(run([side, board('c', 600, 19, 300, [18, 500, 0])]).results.get('c').status, 'unsupported')
  const post = board('post', 40, 500, 40, [500, 0, 130], { materialId: 'fichte' })
  assert.equal(run([post, board('plank', 1000, 19, 300, [0, 500, 0])]).results.get('plank').status, 'unsupported')
})

test('no load is lost: a payload on a covered carrier, a load placed over a cutout', () => {
  const sum = (r) => r.reactions.reduce((s, x) => s + x.F, 0)
  // a carrier with its own payload, covered all over by a stone layer of the same size
  const [l, rr] = cabinet().slice(0, 2)
  const carrier = board('carrier', 564, 12, 300, [18, 400, 0], { materialId: 'mdf', loadKg: 25 })
  const slate = board('slate', 564, 30, 300, [18, 412, 0], { materialId: 'schiefer' })
  const c = run([l, rr, carrier, slate]).results.get('carrier')
  near(c.payloadKg, 25, 1e-9)
  near(sum(c), c.totalLoadN, 1e-9, 'carrier hands down all it carries')
  // a 20 kg box placed right over a sink cutout bears on the edge of the hole
  const shelf = run(cabinet({
    cutouts: [{ id: 'c', x: 150, z: 60, width: 260, depth: 180 }],
    loads: [{ id: 'box', x: 230, z: 100, kg: 20, w: 100, d: 100 }]
  }), 0).results.get('shelf')
  near(shelf.placedKg, 20, 1e-9)
  near(sum(shelf), shelf.totalLoadN, 1e-9, 'the load over the hole reaches the supports')
})

test('Board.loads is validated at the trust boundary', () => {
  const raw = (loads) => ({ id: 'b', width: 600, height: 19, depth: 300, position: { x: 0, y: 0, z: 0 }, loads })
  const ok = { id: 'l', x: 10, z: 20, kg: 30, w: 100, d: 100 }
  assert.deepEqual(validateBoard(raw([ok]), 'b').loads, [ok])
  assert.equal(validateBoard(raw(undefined), 'b').loads, undefined)
  assert.equal(validateBoard(raw('x'), 'b').loads, undefined)
  const bad = [
    { ...ok, kg: -1 }, { ...ok, kg: 1001 }, { ...ok, kg: Number.NaN }, { ...ok, x: Infinity }, { ...ok, w: 0 },
    { ...ok, x: 550 }, { ...ok, z: -5 }, { ...ok, d: 400 }, { ...ok, kg: '30' }, null, 'load'
  ]
  assert.deepEqual(validateBoard(raw([...bad, ok]), 'b').loads, [ok], 'only the valid one stays')
  const many = Array.from({ length: MAX_LOADS_PER_BOARD + 5 }, (_, k) => ({ ...ok, id: `l${k}` }))
  assert.equal(validateBoard(raw(many), 'b').loads.length, MAX_LOADS_PER_BOARD)
  // a missing id is made up
  assert.ok(typeof validateBoard(raw([{ x: 0, z: 0, kg: 5, w: 50, d: 50 }]), 'b').loads[0].id === 'string')
})
