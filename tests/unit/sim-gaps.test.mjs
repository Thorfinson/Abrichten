// Guards the rule for air between boards in the statics (services/static-sim.ts, Wunschliste
// "Statik Stufe 1, Regel neu gefasst", 23.11.): a gap of 0.5 mm or more is a support or a
// connection only when something explains it — a glued joint up to the glue bed (5 mm), or
// hardware on one of the two boards whose bridgesMm range holds the width. Then its width is
// shown (BoardStatic.gaps), no warning. Anything else is air (BoardStatic.air): it does not
// count, the board is solved without it, and a joint across air is reported (jointAir).
// It replaces the earlier rule (counted anyway, never rated ok), which hid the true state.
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
const { simulateStatics, jointAir, clearStaticCache } = await import('../../src/renderer/src/services/static-sim.ts')
const { bridgingHardware, cleanBridgesMm } = await import('../../src/renderer/src/data/hardware.ts')
const { validateProject } = await import('../../src/renderer/src/utils/validateProject.ts')
const { serializeProjectContext } = await import('../../src/renderer/src/services/chat.ts')

const board = (id, w, h, d, pos, extra = {}) => ({
  id, name: id, width: w, height: h, depth: d,
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'multiplex-birke', color: '#fff', ...extra
})
const joint = (a, b, type = 'screw') => ({ id: `${a}-${b}`, type, boardA: a, boardB: b, position: { x: 0, y: 0, z: 0 }, fasteners: [] })
/** A beam on two posts; the posts end `gap` mm below it. */
const frame = (gap) => [
  board('postL', 56, 700 - gap, 36, [0, 0, 0], { materialId: 'fichte' }),
  board('postR', 56, 700 - gap, 36, [944, 0, 0], { materialId: 'fichte' }),
  board('beam', 1000, 56, 36, [0, 700, 0], { materialId: 'fichte' })
]
const run = (boards, opts = {}) => { clearStaticCache(); return simulateStatics(boards, { payloadKg: 0, ...opts }) }
const handed = (r, to) => r.reactions.filter((x) => x.to === to).reduce((s, x) => s + x.F, 0)
const runner = (range) => [{ id: 'runner', name: 'Kugel-Vollauszug', nameEn: 'Runner', category: 'slides', unitPrice: 9, ...(range ? { bridgesMm: range } : {}) }]

test('posts that touch the beam carry it without a remark', () => {
  const r = run(frame(0)).results.get('beam')
  assert.equal(r.gaps, undefined)
  assert.equal(r.air, undefined)
  assert.equal(r.status, 'ok')
})

test('half a millimetre is rounding: the posts still touch', () => {
  const r = run(frame(0.4)).results.get('beam')
  assert.equal(r.air, undefined)
  assert.equal(r.status, 'ok')
})

test('posts 4 mm short do not carry the beam: air, shown with its width, and the beam has no support', () => {
  const r = run(frame(4)).results.get('beam')
  assert.deepEqual(r.air.map((a) => [a.kind, a.mm, a.by]).sort(), [['below', 4, 'postL'], ['below', 4, 'postR']])
  assert.equal(r.gaps, undefined)
  assert.equal(r.status, 'unsupported', 'the true state, not a yellow "maybe"')
  // where: between the post top (696) and the beam bottom (700)
  assert.ok(Math.abs(r.air[0].at.y - 698) < 1e-6)
  assert.equal(jointAir(r), null, 'no joint claims to bridge it')
})

test('a glued joint fills a gap up to the glue bed (5 mm): it carries, its width is shown, no warning', () => {
  const glued = [joint('beam', 'postL', 'glued'), joint('beam', 'postR', 'glued')]
  const r = run(frame(3), { joints: glued }).results.get('beam')
  assert.equal(r.air, undefined)
  assert.deepEqual(r.gaps.map((g) => [g.mm, g.because]).sort(), [[3, 'glued'], [3, 'glued']])
  assert.equal(r.status, 'ok')
  // beyond the glue bed it is air, and the glued joint across it is reported
  const wide = run(frame(6), { joints: glued }).results.get('beam')
  assert.equal(wide.status, 'unsupported')
  assert.deepEqual(wide.air.map((a) => [a.kind, a.mm, a.jointType]).sort(), [['joint', 6, 'glued'], ['joint', 6, 'glued']])
  // a screw explains nothing: 3 mm of air under a screwed beam carries nothing either
  const screwed = run(frame(3), { joints: [joint('beam', 'postL'), joint('beam', 'postR')] }).results.get('beam')
  assert.equal(screwed.status, 'unsupported')
  assert.equal(jointAir(screwed).jointType, 'screw')
  assert.equal(jointAir(screwed).mm, 3)
})

test('an end against a board across air is no support: the shelf rests on the other end only', () => {
  const boards = [
    board('left', 18, 720, 300, [0, 0, 0]),
    board('right', 18, 720, 300, [586, 0, 0]),
    board('shelf', 564, 19, 300, [18, 400, 0])   // 4 mm short of the right panel
  ]
  const r = run(boards, { payloadKg: 5 }).results.get('shelf')
  assert.deepEqual(r.air.map((a) => [a.kind, a.mm, a.by]), [['end', 4, 'right']])
  assert.equal(handed(r, 'right'), 0, 'nothing goes into the panel it does not touch')
  assert.notEqual(r.status, 'ok')
})

test('a drawer side on a runner: only hardware that says it bridges 12.7 mm explains the gap', () => {
  const side = board('side', 18, 720, 500, [0, 0, 0])
  const drawer = board('drawerSide', 12, 150, 450, [30.7, 100, 0], { hardware: [{ hardwareId: 'runner', quantity: 1 }] })
  const joints = [joint('side', 'drawerSide')]
  // the runner with its range: the screwed joint holds across the 12.7 mm, shown, no remark
  const ok = run([side, drawer], { joints, customHardware: runner([12.5, 13]) }).results.get('drawerSide')
  assert.equal(ok.air, undefined)
  const g = ok.gaps.find((x) => x.kind === 'joint')
  assert.equal(g.because, 'hardware')
  assert.equal(g.hardwareId, 'runner')
  assert.equal(Math.round(g.mm * 10) / 10, 12.7)
  assert.equal(jointAir(ok), null)
  // a slide without a range (or with one that does not hold 12.7 mm) explains nothing: a
  // screw across 12.7 mm of air is reported and does not connect
  for (const hw of [runner(undefined), runner([10, 12])]) {
    const r = run([side, drawer], { joints, customHardware: hw }).results.get('drawerSide')
    assert.equal(r.gaps, undefined)
    assert.equal(jointAir(r).jointType, 'screw')
    assert.equal(Math.round(jointAir(r).mm * 10) / 10, 12.7)
    assert.equal(r.status, 'unsupported')
  }
  // without the hardware on either board, nothing explains it either
  const bare = run([side, { ...drawer, hardware: [] }], { joints, customHardware: runner([12.5, 13]) }).results.get('drawerSide')
  assert.equal(jointAir(bare).mm > 12, true)
})

test('a joint between boards far apart is reported, not silently dropped (the 15 mm allowance is gone)', () => {
  const a = board('a', 18, 720, 300, [0, 0, 0])
  const b = board('b', 18, 720, 300, [118, 0, 0])   // 100 mm of air between them
  const sim = run([a, b], { joints: [joint('a', 'b', 'dowel')] })
  for (const id of ['a', 'b']) {
    const r = sim.results.get(id)
    assert.equal(jointAir(r).jointType, 'dowel')
    assert.equal(jointAir(r).mm, 100)
  }
})

test('the range a hardware item bridges: one helper, cleaned on load and in the store', () => {
  const hw = runner([12.5, 13])
  const b = { hardware: [{ hardwareId: 'runner', quantity: 2 }] }
  assert.equal(bridgingHardware(b, 12.7, { customHardware: hw }), 'runner')
  assert.equal(bridgingHardware(b, 12.5, { customHardware: hw }), 'runner', 'inclusive')
  assert.equal(bridgingHardware(b, 13, { customHardware: hw }), 'runner', 'inclusive at the top too')
  assert.equal(bridgingHardware(b, 13.2, { customHardware: hw }), undefined)
  assert.equal(bridgingHardware({ hardware: [{ hardwareId: 'runner', quantity: 0 }] }, 12.7, { customHardware: hw }), undefined, 'none fitted')
  // a catalogue item has no range of its own; the project gives it one (Project.hardwareBridges)
  const pin = { hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 4 }] }
  assert.equal(bridgingHardware(pin, 1, {}), undefined)
  assert.equal(bridgingHardware(pin, 1, { hardwareBridges: { 'shelf-pin-5mm': [0, 3] } }), 'shelf-pin-5mm')
  assert.deepEqual(cleanBridgesMm([13, 12.5]), [12.5, 13], 'sorted')
  for (const bad of [[-1, 2], [1, 500], ['12', 13], [12], null, 'x', [NaN, 1]]) assert.equal(cleanBridgesMm(bad), undefined, String(bad))
  const p = validateProject({
    id: 'p', name: 'p', assemblies: [],
    customHardware: [{ id: 'h1', name: 'A', category: 'slides', unitPrice: 1, bridgesMm: [13, 12.5] }, { id: 'h2', name: 'B', category: 'slides', unitPrice: 1, bridgesMm: [1, 'x'] }]
  })
  assert.deepEqual(p.customHardware[0].bridgesMm, [12.5, 13])
  assert.equal('bridgesMm' in p.customHardware[1], false, 'an unusable range is dropped')
  const q = validateProject({ id: 'p', name: 'p', assemblies: [], hardwareBridges: { 'shelf-pin-5mm': [3, 0], bad: [1, 'x'], also: 7 } })
  assert.deepEqual(q.hardwareBridges, { 'shelf-pin-5mm': [0, 3] })
  assert.equal(validateProject({ id: 'p', name: 'p', assemblies: [], hardwareBridges: { bad: null } }).hardwareBridges, undefined)
  assert.equal(validateProject({ id: 'p', name: 'p', assemblies: [], hardwareBridges: [[1, 2]] }).hardwareBridges, undefined, 'a list is no map')
})

test('the AI is told about air: why a part has no support, and a joint that connects nothing', () => {
  const project = (boards, joints = []) => ({
    id: 'p', name: 'p', displayUnit: 'mm', language: 'de', createdAt: '', updatedAt: '',
    // numbered parts: the AI names them by their label, as every list does
    assemblies: [{ id: 'a', name: 'Rahmen', shortName: 'Rahmen', visible: true, joints, boards: boards.map((b, i) => ({ ...b, partNo: i + 1 })) }]
  })
  const ctx = serializeProjectContext(project(frame(4)), 'de')
  assert.match(ctx, /"Rahmen \d+ beam": kein ausreichendes Auflager[^\n]*Luft 4\.0 mm zu "Rahmen \d+ postL", kein Auflager/)
  const side = board('side', 18, 720, 500, [0, 0, 0])
  const drawer = board('drawerSide', 12, 150, 450, [30.7, 100, 0])
  const ctx2 = serializeProjectContext(project([side, drawer], [joint('side', 'drawerSide')]), 'de')
  assert.match(ctx2, /Verbindung vom Typ screw über 12\.7 mm Luft zu "Rahmen \d+ (side|drawerSide)" – verbindet nicht/)
})

test('glue explains only the gap of the glued pair, and only up to the glue bed', () => {
  // the beam is glued to postL only: postR's 3 mm stays air
  const r = run(frame(3), { joints: [joint('beam', 'postL', 'glued'), joint('beam', 'postR')] }).results.get('beam')
  assert.deepEqual(r.gaps.map((g) => [g.by, g.because]), [['postL', 'glued']])
  assert.deepEqual(r.air.map((a) => [a.by, a.kind, a.jointType]), [['postR', 'joint', 'screw']])
  // a glued joint between other boards explains nothing here
  const other = [...frame(3), board('x', 100, 18, 36, [2000, 0, 0]), board('y', 100, 18, 36, [2000, 18, 0])]
  const r2 = run(other, { joints: [joint('x', 'y', 'glued')] }).results.get('beam')
  assert.equal(r2.status, 'unsupported')
  // 5.5 mm is beyond the glue bed
  const wide = run(frame(5.5), { joints: [joint('beam', 'postL', 'glued'), joint('beam', 'postR', 'glued')] }).results.get('beam')
  assert.equal(wide.status, 'unsupported')
})

test('a joint replaces the contact of its pair: one note per pair, not two', () => {
  const r = run(frame(3), { joints: [joint('beam', 'postL'), joint('beam', 'postR')] }).results.get('beam')
  assert.deepEqual(r.air.map((a) => [a.by, a.kind]).sort(), [['postL', 'joint'], ['postR', 'joint']])
})

test('hardware on either board of a joint explains the gap', () => {
  const side = board('side', 18, 720, 500, [0, 0, 0], { hardware: [{ hardwareId: 'runner', quantity: 1 }] })
  const drawer = board('drawerSide', 12, 150, 450, [30.7, 100, 0])
  for (const joints of [[joint('side', 'drawerSide')], [joint('drawerSide', 'side')]]) {
    const r = run([side, drawer], { joints, customHardware: runner([12.5, 13]) }).results.get('drawerSide')
    assert.equal(r.air, undefined)
    assert.equal(r.gaps[0].hardwareId, 'runner')
  }
})

test('the limits hold against float noise in the positions (0.5 mm, 5 mm glue bed)', () => {
  // carcass top at 860.3 + 38.4 = 898.7 (in floats 898.6999…), slate 5.0 mm above on a glued bed
  const carcass = board('carcass', 600, 860.3, 600, [0, 0, 0])
  const base = board('base', 600, 38.4, 600, [0, 860.3, 0])
  const slate = board('slate', 600, 20, 600, [0, 903.7, 0], { materialId: 'fichte' })   // 903.7 − 898.6999… = 5.0000000000001
  const r = run([carcass, base, slate], { joints: [joint('slate', 'base', 'glued')] }).results.get('slate')
  assert.equal(r.air, undefined, String(slate.position.y - (base.position.y + base.height)))
  assert.equal(r.gaps[0].because, 'glued')
  // exactly 0.5 mm in floats is still touching
  const shelf = board('shelf', 600, 18, 600, [0, 899.2, 0])   // 899.2 − 898.6999… = 0.5000000000001
  const r2 = run([carcass, base, shelf]).results.get('shelf')
  assert.equal(r2.air, undefined)
  assert.equal(r2.status, 'ok')
})

test('catalogue shelf pins explain an end gap once the project gives them a range', () => {
  const pins = { hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 4 }] }
  const boards = [
    board('left', 18, 720, 300, [0, 0, 0]),
    board('right', 18, 720, 300, [584, 0, 0]),
    board('shelf', 564, 19, 300, [19, 400, 0], pins)   // 1 mm short at each end
  ]
  const without = run(boards, { payloadKg: 10 }).results.get('shelf')
  assert.equal(without.status, 'unsupported')
  assert.deepEqual(without.air.map((a) => [a.kind, a.mm]).sort(), [['end', 1], ['end', 1]])
  const withRange = run(boards, { payloadKg: 10, hardwareBridges: { 'shelf-pin-5mm': [0, 3] } }).results.get('shelf')
  assert.equal(withRange.air, undefined)
  assert.notEqual(withRange.status, 'unsupported')
  assert.deepEqual(withRange.gaps.map((g) => [g.kind, g.hardwareId]), [['end', 'shelf-pin-5mm'], ['end', 'shelf-pin-5mm']])
})

test('an appliance resting only on air does not lose its weight silently: it is without support', () => {
  const shelf = board('shelf', 600, 18, 560, [0, 400, 0])
  const sides = [board('l', 18, 900, 560, [-18, 0, 0]), board('r', 18, 900, 560, [600, 0, 0])]
  const oven = board('oven', 595, 595, 548, [2, 420, 0], { materialId: 'stahl', weightKg: 38 })   // 2 mm above the shelf
  const sim = run([...sides, shelf, oven], { payloadKg: 0 })
  const r = sim.results.get('oven')
  assert.equal(r.status, 'unsupported')
  assert.deepEqual(r.air.map((a) => [a.kind, a.mm, a.by]), [['below', 2, 'shelf']])
  // an appliance standing on it is not rated and hands its weight on, as before
  const on = run([...sides, shelf, { ...oven, position: { x: 2, y: 418, z: 0 } }], { payloadKg: 0 })
  assert.equal(on.results.get('oven'), undefined)
  assert.ok(on.results.get('shelf').totalLoadN > r.totalLoadN * 0 + 300, 'the shelf carries the oven')
})

test('a glue bed of 4 mm carries a rail on edge too (the joint acts on the rail, not in the air)', () => {
  const posts = [board('pL', 56, 696, 36, [0, 0, 0], { materialId: 'fichte' }), board('pR', 56, 696, 36, [944, 0, 0], { materialId: 'fichte' })]
  const rail = board('rail', 1000, 56, 36, [0, 700, 0], { materialId: 'fichte' })   // on edge: 56 high, 36 deep
  const r = run([...posts, rail], { joints: [joint('rail', 'pL', 'glued'), joint('rail', 'pR', 'glued')] }).results.get('rail')
  assert.notEqual(r.status, 'unsupported')
  assert.equal(r.gaps.length, 2)
})

test('levelling shims with a range explain a gap up to 5 mm, also to the floor', () => {
  const shims = { hardware: [{ hardwareId: 'shim', quantity: 4 }] }
  const hw = [{ id: 'shim', name: 'Unterlegplättchen', nameEn: 'Shims', category: 'other', unitPrice: 0.4, bridgesMm: [1, 5] }]
  const base = board('base', 600, 100, 560, [0, 0, 0])
  const box = board('box', 600, 18, 560, [0, 103, 0], shims)   // 3 mm above the base
  const r = run([base, box], { customHardware: hw }).results.get('box')
  assert.notEqual(r.status, 'unsupported')
  assert.equal(r.gaps[0].mm, 3)
  const onFloor = run([board('plinth', 600, 100, 60, [0, 3, 0], shims)], { customHardware: hw }).results.get('plinth')
  assert.notEqual(onFloor.status, 'unsupported')
  assert.deepEqual(onFloor.gaps.map((g) => [g.kind, g.mm, g.by]), [['floor', 3, null]])
  // without the shims' range the 3 mm are air
  const bare = run([base, { ...box, hardware: [] }], { customHardware: hw }).results.get('box')
  assert.equal(bare.status, 'unsupported')
  assert.deepEqual(bare.air.map((a) => [a.kind, a.mm]), [['below', 3]])
})

test('a range has no direction: a runner beside a drawer side does not make it rest on what is 12.7 mm below or above', () => {
  const hw = runner([12.5, 13])
  const onRunner = { hardware: [{ hardwareId: 'runner', quantity: 1 }] }
  // a drawer side 12.7 mm above the carcass bottom, and 12.7 mm above the floor
  const bottom = board('bottom', 600, 18, 500, [0, 0, 0])
  const side = board('side', 12, 150, 450, [100, 30.7, 0], onRunner)
  const r = run([bottom, side], { customHardware: hw }).results.get('side')
  assert.equal(r.gaps, undefined)
  assert.equal(r.status, 'unsupported')
  const above = run([board('side', 12, 150, 450, [100, 12.7, 0], onRunner)], { customHardware: hw }).results.get('side')
  assert.equal(above.gaps, undefined, 'no stand on the floor across 12.7 mm')
  // a rail 12.7 mm above the drawer side does not rest on it
  const rail = board('rail', 600, 20, 40, [0, 30.7 + 150 + 12.7, 0])
  const r2 = run([bottom, side, rail], { customHardware: hw }).results.get('rail')
  assert.ok(!(r2.gaps ?? []).some((g) => g.by === 'side'))
})

test('the cached solution knows whether a part rested on air (appliance first far above, then 2 mm above)', () => {
  const sides = [board('l', 18, 900, 560, [-18, 0, 0]), board('r', 18, 900, 560, [600, 0, 0])]
  const oven = board('oven', 595, 595, 548, [2, 420, 0], { materialId: 'stahl', weightKg: 38 })
  clearStaticCache()
  const far = simulateStatics([...sides, board('shelf', 600, 18, 560, [0, 390, 0]), oven], { payloadKg: 0 })   // 12 mm below
  assert.equal(far.results.get('oven'), undefined)
  const near = simulateStatics([...sides, board('shelf', 600, 18, 560, [0, 400, 0]), oven], { payloadKg: 0 })   // 2 mm below, cache kept
  assert.equal(near.results.get('oven')?.status, 'unsupported')
  assert.equal(near.unsupported, 1)
})

test('a runner on a board makes it rest on nothing beside it: an end across 12.7 mm is no contact', () => {
  // a drawer bottom with a runner (wrongly) on it, 12.7 mm from each carcass side, no joints
  const boards = [
    board('wallL', 19, 700, 540, [0, 0, 0]),
    board('wallR', 19, 700, 540, [582.4, 0, 0]),
    board('bottom', 538, 12, 500, [31.7, 105, 20], { hardware: [{ hardwareId: 'runner', quantity: 1 }] })
  ]
  const r = run(boards, { customHardware: runner([12.5, 13]) }).results.get('bottom')
  assert.equal(r.status, 'unsupported')
  assert.equal(r.gaps, undefined)
})
