// Guards the rule "the assembly workspace (Montage) reads the design and writes only the
// assembly plan" (store/designLock.ts), from three sides:
//  1. the project store: every action that is not about the plan or the file is refused
//     in the assembly workspace — and does change the design in the design workspace, so
//     the check is not empty. A new store action without an entry here fails the test;
//  2. undo and redo (services/history.ts): in the assembly workspace they take back plan
//     changes only;
//  3. the screen: every function or component that calls a design-changing action reads
//     the lock (useDesignLocked / isDesignLocked) or says why it need not
//     (`design-lock-ok: <reason>`); no one but services/history.ts calls undo/redo, and a
//     direct write past the store's `set` says why it is safe.
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
const { useUIStore } = await import('../../src/renderer/src/store/useUIStore.ts')
const { designChanged, setDesignLockedNotice } = await import('../../src/renderer/src/store/designLock.ts')
const { undo, redo } = await import('../../src/renderer/src/services/history.ts')
const { materials } = await import('../../src/renderer/src/data/materials.ts')
const { hardwareItems } = await import('../../src/renderer/src/data/hardware.ts')

const store = () => useProjectStore.getState()
const ui = () => useUIStore.getState()
const told = []
setDesignLockedNotice((kind) => told.push(kind))

const board = (id, extra = {}) => ({ id, name: id, width: 600, height: 720, depth: 18, position: { x: 0, y: 0, z: 0 }, ...extra })
const newBoard = { name: 'Neu', width: 300, height: 300, depth: 18, position: { x: 0, y: 0, z: 0 } }
const { id: _id, ...materialData } = materials[0]

function fixture() {
  ui().setWorkspace('design')
  store().loadProject({
    parameters: { H: 720 },
    customMaterials: [{ ...materials[0], id: 'cm1', name: 'Eigen' }],
    customHardware: [{ id: 'h1', name: 'Griff', nameEn: 'Handle', category: 'handle', unitPrice: 3 }],
    assemblies: [
      { id: 'A', name: 'Korpus', boards: [board('a1', { heightFormula: 'H', partNo: 5 }), board('a2', { partNo: 7 })],
        joints: [{ id: 'j1', type: 'butt', boardA: 'a1', boardB: 'a2', position: { x: 0, y: 0, z: 0 }, fasteners: [] }] },
      { id: 'B', name: 'Sockel', boards: [board('b1')], joints: [] }
    ],
    assemblySteps: [{ id: 's1', title: 'Eins', boardIds: ['a1'] }, { id: 's2', title: 'Zwei', boardIds: ['b1'] }]
  })
  told.length = 0
}
beforeEach(fixture)

/** Every action that changes the design, with arguments that do change it. */
const DESIGN_ACTIONS = {
  addAssembly: ['Neu'],
  removeAssembly: ['B'],
  renameAssembly: ['A', 'Anders'],
  setAssemblyShortName: ['A', 'Kor'],
  renumberParts: [],
  moveAssembly: ['B', 'A', 'inside'],
  toggleAssemblyVisibility: ['A'],
  addBoard: ['A', newBoard],
  updateBoard: ['A', 'a1', { width: 500 }],
  removeBoard: ['A', 'a2'],
  duplicateBoard: ['A', 'a1'],
  removeBoards: ['A', ['a1', 'a2']],
  duplicateBoards: ['A', ['a1', 'a2']],
  nudgeBoards: ['A', ['a1'], { x: 10, y: 0, z: 0 }],
  setBoardsRole: ['A', ['a1'], 'carcass'],
  moveBoardToAssembly: ['A', 'a2', 'B'],
  moveBoardsToAssembly: ['A', ['a2'], 'B'],
  addJoint: ['A', { type: 'screw', boardA: 'a1', boardB: 'b1', position: { x: 0, y: 0, z: 0 }, fasteners: [] }],
  updateJoint: ['A', 'j1', { type: 'glued' }],
  removeJoint: ['A', 'j1'],
  addBoardsBatch: ['A', [newBoard]],
  setParameter: ['H', 700],
  removeParameter: ['H'],
  renameParameter: ['H', 'HH'],
  setMaterialPrice: [materials[0].id, 12.5],
  addCustomMaterial: [{ ...materialData, name: 'Neu' }],
  removeCustomMaterial: ['cm1'],
  updateCustomMaterial: ['cm1', { name: 'Anders' }],
  addCustomHardware: [{ name: 'Knopf', nameEn: 'Knob', category: 'handle', unitPrice: 1 }],
  removeCustomHardware: ['h1'],
  setLaborDetails: [5, 40, 0.1],
  addHardwareToBoard: ['A', 'a1', hardwareItems[0].id, 1]
}
/** What the assembly workspace may change: the plan, and what is about the file. */
const PLAN_ACTIONS = {
  setAssemblySteps: [[{ id: 's9', title: 'Neu', boardIds: ['a2'] }]],
  addAssemblyStep: ['Drei'],
  updateAssemblyStep: ['s1', { title: 'Erster' }],
  removeAssemblyStep: ['s1'],
  moveAssemblyStep: ['s2', 0],
  assignBoardsToStep: [['a2'], 's1'],
  setProjectName: ['Neu'],
  setDisplayUnit: ['cm'],
  setLanguage: ['en']
}
/** Not a change of the open project's content: tested on their own below. */
const FILE_ACTIONS = ['markSaved', 'loadProject', 'resetProject']

const actionNames = () => Object.entries(store()).filter(([, v]) => typeof v === 'function').map(([k]) => k)

test('every store action is sorted: design, plan or file (a new one must say which)', () => {
  const known = new Set([...Object.keys(DESIGN_ACTIONS), ...Object.keys(PLAN_ACTIONS), ...FILE_ACTIONS])
  const unsorted = actionNames().filter((n) => !known.has(n))
  assert.deepEqual(unsorted, [], `add these to DESIGN_ACTIONS or PLAN_ACTIONS: ${unsorted.join(', ')}`)
})

test('in the design workspace each design action does change the design (the check below is not empty)', () => {
  for (const [name, args] of Object.entries(DESIGN_ACTIONS)) {
    fixture()
    const before = store().project
    store()[name](...structuredClone(args))
    assert.ok(designChanged(before, store().project), `${name} changed nothing — fix its arguments here`)
  }
})

test('in the assembly workspace every design action is refused, says where it belongs and leaves no undo step', () => {
  for (const [name, args] of Object.entries(DESIGN_ACTIONS)) {
    fixture()
    ui().setWorkspace('assembly')
    const before = store().project
    const steps = useProjectStore.temporal.getState().pastStates.length
    const result = store()[name](...structuredClone(args))
    assert.equal(store().project, before, `${name} changed the project in the assembly workspace`)
    assert.ok(!result || (Array.isArray(result) && result.length === 0), `${name} answered ${JSON.stringify(result)} although nothing was made`)
    assert.equal(useProjectStore.temporal.getState().pastStates.length, steps, `${name} left an undo step`)
    assert.deepEqual(told, ['change'], `${name} did not tell the user`)
  }
})

test('in the assembly workspace the plan and the file data change, the design does not', () => {
  for (const [name, args] of Object.entries(PLAN_ACTIONS)) {
    fixture()
    ui().setWorkspace('assembly')
    const before = store().project
    store()[name](...structuredClone(args))
    assert.notEqual(store().project, before, `${name} was refused in the assembly workspace`)
    assert.ok(!designChanged(before, store().project), `${name} changed the design`)
    assert.deepEqual(told, [], `${name} told the user off`)
  }
})

test('opening or starting a project works in the assembly workspace', () => {
  ui().setWorkspace('assembly')
  store().loadProject({ name: 'Anderes', assemblies: [{ id: 'X', name: 'X', boards: [board('x1')], joints: [] }] })
  assert.equal(store().project.name, 'Anderes')
  store().resetProject()
  assert.equal(store().project.assemblies.length, 0)
  assert.deepEqual(told, [])
})

test('⌘Z in the assembly workspace takes back plan changes only; the design takes back its own', () => {
  store().updateBoard('A', 'a1', { width: 500 })          // design, in the design workspace
  ui().setWorkspace('assembly')
  store().updateAssemblyStep('s1', { title: 'Erster' })   // plan, in the assembly workspace
  assert.equal(undo(), true)
  assert.equal(store().project.assemblySteps[0].title, 'Eins', 'the plan change is undone')
  const before = store().project
  assert.equal(undo(), false, 'the design change is not undone here')
  assert.equal(store().project, before)
  assert.deepEqual(told, ['undo'])
  assert.equal(redo(), true, 'the plan change comes back')
  assert.equal(store().project.assemblySteps[0].title, 'Erster')
  ui().setWorkspace('design')
  undo()
  assert.equal(undo(), true, 'in the design workspace the design change is undone')
  assert.equal(store().project.assemblies[0].boards[0].width, 600)
  ui().setWorkspace('assembly')
  told.length = 0
  assert.equal(redo(), false, 'redoing the design change waits for the design workspace')
  assert.deepEqual(told, ['redo'])
})

test('entering the assembly workspace closes the design tools and the context menu', () => {
  const flags = ['showKorpusPanel', 'showDrawerCalcPanel', 'showHingeCalcPanel', 'showTolerancePanel',
    'showParametersPanel', 'showMaterialsPanel', 'showChatPanel', 'showJointDialog']
  useUIStore.setState({ ...Object.fromEntries(flags.map((f) => [f, true])), showCuttingList: true,
    contextMenu: { x: 1, y: 1, assemblyId: 'A', boardId: 'a1' } })
  ui().setWorkspace('assembly')
  for (const f of flags) assert.equal(ui()[f], false, `${f} stays open`)
  assert.equal(ui().contextMenu, null)
  assert.equal(ui().showCuttingList, true, 'reading panels stay open')
})

// ── the screen ──────────────────────────────────────────────────────────────────────

const ROOT = new URL('../../src/renderer/src/', import.meta.url).pathname
/** Not the screen: the store applies the lock, the rest holds no calls */
const SKIP = /^(store|types|i18n|data)\//
/** Services that change the design for the screen (services/partNumbers.ts) */
const DESIGN_SERVICES = ['renumberPartsAsked', 'setShortNameTold']
const READS_LOCK = /useDesignLocked\(|isDesignLocked\(|designLockedIn\b/
const SAYS_WHY = /design-lock-ok: \S/

async function sources(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await sources(path))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path)
  }
  return out
}
/** The code without comments (a comment neither calls nor reads anything) */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/** A file cut at its top-level declarations: each component or function on its own,
 *  with the comment right above it (where a `design-lock-ok` reason sits) */
const TOP = /^(export\s+)?(default\s+)?(async\s+)?(function|const|let|class)\b/
const COMMENT = /^\s*(\/\/|\/\*|\*)/
function declarations(text) {
  const lines = text.split('\n')
  const parts = []
  let current = null
  lines.forEach((line, i) => {
    if (TOP.test(line)) {
      let above = i
      while (above > 0 && COMMENT.test(lines[above - 1])) above--
      current = { line: i + 1, text: '', note: lines.slice(above, i).join('\n') }
      parts.push(current)
    }
    if (current) current.text += line + '\n'
  })
  return parts
}

test('every function or component that can change the design reads the lock (or says why not)', async () => {
  const actions = [...Object.keys(DESIGN_ACTIONS), ...DESIGN_SERVICES]
  const uses = new RegExp(`\\b(${actions.join('|')})\\b`)
  const offenders = []
  let checked = 0
  for (const file of await sources(ROOT)) {
    const rel = relative(ROOT, file)
    if (SKIP.test(rel)) continue
    for (const part of declarations(await readFile(file, 'utf8'))) {
      const found = code(part.text).match(uses)
      if (!found) continue
      checked++
      if (!READS_LOCK.test(code(part.text)) && !SAYS_WHY.test(part.note + part.text)) offenders.push(`${rel}:${part.line} (${found[1]})`)
    }
  }
  assert.ok(checked >= 25, `only ${checked} places found — has the scan gone blind?`)
  assert.deepEqual(offenders, [], 'these change the design without reading the lock (store/designLock.ts)')
})

test('undo and redo go through services/history.ts only', async () => {
  const offenders = []
  for (const file of await sources(ROOT)) {
    const rel = relative(ROOT, file)
    if (rel === 'services/history.ts' || rel.startsWith('store/')) continue
    code(await readFile(file, 'utf8')).split('\n').forEach((text, i) => {
      const line = text.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")   // a text key like 'actions.undo' is no call
      // s.undo, .undo(), passing .undo along, or { undo } taken from the history store
      if (/\.(undo|redo)\b/.test(line) || (/\b(undo|redo)\b/.test(line) && /temporal/.test(line))) offenders.push(`${rel}:${i + 1}  ${text.trim()}`)
    })
  }
  assert.deepEqual(offenders, [], 'call undo()/redo() from services/history.ts, which keeps to the design lock')
})

test('a direct write to the project store, past its lock, says why it is safe', async () => {
  const offenders = []
  for (const file of await sources(ROOT)) {
    const rel = relative(ROOT, file)
    if (rel.startsWith('store/')) continue
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (/useProjectStore\.setState\(|temporal\.setState\(/.test(code(line)) && !SAYS_WHY.test(line) && !SAYS_WHY.test(lines[i - 1] ?? '')) {
        offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
      }
    })
  }
  assert.deepEqual(offenders, [])
})
