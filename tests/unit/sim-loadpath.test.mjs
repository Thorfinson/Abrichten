// Guards services/static-sim.ts, the 2D load simulation behind the static heat map, the
// static summary and the AI context: how loads find their way down (shelf between side
// panels, worktop on two cabinets, a box on a shelf), boards without support, rotated
// boards, solid wood across the grain, per-board payloads, appliance placeholders,
// stacked layers, and the Board.loadKg trust boundary. The hot spots (pins, placed
// loads, cutouts, lift-off) are in sim-hotspots.test.mjs.
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
const { simulateStatics } = await import('../../src/renderer/src/services/static-sim.ts')
const { GRAVITY } = await import('../../src/renderer/src/services/static-calc.ts')
const { getMaterialById } = await import('../../src/renderer/src/data/materials.ts')
const { serializeProjectContext } = await import('../../src/renderer/src/services/chat.ts')
const { validateBoard, MAX_LOAD_KG } = await import('../../src/renderer/src/utils/validateProject.ts')

const board = (id, w, h, d, pos, extra = {}) => ({
  id, name: id, width: w, height: h, depth: d,
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff', ...extra
})
const weightN = (b) => (b.width * b.height * b.depth / 1e9) * getMaterialById(b.materialId).density * GRAVITY
const run = (boards, payloadKg = 20) => simulateStatics(boards, { payloadKg })
const near = (a, b, rel = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-9), `${msg} ${a} ≠ ${b}`)
/** Field value nearest to (a, b) mm from the board's min corner along field.axes. */
const at = (r, key, a, b) => {
  const f = r.field, s0 = f.a[0], t0 = f.b[0]
  const i = f.a.reduce((best, v, k) => (Math.abs(v - s0 - a) < Math.abs(f.a[best] - s0 - a) ? k : best), 0)
  const j = f.b.reduce((best, v, k) => (Math.abs(v - t0 - b) < Math.abs(f.b[best] - t0 - b) ? k : best), 0)
  return f[key][j * f.a.length + i]
}

/** Two side panels on the floor, 564 mm apart, and a 19 mm shelf between them at 400. */
const cabinet = (x = 0, shelfExtra = {}) => [
  board(`left${x}`, 18, 720, 300, [x, 0, 0], { materialId: 'multiplex-birke' }),
  board(`right${x}`, 18, 720, 300, [x + 582, 0, 0], { materialId: 'multiplex-birke' }),
  board(`shelf${x}`, 564, 19, 300, [x + 18, 400, 0], shelfExtra)
]

test('a shelf between two side panels: a plate simply supported at its ends, each side gets half', () => {
  const boards = cabinet()
  const sim = run(boards)
  const shelf = sim.results.get('shelf0')
  assert.equal(shelf.kind, 'horizontal')
  assert.equal(shelf.model, 'plate')
  assert.deepEqual(shelf.field.axes, ['x', 'z'])
  const q = (20 * GRAVITY + weightN(boards[2])) / 564
  const E = getMaterialById('spanplatte').eModul, I = 300 * 19 ** 3 / 12, W = 300 * 19 ** 2 / 6
  // a plate free along its front and back edges is the beam, a little softer at the free
  // edges (anticlastic bending, ν = 0.3): within a few per cent of the beam formulas
  near(shelf.deflectionMm, 5 * q * 564 ** 4 / (384 * E * I), 0.04, 'δ ≈ 5qL⁴/384EI')
  near(shelf.uMax, (q * 564 ** 2 / 8) / W / 11, 0.04, 'u ≈ M/W/f')
  near(shelf.maxLocal.a, 282, 1e-9, 'at mid-span')
  assert.equal(shelf.maxAt.y, 419, 'on the top face')
  near(shelf.totalLoadN, 20 * GRAVITY + weightN(boards[2]), 1e-9)
  for (const side of ['left0', 'right0']) {
    const r = sim.results.get(side)
    assert.equal(r.kind, 'vertical')
    near(r.totalLoadN, weightN(boards[0]) + shelf.totalLoadN / 2, 1e-6, `${side} carries half`)
  }
  // a 2D field over the face (≥ 20 × 10 nodes); the sag field counts span/200 as 1
  assert.ok(shelf.field.a.length >= 20 && shelf.field.b.length >= 10, `${shelf.field.a.length} × ${shelf.field.b.length}`)
  assert.equal(shelf.field.u.length, shelf.field.a.length * shelf.field.b.length)
  near(shelf.sagMax, shelf.deflectionMm / (564 / 200), 1e-6, 'sag at mid-span')
  assert.equal(shelf.spanMm, 564)
  // the shelf rests on both end lines: everything it hands down goes to the two sides
  near(shelf.reactions.reduce((s, x) => s + x.F, 0), shelf.totalLoadN, 1e-9, 'Σ reactions')
  assert.deepEqual([...new Set(shelf.reactions.map((x) => x.to))].sort(), ['left0', 'right0'])
})

test('a worktop on two cabinets spans between them and splits its load evenly', () => {
  const left = cabinet(0), right = cabinet(1400)
  const top = (x) => board(`top${x}`, 564, 19, 300, [x + 18, 701, 0])
  const worktop = board('worktop', 2000, 38, 300, [0, 720, 0])
  const boards = [...left, ...right, top(0), top(1400), worktop]
  const sim = run(boards)
  const w = sim.results.get('worktop')
  assert.equal(w.model, 'plate')
  assert.ok(w.spanMm > 750 && w.spanMm < 900, `span ${w.spanMm}`)
  assert.ok(w.uMax > 0)
  // tops are covered by the worktop: no payload of their own
  assert.equal(sim.results.get('top0').payloadKg, 0)
  // symmetric: both cabinets carry the same; nothing is lost on the way down
  const carried = (x) => sim.results.get(`left${x}`).totalLoadN + sim.results.get(`right${x}`).totalLoadN
  near(carried(0), carried(1400), 1e-6, 'symmetric')
  const own = boards.reduce((s, b) => s + weightN(b), 0)
  const payload = (20 + 20 + 20) * GRAVITY // two shelves and the worktop
  near(carried(0) + carried(1400), own + payload, 1e-6, 'load reaches the floor')
})

test('a box standing on a shelf hands its weight and payload to the shelf', () => {
  const boards = cabinet()
  const box = [
    board('boxL', 12, 150, 200, [100, 419, 50]),
    board('boxR', 12, 150, 200, [288, 419, 50]),
    board('boxTop', 200, 12, 200, [100, 569, 50])
  ]
  const alone = run(boards).results.get('shelf0')
  const sim = run([...boards, ...box])
  const shelf = sim.results.get('shelf0')
  const boxN = box.reduce((s, b) => s + weightN(b), 0) + 20 * GRAVITY // the box top gets the payload
  near(shelf.totalLoadN, alone.totalLoadN + boxN, 1e-6)
  assert.ok(shelf.uMax > alone.uMax)
  // the box sides stand on the shelf: vertical members with a support
  assert.equal(sim.results.get('boxL').status, 'ok')
})

test('a board without support is flagged, not solved; a lone side panel is wall-hung', () => {
  const floating = board('floating', 600, 19, 300, [0, 500, 0])
  const sim = run([floating])
  assert.equal(sim.results.get('floating').status, 'unsupported')
  assert.equal(sim.unsupported, 1)
  // held at one end only: it would tip
  const side = board('side', 18, 720, 300, [0, 0, 0])
  const cantilever = board('cantilever', 600, 19, 300, [18, 500, 0])
  assert.equal(run([side, cantilever]).results.get('cantilever').status, 'unsupported')
  // resting on one narrow post near its end: it tips
  const post = board('post', 40, 500, 40, [500, 0, 130], { materialId: 'fichte' })
  const plank = board('plank', 1000, 19, 300, [0, 500, 0])
  assert.equal(run([post, plank]).results.get('plank').status, 'unsupported')
  // a side panel hanging in the air: not checked, not red
  const hung = run([board('hung', 18, 720, 300, [0, 500, 0])]).results.get('hung')
  assert.equal(hung.status, 'wallHung')
})

test('a rotated board is simulated as it lies after the rotation', () => {
  const plain = cabinet()
  // 564 × 300 × 19 turned 90° about X lies as 564 × 19 × 300 (rotation is about the centre)
  const turned = [...plain.slice(0, 2), board('shelf0', 564, 300, 19, [18, 400 + 9.5 - 150, 150 - 9.5], { rotation: { x: 90, y: 0, z: 0 } })]
  const a = run(plain).results.get('shelf0')
  const b = run(turned).results.get('shelf0')
  near(b.uMax, a.uMax, 1e-6)
  near(b.deflectionMm, a.deflectionMm, 1e-6)
  assert.deepEqual(b.maxLocal, a.maxLocal)
})

test('solid wood bent across the grain: an orthotropic plate, E/30 and strength/60 across', () => {
  const along = cabinet(0, { materialId: 'buche', grainDirection: 'width' })
  const across = cabinet(0, { materialId: 'buche', grainDirection: 'depth' })
  const a = run(along).results.get('shelf0')
  const c = run(across).results.get('shelf0')
  // the stiff direction runs between the free edges, so it barely helps: about E/30
  near(c.deflectionMm / a.deflectionMm, 30, 0.05)
  // stress across the grain against f/60, combined with the small stresses along it
  assert.ok(c.uMax / a.uMax > 45 && c.uMax / a.uMax < 65, `u ratio ${c.uMax / a.uMax}`)
  assert.equal(c.status, 'critical')
})

test('payload: Board.loadKg overrides the global payload, utilisation is linear in the load', () => {
  const base = run(cabinet(), 0).results.get('shelf0')
  const g20 = run(cabinet(), 20).results.get('shelf0')
  const own40 = run(cabinet(0, { loadKg: 40 }), 20).results.get('shelf0')
  const self = base.uMax
  near(own40.uMax - self, 2 * (g20.uMax - self), 1e-6)
  assert.equal(own40.payloadKg, 40)
  // an explicit 0 means no payload
  near(run(cabinet(0, { loadKg: 0 }), 20).results.get('shelf0').uMax, self, 1e-9)
})

test('appliance placeholders (thick steel / glass bodies) are not rated and weigh like appliances', () => {
  const oven = board('oven', 600, 850, 600, [0, 0, 0], { materialId: 'stahl' })
  const shelfOnOven = board('onOven', 600, 19, 600, [0, 850, 0])
  const sim = run([oven, shelfOnOven], 0)
  assert.equal(sim.results.has('oven'), false)
  // a steel sheet stays a rated part
  const sheet = board('sheet', 600, 2, 300, [0, 0, 0], { materialId: 'stahl' })
  assert.equal(run([sheet]).results.has('sheet'), true)
  // an oven standing on a shelf adds ~60 kg, not 2.4 t of solid steel
  const boards = [...cabinet(), board('ovenOnShelf', 500, 300, 280, [50, 419, 10], { materialId: 'stahl' })]
  const shelf = run(boards, 0).results.get('shelf0')
  const ovenKg = (500 * 300 * 280 / 1e9) * 200
  near(shelf.totalLoadN, weightN(boards[2]) + ovenKg * GRAVITY, 1e-6)
})

test('a stiff layer on a thin carrier board bends with it: the carrier is not rated alone', () => {
  // 12 mm MDF carrier between two sides; a 30 mm slate lies on it, clear of the sides
  const sides = cabinet().slice(0, 2)
  const carrier = board('carrier', 564, 12, 300, [18, 400, 0], { materialId: 'mdf' })
  const slate = board('slate', 540, 30, 300, [30, 412, 0], { materialId: 'schiefer' })
  const sim = run([...sides, carrier, slate])
  const c = sim.results.get('carrier'), s = sim.results.get('slate')
  // without the slate's stiffness the carrier would take the slate's weight and payload alone
  const slateKg = weightN(slate) / GRAVITY
  const alone = run([...sides, { ...carrier, loadKg: slateKg + 20 }]).results.get('carrier')
  near(c.totalLoadN, alone.totalLoadN, 1e-6, 'same load')
  assert.ok(alone.status === 'critical' && c.status === 'ok', `${alone.status} / ${c.status}`)
  assert.ok(c.uMax < alone.uMax / 5, `carrier ${c.uMax} vs alone ${alone.uMax}`)
  // mid-span: the stiff slate takes most of the moment (at the slate's ends the carrier is alone)
  assert.ok(at(s, 'u', 270, 150) > 5 * at(c, 'u', 282, 150), `slate ${at(s, 'u', 270, 150)} vs carrier ${at(c, 'u', 282, 150)}`)
  assert.equal(s.model, 'plate')
  near(at(s, 'w', 270, 150), at(c, 'w', 282, 150), 0.01, 'they sag together')
})

test('the AI context describes critical and unsupported boards with utilisation and location', () => {
  const project = (boards) => ({
    id: 'p', name: 'p', displayUnit: 'mm', language: 'de', createdAt: '', updatedAt: '',
    assemblies: [{ id: 'a', name: 'a', visible: true, joints: [], boards }]
  })
  const weak = cabinet(0, { width: 564, height: 8, materialId: 'mdf' })
  const ctx = serializeProjectContext(project([...weak, board('floating', 400, 19, 300, [1000, 900, 0])]), 'de')
  assert.match(ctx, /Statik-Warnungen \(Lastsimulation, 20 kg/)
  assert.match(ctx, /"shelf0": Auslastung \d+ % \(kritisch\) bei 282 mm von links \/ 300 mm von hinten, Durchbiegung [\d.]+ mm \(zulässig 1\.9 mm, Spannweite 564 mm\)/)
  assert.match(ctx, /Mindestdicke \d+ mm \(aktuell 8 mm\)/)
  assert.match(ctx, /"floating": kein ausreichendes Auflager/)
  assert.doesNotMatch(ctx, /"left0":/)
  // a sound cabinet produces no warnings; the payload argument is used
  assert.doesNotMatch(serializeProjectContext(project(cabinet(0, { materialId: 'multiplex-birke' })), 'de'), /Statik-Warnungen/)
  assert.match(serializeProjectContext(project(weak), 'en', 5), /5 kg payload per shelf/)
})

test('Board.loadKg is validated at the trust boundary', () => {
  const raw = (loadKg) => ({ id: 'b', width: 600, height: 19, depth: 300, position: { x: 0, y: 0, z: 0 }, loadKg })
  assert.equal(validateBoard(raw(35), 'b').loadKg, 35)
  assert.equal(validateBoard(raw(0), 'b').loadKg, 0)
  assert.equal(validateBoard(raw(MAX_LOAD_KG), 'b').loadKg, MAX_LOAD_KG)
  for (const bad of [-1, MAX_LOAD_KG + 1, Number.NaN, Infinity, '20', null]) {
    assert.equal(validateBoard(raw(bad), 'b').loadKg, undefined, String(bad))
  }
})
