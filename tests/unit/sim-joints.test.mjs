// Guards the joint-based load path of the load simulation (services/static-sim.ts):
// a joint (Assembly.joints) is a fastened connection over the contact region of its two
// boards; it holds in both directions, braces a standing panel against buckling, and
// carries the load of the board farther from the floor to the one nearer to it.
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

const board = (id, w, h, d, pos, extra = {}) => ({
  id, name: id, width: w, height: h, depth: d,
  position: { x: pos[0], y: pos[1], z: pos[2] }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff', ...extra
})
const weightN = (b) => (b.width * b.height * b.depth / 1e9) * getMaterialById(b.materialId).density * GRAVITY
const joint = (a, b, type = 'screw') => ({ id: `${a}-${b}`, type, boardA: a, boardB: b, position: { x: 0, y: 0, z: 0 }, fasteners: [] })
const run = (boards, joints = [], payloadKg = 20, customHardware) => simulateStatics(boards, { payloadKg, joints, customHardware })
const near = (a, b, rel, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-9), `${msg} ${a} ≠ ${b}`)
const handed = (r, to) => r.reactions.filter((x) => x.to === to).reduce((s, x) => s + x.F, 0)

/** A frame of two 40 × 60 posts and two battens, with a 3 mm MDF cladding nailed to it. */
function cladFrame(cladY = 50) {
  const timber = { materialId: 'fichte', grainDirection: 'height' }
  const boards = [
    board('postL', 40, 900, 60, [0, 0, 0], timber),
    board('postR', 40, 900, 60, [652, 0, 0], timber),
    board('battenLow', 612, 40, 24, [40, 100, 36], { materialId: 'fichte', grainDirection: 'width' }),
    board('battenHigh', 612, 40, 24, [40, 760, 36], { materialId: 'fichte', grainDirection: 'width' }),
    board('clad', 692, 873, 3, [0, cladY, 60], { materialId: 'mdf' })
  ]
  const joints = [
    joint('battenLow', 'postL'), joint('battenLow', 'postR'), joint('battenHigh', 'postL'), joint('battenHigh', 'postR'),
    joint('clad', 'postL', 'butt'), joint('clad', 'postR', 'butt'), joint('clad', 'battenLow', 'butt'), joint('clad', 'battenHigh', 'butt')
  ]
  return { boards, joints }
}

test('a cladding nailed to a frame does not buckle under its own weight; its weight goes into the frame at the nails', () => {
  const { boards, joints } = cladFrame()
  // without the nails it is a free 3 mm panel standing on nothing: no support at all
  assert.notEqual(run(boards).results.get('clad').status, 'ok')
  const sim = run(boards, joints)
  const clad = sim.results.get('clad')
  assert.equal(clad.status, 'ok')
  assert.ok(clad.uMax < 0.05, `cladding ${clad.uMax}`)
  // its whole weight is handed to posts and battens, where it is nailed
  near(clad.totalLoadN, weightN(boards[4]), 1e-9)
  near(clad.reactions.reduce((s, x) => s + x.F, 0), clad.totalLoadN, 1e-9, 'Σ reactions')
  for (const r of clad.reactions) assert.ok(['postL', 'postR', 'battenLow', 'battenHigh'].includes(r.to), r.to)
  assert.ok(handed(clad, 'postL') > 0 && handed(clad, 'postR') > 0)
  // the frame carries it: posts on the floor end up with everything
  const total = boards.reduce((s, b) => s + weightN(b), 0)
  near(sim.results.get('postL').totalLoadN + sim.results.get('postR').totalLoadN, total, 1e-6, 'the load reaches the floor through the posts')
  // it hangs on the battens as well as on the posts, the battens rest on the posts' ends
  assert.ok(handed(clad, 'battenLow') > 0 && handed(clad, 'battenHigh') > 0)
  assert.equal(sim.results.get('battenHigh').status, 'ok')
})

test('a cladding standing on the floor beside the frame is braced by it, and neither carries the other', () => {
  const { boards, joints } = cladFrame(0)
  const sim = run(boards, joints)
  const clad = sim.results.get('clad')
  near(clad.totalLoadN, weightN(boards[4]), 1e-9, 'it carries only itself')
  assert.deepEqual([...new Set(clad.reactions.map((x) => x.to))], [null], 'into the floor')
  assert.ok(clad.uMax < 0.05, `braced: ${clad.uMax}`)
  for (const id of ['battenLow', 'battenHigh']) {
    assert.deepEqual([...new Set(sim.results.get(id).reactions.map((x) => x.to))].sort(), ['postL', 'postR'], id)
  }
})

test('a nailed panel is braced: its buckling length is the gap between the nails, not its height', () => {
  // a tall, thin MDF panel standing on the floor under a load on its top edge
  const panel = board('panel', 600, 2000, 6, [0, 0, 100], { materialId: 'mdf', loadKg: 15 })
  const free = run([panel]).results.get('panel')
  const battens = [300, 800, 1300, 1800].map((y, k) => board(`b${k}`, 600, 40, 24, [0, y, 76], { materialId: 'fichte' }))
  // the battens run on to a post beside the panel, screwed to it; the panel is nailed to them
  const posts = [board('p', 40, 2100, 40, [740, 0, 60], { materialId: 'fichte' })]
  const reach = battens.map((b) => ({ ...b, width: 740 }))
  const joints = [...battens.map((b) => joint(b.id, 'p')), ...battens.map((b) => joint('panel', b.id, 'butt'))]
  const sim = run([panel, ...reach, ...posts], joints).results
  const braced = sim.get('panel')
  for (const b of battens) assert.equal(sim.get(b.id).status, 'ok', b.id)
  assert.equal(free.governing, 'buckling')
  assert.ok(braced.uMax < free.uMax / 4, `braced ${braced.uMax} vs free ${free.uMax}`)
})

test('a shelf screwed to two side panels rests on them as on its ends, but the screws also pull', () => {
  const sides = [
    board('left', 18, 720, 300, [0, 0, 0], { materialId: 'multiplex-birke' }),
    board('right', 18, 720, 300, [582, 0, 0], { materialId: 'multiplex-birke' })
  ]
  const shelf = board('shelf', 564, 19, 300, [18, 400, 0])
  const loose = run([...sides, shelf]).results.get('shelf')
  const screwed = run([...sides, shelf], [joint('shelf', 'left'), joint('right', 'shelf')]).results.get('shelf')
  near(screwed.uMax, loose.uMax, 1e-6, 'same as resting on its ends')
  near(screwed.deflectionMm, loose.deflectionMm, 1e-6)
  near(handed(screwed, 'left'), screwed.totalLoadN / 2, 1e-6)
  // both directions: a plank on two rails with a heavy load on its overhang tips off them;
  // screwed down it holds
  const rails = [0, 580].map((x, k) => board(`r${k}`, 40, 400, 300, [x, 0, 0], { materialId: 'fichte' }))
  const plank = board('plank', 1000, 19, 300, [0, 400, 0], { loads: [{ id: 'p', x: 880, z: 100, kg: 30, w: 100, d: 100 }] })
  assert.equal(run([...rails, plank], [], 0).results.get('plank').status, 'unsupported', 'resting: it tips')
  const fixed = run([...rails, plank], rails.map((r) => joint('plank', r.id)), 0).results.get('plank')
  assert.notEqual(fixed.status, 'unsupported')
  // the screws hold it down (joint nodes held both ways); the pull stays in the joint, what
  // reaches the rails is the plank's load
  assert.ok(fixed.field.held.some((v) => v === 2), 'held at its joints')
  assert.ok(fixed.reactions.every((x) => x.F >= 0), 'no pull is handed on')
  near(fixed.reactions.reduce((s, x) => s + x.F, 0), fixed.totalLoadN, 1e-9, 'Σ reactions')
})

test('a board hanging under another by a joint passes its load up to it', () => {
  const sides = [
    board('left', 18, 720, 300, [0, 0, 0], { materialId: 'multiplex-birke' }),
    board('right', 18, 720, 300, [582, 0, 0], { materialId: 'multiplex-birke' })
  ]
  const shelf = board('shelf', 564, 19, 300, [18, 400, 0], { materialId: 'multiplex-birke' })
  const hanging = board('hanging', 300, 16, 200, [150, 384, 50], { loadKg: 5 })
  const alone = run([...sides, shelf, hanging], [], 0).results
  assert.equal(alone.get('hanging').status, 'unsupported', 'nothing holds it without the joint')
  const sim = run([...sides, shelf, hanging], [joint('hanging', 'shelf')], 0).results
  const h = sim.get('hanging')
  assert.equal(h.status, 'ok')
  near(handed(h, 'shelf'), h.totalLoadN, 1e-9, 'all of it goes up into the shelf')
  near(sim.get('shelf').totalLoadN, weightN(shelf) + h.totalLoadN, 1e-9, 'the shelf carries it')
})

test('joints are directed from the floor up: a chain and a loop of joints have no cycle', () => {
  // chain: post on the floor → arm → bracket → tag, each held only by its joint (the
  // bracket hangs from the arm's edge, the tag under the bracket)
  const chain = [
    board('post', 40, 800, 40, [0, 0, 0], { materialId: 'fichte' }),
    board('arm', 400, 40, 40, [40, 700, 0], { materialId: 'fichte' }),
    board('bracket', 40, 200, 40, [400, 500, 40], { materialId: 'fichte' }),
    board('tag', 200, 19, 100, [380, 481, 40])
  ]
  const links = [joint('arm', 'post'), joint('bracket', 'arm'), joint('tag', 'bracket')]
  const sim = run(chain, links, 0).results
  assert.deepEqual(sim.get('tag').reactions.map((r) => r.to).filter((v, i, a) => a.indexOf(v) === i), ['bracket'])
  assert.deepEqual([...new Set(sim.get('bracket').reactions.map((r) => r.to))], ['arm'])
  assert.deepEqual([...new Set(sim.get('arm').reactions.map((r) => r.to))], ['post'])
  const all = chain.reduce((s, b) => s + weightN(b), 0)
  near(sim.get('post').totalLoadN, all, 1e-6, 'everything reaches the post')
  // loop: two posts with a top and a bottom rail, and a plate joined to both rails
  const loop = [
    board('pL', 40, 800, 40, [0, 0, 0], { materialId: 'fichte' }),
    board('pR', 40, 800, 40, [540, 0, 0], { materialId: 'fichte' }),
    board('top', 500, 40, 40, [40, 700, 0], { materialId: 'fichte' }),
    board('low', 500, 40, 40, [40, 200, 0], { materialId: 'fichte' }),
    board('plate', 500, 460, 6, [40, 240, 40], { materialId: 'mdf' })
  ]
  const ring = [joint('top', 'pL'), joint('pR', 'top'), joint('low', 'pL'), joint('low', 'pR'), joint('plate', 'top', 'butt'), joint('low', 'plate', 'butt')]
  const r = run(loop, ring, 0).results
  for (const id of ['top', 'low', 'plate']) assert.equal(r.get(id).status, 'ok', id)
  const total = loop.reduce((s, b) => s + weightN(b), 0)
  near(r.get('pL').totalLoadN + r.get('pR').totalLoadN, total, 1e-6, 'no load lost or counted twice in the loop')
})

test('a 40 × 60 timber screwed onto a plinth is a beam: a load over its edge does not bend it across', () => {
  // the kitchen's front rail: it bears on the plinth over 40 of its 60 mm, a side panel
  // stands on the free 20 mm; plate bending across a member this deep (and across the
  // grain, f/60) would call it close to breaking
  const timber = { materialId: 'fichte', grainDirection: 'width' }
  const plinth = board('plinth', 1000, 60, 40, [0, 0, 20], timber)
  const sill = board('sill', 1000, 40, 60, [0, 60, 0], { ...timber, loads: [{ id: 'l', x: 480, z: 0, kg: 80, w: 20, d: 20 }] })
  const r = run([plinth, sill], [joint('sill', 'plinth')], 0).results.get('sill')
  assert.equal(r.status, 'ok')
  assert.ok(r.uMax < 0.1, `u ${r.uMax}`)
  near(handed(r, 'plinth'), r.totalLoadN, 1e-9, 'all of it goes into the plinth')
})

test('a drawer hangs on its runners: the joint bridges the 12.7 mm gap, a rail its bottom touches does not carry it', () => {
  // drawer box (bottom glued between two sides) on side-mounted runners between two cabinet
  // sides; its bottom touches a rail at the front edge only (5 mm gap), where it would tip.
  // The runner on each drawer side says it bridges 12.5–13 mm (Wunschliste, Statik Stufe 1)
  const ply = { materialId: 'multiplex-birke' }
  const onRunner = { ...ply, hardware: [{ hardwareId: 'runner', quantity: 1 }] }   // one rail on each drawer side
  const customHardware = [{ id: 'runner', name: 'Auszug', nameEn: 'Runner', category: 'slides', unitPrice: 9, bridgesMm: [12.5, 13] }]
  const boards = [
    board('wallL', 19, 700, 540, [0, 0, 0], ply),
    board('wallR', 19, 700, 540, [582.4, 0, 0], ply),
    board('rail', 600, 100, 60, [0, 0, 480], { materialId: 'fichte' }),
    board('bottom', 538, 12, 500, [31.7, 105, 20], ply),
    board('sideL', 15, 68, 500, [31.7, 117, 20], onRunner),
    board('sideR', 15, 68, 500, [554.7, 117, 20], onRunner)
  ]
  const joints = [joint('bottom', 'sideL', 'glued'), joint('bottom', 'sideR', 'glued'), joint('sideL', 'wallL'), joint('sideR', 'wallR')]
  const sim = run(boards, joints, 20, customHardware).results
  const bottom = sim.get('bottom')
  assert.notEqual(bottom.status, 'unsupported')
  const onRunners = handed(sim.get('sideL'), 'wallL') + handed(sim.get('sideR'), 'wallR')
  assert.ok(onRunners > 0.5 * bottom.totalLoadN, `runners carry ${onRunners} of ${bottom.totalLoadN}`)
  assert.ok(handed(bottom, 'sideL') > 0 && handed(bottom, 'sideR') > 0, 'the bottom hangs on the sides')
})
