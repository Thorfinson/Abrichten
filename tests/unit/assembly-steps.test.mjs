// Guards the assembly mode (Montage): steps in the project file (utils/validateProject.ts),
// what each step installs and joins (utils/assemblySteps.ts), the suggested order from
// the part roles, the store actions, and the printable instruction (utils/assemblyInstructions.ts).
import { test, beforeEach } from 'node:test'
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
const { validateProject } = await import('../../src/renderer/src/utils/validateProject.ts')
const { planAssembly, fastenerLines, partLines, suggestSteps, boardStepState, stepIndexOf, treeOrder } =
  await import('../../src/renderer/src/utils/assemblySteps.ts')
const { assemblyInstructionHtml, fastenerLabel } = await import('../../src/renderer/src/utils/assemblyInstructions.ts')
const { useProjectStore } = await import('../../src/renderer/src/store/useProjectStore.ts')

const board = (id, extra = {}) => ({ id, name: id, width: 600, height: 720, depth: 18, position: { x: 0, y: 0, z: 0 }, materialId: 'spanplatte', ...extra })
const screw = (quantity, extra = {}) => ({ id: 'f', type: 'wood_screw', diameter: 4, length: 40, quantity, headType: 'countersunk', material: 'steel', ...extra })
const joint = (id, a, b, fasteners = [], extra = {}) => ({ id, type: 'screw', boardA: a, boardB: b, position: { x: 0, y: 0, z: 0 }, fasteners, ...extra })

/** Carcass (side, bottom), back, front; steps: back → carcass → front */
function kitchen(extra = {}) {
  return validateProject({
    name: 'Küche',
    assemblies: [
      { id: 'A', name: 'Unterschrank', boards: [
        board('side', { role: 'carcass', width: 18, height: 720, depth: 560 }),
        board('bottom', { role: 'carcass', width: 564, height: 18, depth: 560 }),
        board('back', { role: 'back', width: 600, height: 720, depth: 8 }),
        board('front', { role: 'visible', width: 596, height: 716, depth: 19 })
      ], joints: [
        joint('j1', 'side', 'bottom', [screw(4)], { note: 'vorgebohrt' }),
        joint('j2', 'back', 'side', [screw(6, { type: 'nail', diameter: 1.2, length: 25 })]),
        joint('j3', 'front', 'side', [], { type: 'glued' })
      ] }
    ],
    assemblySteps: [
      { id: 's1', title: 'Rückwand', boardIds: ['back'] },
      { id: 's2', title: 'Korpus', note: 'erst ausrichten', boardIds: ['side', 'bottom'] },
      { id: 's3', title: 'Front', boardIds: ['front'] }
    ],
    ...extra
  })
}

test('steps in the file: unknown boards and repeats dropped, broken entries gone, ids unique', () => {
  const p = validateProject({
    assemblies: [{ id: 'A', boards: [board('a'), board('b'), board('c')], joints: [] }],
    assemblySteps: [
      { id: 's1', title: 'Erst\nder Boden', boardIds: ['a', 'ghost', 'a', 7] },
      'nonsense',
      { id: 's1', title: 42, note: 'Hinweis\nzweite Zeile', boardIds: ['a', 'b'], future: 'kept' },
      { boardIds: 'c' }
    ]
  })
  const [s1, s2, s3] = p.assemblySteps
  assert.equal(p.assemblySteps.length, 3)
  assert.deepEqual(s1.boardIds, ['a'])
  assert.equal(s1.title, 'Erst der Boden')
  assert.notEqual(s2.id, 's1', 'a repeated id gets a new one')
  assert.equal(s2.title, 'Schritt 3')
  assert.equal(s2.note, 'Hinweis\nzweite Zeile')
  assert.deepEqual(s2.boardIds, ['b'], 'a board stays in its first step')
  assert.equal(s2.future, 'kept')
  assert.deepEqual(s3.boardIds, [])
  assert.ok(s3.id)

  // a file without steps loads unchanged and is saved without the field
  const old = validateProject({ assemblies: [{ id: 'A', boards: [board('a')], joints: [] }] })
  assert.equal(old.assemblySteps, undefined)
  assert.ok(!JSON.stringify(old).includes('assemblySteps'))
  // saved and loaded again: the same steps
  const k = kitchen()
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(k))).assemblySteps, k.assemblySteps)
})

test('a joint is made in the step of its later board; fixings per step, notes kept', () => {
  const plan = planAssembly(kitchen())
  assert.deepEqual(plan.steps.map((s) => s.boards.map((b) => b.board.id)), [['back'], ['side', 'bottom'], ['front']])
  assert.deepEqual(plan.steps.map((s) => s.joints.map((j) => j.id)), [[], ['j1', 'j2'], ['j3']])
  assert.deepEqual(fastenerLines(plan.steps[1].joints), [
    { kind: 'fastener', type: 'nail', diameter: 1.2, length: 25, headType: 'countersunk', qty: 6, note: undefined },
    { kind: 'fastener', type: 'wood_screw', diameter: 4, length: 40, headType: 'countersunk', qty: 4, note: 'vorgebohrt' }
  ])
  assert.deepEqual(fastenerLines(plan.steps[2].joints), [{ kind: 'joint', jointType: 'glued', qty: 1, note: undefined }])
  assert.deepEqual(plan.unplanned, [])
  assert.deepEqual(plan.unplannedJoints, [])
})

test('unplanned boards and their joints; hidden assemblies are left out', () => {
  const p = kitchen({ assemblySteps: [{ id: 's1', title: 'Korpus', boardIds: ['side', 'bottom'] }] })
  const plan = planAssembly(p)
  assert.deepEqual(plan.unplanned.map((u) => u.board.id), ['back', 'front'])
  assert.deepEqual(plan.unplannedJoints.map((j) => j.id), ['j2', 'j3'])
  assert.deepEqual(plan.steps[0].joints.map((j) => j.id), ['j1'])

  const hidden = planAssembly({ ...p, assemblies: p.assemblies.map((a) => ({ ...a, visible: false })) })
  assert.deepEqual(hidden.steps[0].boards, [])
  assert.deepEqual(hidden.unplanned, [])
  assert.deepEqual(hidden.unplannedJoints, [])
})

test('fixings add up by type, size and head; split by note only when asked', () => {
  const joints = [
    joint('a', 'x', 'y', [screw(10), screw(2, { length: 30 })], { note: 'vorgebohrt' }),
    joint('b', 'x', 'y', [screw(16)], { note: ' vorgebohrt ' }),
    joint('c', 'x', 'y', [screw(4), screw(0, { type: 'confirmat' })]),
    joint('d', 'x', 'y', [], { type: 'dado' }),
    joint('e', 'x', 'y', [], { type: 'dado' })
  ]
  const withNotes = fastenerLines(joints).map((l) => [l.kind === 'joint' ? l.jointType : `${l.type} ${l.diameter}x${l.length}`, l.qty, l.note])
  assert.deepEqual(withNotes, [
    ['wood_screw 4x30', 2, 'vorgebohrt'],
    ['wood_screw 4x40', 4, undefined],
    ['wood_screw 4x40', 26, 'vorgebohrt'],
    ['dado', 2, undefined]
  ])
  const all = fastenerLines(joints, false).map((l) => [l.kind === 'joint' ? l.jointType : `${l.type} ${l.diameter}x${l.length}`, l.qty])
  assert.deepEqual(all, [['wood_screw 4x30', 2], ['wood_screw 4x40', 30], ['dado', 2]])

  const t = (k) => ({ 'joints.f_wood_screw': 'Holzschraube', 'joints.f_nail': 'Nagel', 'montage.head_countersunk': 'Senkkopf', 'joints.dado': 'Nut' }[k] ?? k)
  assert.equal(fastenerLabel(fastenerLines([joints[1]])[0], t, 'de'), 'Holzschraube Senkkopf 4 × 40')
  assert.equal(fastenerLabel({ kind: 'fastener', type: 'nail', diameter: 1.2, length: 25, headType: 'countersunk', qty: 1 }, t, 'de'), 'Nagel 1,2 × 25')
  assert.equal(fastenerLabel({ kind: 'joint', jointType: 'dado', qty: 2 }, t, 'de'), 'Nut')
})

test('parts add up by name, material, role and cut size', () => {
  const lines = partLines([
    board('l', { name: 'Seite', width: 18, height: 720, depth: 560 }),
    board('r', { name: 'Seite', width: 560, height: 720, depth: 18 }),   // same part, turned
    board('m', { name: 'Seite', width: 18, height: 720, depth: 560, materialId: 'mdf' })
  ])
  assert.deepEqual(lines.map((l) => [l.name, l.materialId, l.length, l.width, l.thickness, l.qty, l.boardIds]), [
    ['Seite', 'spanplatte', 720, 560, 18, 2, ['l', 'r']],
    ['Seite', 'mdf', 720, 560, 18, 1, ['m']]
  ])
})

test('step view: earlier ghosted, current highlighted, later and unplanned hidden', () => {
  const steps = kitchen().assemblySteps
  assert.equal(boardStepState(steps, 1, 'back'), 'earlier')
  assert.equal(boardStepState(steps, 1, 'side'), 'current')
  assert.equal(boardStepState(steps, 1, 'front'), 'hidden')
  assert.equal(boardStepState(steps, 1, 'nowhere'), 'hidden')
  assert.equal(boardStepState(steps, -1, 'front'), 'normal', 'no step view')
  assert.equal(boardStepState([], 0, 'front'), 'normal', 'no steps: everything as usual')
  assert.equal(stepIndexOf(steps), stepIndexOf(steps), 'cached per steps array')
})

test('suggested order follows the part roles; carcass per assembly in tree order', () => {
  const p = validateProject({
    assemblies: [
      { id: 'K2', name: 'Fach 2', parentId: 'K', boards: [board('k2-side', { role: 'carcass' })], joints: [] },
      { id: 'X', name: 'Sonstiges', boards: [board('lamp'), board('plinth', { role: 'plinth' })], joints: [] },
      { id: 'K', name: 'Küche', boards: [
        board('front', { role: 'visible', width: 596, height: 716, depth: 19 }),
        board('wange', { role: 'visible', width: 19, height: 900, depth: 600 }),
        board('k-side', { role: 'carcass' }), board('rw', { role: 'back' }),
        board('top', { role: 'worktop' }), board('oven', { role: 'appliance' }),
        board('box', { role: 'drawer' }), board('lattung', { role: 'substructure' })
      ], joints: [] },
      { id: 'K1', name: 'Fach 1', parentId: 'K', boards: [board('k1-side', { role: 'carcass' }), board('k1-shelf')], joints: [] }
    ]
  })
  assert.deepEqual(treeOrder(p.assemblies).map((a) => a.id), ['X', 'K', 'K2', 'K1'])
  let n = 0
  const steps = suggestSteps(p, (kind, path) => (path ? `${kind}: ${path}` : kind), () => `id${++n}`)
  assert.deepEqual(steps.map((s) => [s.title, s.boardIds]), [
    ['back', ['rw']],
    ['substructure', ['lattung']],
    ['carcass: Küche', ['k-side']],
    ['carcass: Küche › Fach 2', ['k2-side']],
    ['carcass: Küche › Fach 1', ['k1-side']],
    ['endPanels', ['wange']],
    ['worktop', ['top']],
    ['appliance', ['oven']],
    ['drawer', ['box']],
    ['fronts', ['front']],
    ['plinth', ['plinth']],
    ['other: Sonstiges', ['lamp']],
    ['other: Küche › Fach 1', ['k1-shelf']]
  ])
  assert.deepEqual(steps.map((s) => s.id), steps.map((_, i) => `id${i + 1}`))
  // hidden assemblies are not planned
  const hidden = { ...p, assemblies: p.assemblies.map((a) => (a.id === 'X' ? { ...a, visible: false } : a)) }
  assert.ok(!suggestSteps(hidden, (k) => k).some((s) => s.boardIds.includes('lamp')))
})

// ── Store ───────────────────────────────────────────────────────────────────

const store = () => useProjectStore.getState()
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length
const stepIds = () => (store().project.assemblySteps ?? []).map((s) => [s.id, s.boardIds])

beforeEach(() => store().loadProject(kitchen()))

test('store: add, rename, move, remove steps — one undo step each, no-ops add none', () => {
  const id = store().addAssemblyStep('Sockel', 1)
  assert.deepEqual(stepIds().map(([sid]) => sid), ['s1', id, 's2', 's3'])
  store().updateAssemblyStep(id, { title: 'Sockel\nmontieren', note: 'mit Wasserwaage' })
  assert.equal(store().project.assemblySteps[1].title, 'Sockel montieren')
  store().updateAssemblyStep(id, { note: '   ' })
  assert.equal(store().project.assemblySteps[1].note, undefined)
  store().moveAssemblyStep(id, 3)
  assert.deepEqual(stepIds().map(([sid]) => sid), ['s1', 's2', 's3', id])
  store().removeAssemblyStep('s2')
  assert.deepEqual(stepIds().map(([sid]) => sid), ['s1', 's3', id])
  assert.equal(undoSteps(), 5)

  store().moveAssemblyStep(id, 2)          // already there
  store().moveAssemblyStep('nope', 0)
  store().updateAssemblyStep(id, { title: '' })   // empty title keeps the old one
  store().updateAssemblyStep('nope', { title: 'x' })
  store().removeAssemblyStep('nope')
  assert.equal(undoSteps(), 5)
  useProjectStore.temporal.getState().undo()
  assert.deepEqual(stepIds().map(([sid]) => sid), ['s1', 's2', 's3', id])
})

test('store: boards move between steps and out of them; unknown ones are ignored', () => {
  store().assignBoardsToStep(['front', 'side', 'ghost'], 's1')
  assert.deepEqual(stepIds(), [['s1', ['back', 'front', 'side']], ['s2', ['bottom']], ['s3', []]])
  store().assignBoardsToStep(['side'], null)
  assert.deepEqual(stepIds()[0], ['s1', ['back', 'front']])
  assert.equal(undoSteps(), 2)
  store().assignBoardsToStep(['side'], null)        // already unplanned
  store().assignBoardsToStep(['back'], 's1')        // already there
  store().assignBoardsToStep(['back'], 'nope')
  store().assignBoardsToStep(['ghost'], 's2')
  assert.equal(undoSteps(), 2)
})

test('store: a removed board leaves its step; replacing all steps cleans them', () => {
  store().removeBoards('A', ['bottom'])
  assert.deepEqual(stepIds()[1], ['s2', ['side']])
  assert.equal(undoSteps(), 1, 'board and step change are one undo step')
  store().removeAssembly('A')
  assert.deepEqual(stepIds(), [['s1', []], ['s2', []], ['s3', []]])

  store().loadProject(kitchen())
  store().setAssemblySteps([{ id: 'n1', title: 'Alles', boardIds: ['side', 'side', 'ghost', 'back'] }, { id: 'n2', title: 'Rest', boardIds: ['back', 'front'] }])
  assert.deepEqual(stepIds(), [['n1', ['side', 'back']], ['n2', ['front']]])
})

// ── Printable instruction ───────────────────────────────────────────────────

const t = (key, opts = {}) => `${key}${Object.keys(opts).length ? JSON.stringify(opts) : ''}`

test('instruction: a cover and one page per step, parts numbered, everything escaped', () => {
  const xss = '<img src=x onerror=alert(1)>'
  const p = kitchen()
  p.name = xss
  p.assemblies[0].boards[0].name = xss
  p.assemblySteps[1].title = xss
  p.assemblySteps[1].note = `${xss}\nzweite Zeile`
  const png = 'data:image/png;base64,iVBORw0KGgo='
  const html = assemblyInstructionHtml(p, planAssembly(p), { overview: png, steps: [png, 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4='] }, t, 'de')

  assert.ok(!html.includes(xss), 'no raw markup from names')
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(!html.includes('<script'))
  assert.equal((html.match(/<section class="cover">/g) ?? []).length, 1)
  assert.equal((html.match(/<section class="step">/g) ?? []).length, 3)
  // only PNG/JPEG data URLs become pictures: the overview and step 1
  assert.equal((html.match(/<img src="data:image\/png/g) ?? []).length, 2)
  assert.ok(!html.includes('javascript:') && !html.includes('svg+xml'))
  // step 2 lists its fixings with the joint note
  const step2 = html.split('<section class="step">')[2]
  assert.match(step2, /<b>4 ×<\/b> joints\.f_wood_screw montage\.head_countersunk 4 × 40<span class="note">, vorgebohrt<\/span>/)
  assert.match(step2, /<b>6 ×<\/b> joints\.f_nail 1,2 × 25/)
  // parts carry the cover's numbers; the cover lists them in step order, so the back is no. 1
  const step1 = html.split('<section class="step">')[1]
  assert.match(step1, /<td class="r">1<\/td><td class="r"><b>1 ×<\/b><\/td><td>back<\/td>/)
})

test('instruction: unplanned parts get their own page and a warning on the cover', () => {
  const p = kitchen({ assemblySteps: [{ id: 's1', title: 'Korpus', boardIds: ['side', 'bottom'] }] })
  const html = assemblyInstructionHtml(p, planAssembly(p), { steps: [undefined] }, t, 'en')
  assert.match(html, /montage\.unplannedCount\{&quot;count&quot;:2\}/)
  assert.equal((html.match(/<section class="step">/g) ?? []).length, 2)
  assert.ok(!html.includes('<img'), 'no pictures without WebGL')
})

test('every label the assembly mode uses exists in German and English', async () => {
  const { readFile } = await import('node:fs/promises')
  const load = async (lang) => JSON.parse(await readFile(new URL(`../../src/renderer/src/i18n/${lang}.json`, import.meta.url), 'utf8')).montage
  const de = await load('de')
  const en = await load('en')
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort())
  const kinds = ['back', 'substructure', 'carcass', 'endPanels', 'worktop', 'appliance', 'drawer', 'fronts', 'plinth', 'other']
  for (const k of [...kinds.map((kind) => `s_${kind}`), 'head_countersunk', 'head_pan', 'head_hex']) {
    assert.ok(de[k] && en[k], k)
  }
})
