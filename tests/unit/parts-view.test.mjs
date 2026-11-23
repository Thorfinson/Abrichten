// Guards the parts column's two switches (store/useUIStore.ts, components/ui):
//  - the eye: shows or hides parts in the view only, on every level of every grouping;
//    hidden parts still count in every list and total, leave the selection and ⌘A;
//  - the tick (Assembly.visible): a design variant — counts in every list and the view, or not;
//    with some subgroups unticked a click ticks them all again.
// And one rule for what the view hides: viewHiddenIds — the step view in the assembly
// workspace, the eye in the design workspace; no other place may decide that on its own.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const mem = new Map([['abrichten-welcomed', '1']])
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
})
const { useProjectStore } = await import('../../src/renderer/src/store/useProjectStore.ts')
const { useUIStore, viewHiddenIds, viewStateOf, toggleAll } = await import('../../src/renderer/src/store/useUIStore.ts')
const activeParts = await import('../../src/renderer/src/utils/activeParts.ts')
const { activeAssemblies } = activeParts

const store = () => useProjectStore.getState()
const ui = () => useUIStore.getState()
const board = (id) => ({ id, name: id, width: 600, height: 720, depth: 18, position: { x: 0, y: 0, z: 0 } })

beforeEach(() => {
  ui().setWorkspace('design')
  store().loadProject({
    assemblies: [
      { id: 'K', name: 'Küche', visible: true, boards: [], joints: [] },
      { id: 'H', name: 'Herdfach', parentId: 'K', visible: true, boards: [board('h1'), board('h2')], joints: [] },
      { id: 'S', name: 'Schubkasten', parentId: 'H', visible: true, boards: [board('s1')], joints: [] }
    ],
    assemblySteps: [{ id: 'st1', title: 'Eins', boardIds: ['h1'] }]
  })
  useUIStore.setState({ hiddenParts: [], highlightedParts: [], selectedBoardIds: [] })
})

test('the eye hides parts in the view only: every list still counts them', () => {
  ui().togglePartsInView(['h1', 'h2'])
  assert.deepEqual(ui().hiddenParts.sort(), ['h1', 'h2'])
  assert.deepEqual([...viewHiddenIds(store().project, ui())].sort(), ['h1', 'h2'])
  assert.equal(activeAssemblies(store().project).flatMap((a) => a.boards).length, 3, 'lists and totals still see all parts')
  assert.ok(store().project.assemblies.every((a) => a.visible), 'the tick is untouched')
})

test('a group eye: all shown → hides all; some or all hidden → shows all', () => {
  assert.equal(viewStateOf(['h1', 'h2'], []), 'shown')
  ui().togglePartsInView(['h1'])
  assert.equal(viewStateOf(['h1', 'h2'], ui().hiddenParts), 'mixed')
  ui().togglePartsInView(['h1', 'h2'])
  assert.deepEqual(ui().hiddenParts, [], 'mixed: a click shows them all')
  ui().togglePartsInView(['h1', 'h2'])
  assert.equal(viewStateOf(['h1', 'h2'], ui().hiddenParts), 'hidden')
  ui().togglePartsInView(['h1', 'h2'])
  assert.deepEqual(ui().hiddenParts, [])
})

test('hidden parts leave the selection, and ⌘A skips them', () => {
  ui().selectBoard('H', 'h1')
  ui().togglePartsInView(['h1'])
  assert.deepEqual(ui().selectedBoardIds, [])
  ui().selectAllBoards('H')
  assert.deepEqual(ui().selectedBoardIds, ['h2'])
})

test('the assembly workspace shows its steps, whatever the eye hid in the design', () => {
  ui().togglePartsInView(['h1'])
  ui().setWorkspace('assembly')
  ui().setAssemblyStep(0)
  assert.deepEqual([...viewHiddenIds(store().project, ui())].sort(), ['h2', 's1'], 'only the step view decides there')
  ui().setWorkspace('design')
  assert.deepEqual([...viewHiddenIds(store().project, ui())], ['h1'], 'back in the design the eye still holds')
})

test('"hide assembly" in the menu always hides, also when some parts were hidden already', () => {
  ui().togglePartsInView(['h1'])
  ui().selectBoard('H', 'h2')
  ui().setPartsHidden(['h1', 'h2', 's1'], true)
  assert.deepEqual(ui().hiddenParts.sort(), ['h1', 'h2', 's1'], 'not toggled back to shown')
  assert.deepEqual(ui().selectedBoardIds, [], 'and they leave the selection')
  ui().setPartsHidden(['h1', 'h2', 's1'], true)
  assert.deepEqual(ui().hiddenParts.sort(), ['h1', 'h2', 's1'], 'twice is still hidden')
  ui().setPartsHidden(['h2'], false)
  assert.deepEqual(ui().hiddenParts.sort(), ['h1', 's1'])
})

test('back in the design, a part picked in the assembly that the eye hides leaves the selection', () => {
  ui().togglePartsInView(['h1'])
  ui().setWorkspace('assembly')
  ui().setAssemblyStep(0)
  ui().selectBoard('H', 'h1')
  assert.deepEqual(ui().selectedBoardIds, ['h1'], 'the step shows it')
  ui().setWorkspace('design')
  assert.deepEqual(ui().selectedBoardIds, [], 'Del cannot hit a part you cannot see')
})

test('a hidden part is no snap target, in the design (eye) and in the assembly (step view)', async () => {
  const { snapTargets } = await import('../../src/renderer/src/store/useUIStore.ts')
  ui().togglePartsInView(['h2'])
  assert.deepEqual(snapTargets(store().project, ui(), ['h1']).map((b) => b.id), ['s1'], 'not the moved part, not the hidden one')
  ui().setWorkspace('assembly')
  ui().setAssemblyStep(0)
  assert.deepEqual(snapTargets(store().project, ui(), []).map((b) => b.id), ['h1'], 'the step view decides there')
})

test('every snapping drag takes its targets from snapTargets', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const f of ['components/views3d/Board3D.tsx', 'components/overlays/TranslateHandles3D.tsx']) {
    const text = await readFile(new URL('../../src/renderer/src/' + f, import.meta.url), 'utf8')
    assert.ok(text.includes('snapTargets('), f)
  }
  // nobody else snaps: snapBoardToBoards is used only by these two
  const offenders = []
  for (const file of await sources(ROOT)) {
    const rel = relative(ROOT, file)
    if (rel === 'utils/snap.ts') continue
    if (/\bsnapBoardToBoards\(/.test(await readFile(file, 'utf8')) && !['components/views3d/Board3D.tsx', 'components/overlays/TranslateHandles3D.tsx'].includes(rel)) offenders.push(rel)
  }
  assert.deepEqual(offenders, [])
})

test('another project starts with nothing hidden', () => {
  ui().togglePartsInView(['h1'])
  store().loadProject({ assemblies: [{ id: 'X', name: 'X', boards: [board('x1')], joints: [] }] })
  assert.deepEqual(ui().hiddenParts, [])
})

test('the tick: off for the group and its subgroups; with some off, a click ticks them all', () => {
  store().toggleAssemblyVisibility('H')
  assert.deepEqual(store().project.assemblies.map((a) => a.visible), [true, false, false])
  store().toggleAssemblyVisibility('S')
  assert.deepEqual(store().project.assemblies.map((a) => a.visible), [true, false, true], 'a subgroup alone back on')
  store().toggleAssemblyVisibility('H')
  assert.deepEqual(store().project.assemblies.map((a) => a.visible), [true, true, true], 'some on: the click ticks all')
  store().toggleAssemblyVisibility('K')
  assert.deepEqual(store().project.assemblies.map((a) => a.visible), [false, false, false])
})

test('the X-ray follows the same click rule as the eye and is a view, not saved', () => {
  ui().togglePartsHighlight(['h1', 'h2'])
  assert.deepEqual(ui().highlightedParts.sort(), ['h1', 'h2'])
  ui().togglePartsHighlight(['h1', 'h2', 's1'])
  assert.deepEqual(ui().highlightedParts, [], 'some picked out: a click takes them all back')
  ui().togglePartsHighlight(['s1'])
  assert.equal(JSON.stringify(store().project).includes('highlight'), false, 'nothing of it in the project')
  store().loadProject({ assemblies: [{ id: 'X', name: 'X', highlight: true, boards: [board('x1')], joints: [] }] })
  assert.deepEqual(ui().highlightedParts, [], 'another project starts with nothing picked out')
  assert.equal('highlight' in store().project.assemblies[0], false, 'an old saved X-ray is dropped on load')
})

test('one click rule for both lists: none in → all in; some or all in → all out', () => {
  assert.deepEqual(toggleAll([], ['a', 'b']), ['a', 'b'])
  assert.deepEqual(toggleAll(['a'], ['a', 'b']), [])
  assert.deepEqual(toggleAll(['a', 'b', 'c'], ['a', 'b']), ['c'])
})

// ── one rule ────────────────────────────────────────────────────────────────────────
const ROOT = new URL('../../src/renderer/src/', import.meta.url).pathname
async function sources(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await sources(path))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path)
  }
  return out
}

test('what the view hides is decided in one place (viewHiddenIds), not beside it', async () => {
  const offenders = []
  for (const file of await sources(ROOT)) {
    const rel = relative(ROOT, file)
    if (rel === 'store/useUIStore.ts' || rel === 'utils/assemblySteps.ts') continue
    const text = await readFile(file, 'utf8')
    if (/\bstepHiddenIds\b|\bhiddenParts\.(includes|has|filter)\b|new Set\([^)]*hiddenParts\)/.test(text)) offenders.push(rel)
  }
  // the eye's own controls and the boards read the eye's list as such; every other place goes through viewHiddenIds / useViewHidden
  const allowed = ['components/views3d/Board3D.tsx', 'components/layout/AssemblyDrawer.tsx']
  assert.deepEqual(offenders.filter((f) => !allowed.includes(f)), [])
})

test('the tick: an assembly counts unless its tick is off; no tick saved counts (older files)', () => {
  const { assemblyCounts } = activeParts
  assert.equal(assemblyCounts({ visible: false }), false)
  assert.equal(assemblyCounts({ visible: true }), true)
  assert.equal(assemblyCounts({}), true)
  const project = { assemblies: [{ id: 'a', visible: false }, { id: 'b' }, { id: 'c', visible: true }] }
  assert.deepEqual(activeAssemblies(project).map((a) => a.id), ['b', 'c'])
})

test('whether an assembly counts is read in one place (assemblyCounts), not written out beside it', async () => {
  // a reading of the tick: compared, negated, or used as a condition — not a copy (visible: parent.visible)
  // and not a three.js object (mesh.visible = …)
  const reading = /\.visible\s*(?:[!=]==?|\?|&&|\|\|)|!\s*[\w.\]]*\.visible\b|\(\s*[\w.\]]*\.visible\s*\)/
  const offenders = []
  for (const file of await sources(ROOT)) {
    const rel = relative(ROOT, file)
    if (rel === 'utils/activeParts.ts') continue
    const code = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    if (reading.test(code)) offenders.push(rel)
  }
  assert.deepEqual(offenders, [])
})
