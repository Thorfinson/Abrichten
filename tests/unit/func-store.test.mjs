// Guards the store additions for joint editing and unsaved-changes tracking
// (store/useProjectStore.ts): updateJoint is one undo step and a no-op without
// changes; savedProject marks the clean state, and undo back to it is clean again.
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
const { useProjectStore, isProjectDirty } = await import('../../src/renderer/src/store/useProjectStore.ts')
const { beginDragHistory, endDragHistory } = await import('../../src/renderer/src/utils/dragHistory.ts')

const store = () => useProjectStore.getState()
const history = () => useProjectStore.temporal.getState()
const undoSteps = () => history().pastStates.length
const dirty = () => isProjectDirty(store())
const jointById = (id) => store().project.assemblies.flatMap((a) => a.joints).find((j) => j.id === id)

const board = (id) => ({ id, name: id, width: 600, height: 720, depth: 18, position: { x: 0, y: 0, z: 0 } })
const screw = { id: 'f1', type: 'wood_screw', diameter: 4, length: 40, quantity: 4, headType: 'countersunk', material: 'steel' }

beforeEach(() => {
  store().loadProject({
    assemblies: [{
      id: 'A', name: 'A',
      boards: [board('a1'), board('a2')],
      joints: [{ id: 'j1', type: 'butt', boardA: 'a1', boardB: 'a2', position: { x: 0, y: 0, z: 0 }, fasteners: [] }]
    }]
  })
})

test('updateJoint changes type, fasteners and note in one undo step', () => {
  store().updateJoint('A', 'j1', { type: 'dowel', fasteners: [screw], note: 'vorgebohrt' })
  assert.equal(undoSteps(), 1)
  const j = jointById('j1')
  assert.equal(j.type, 'dowel')
  assert.deepEqual(j.fasteners, [screw])
  assert.equal(j.note, 'vorgebohrt')
  assert.equal(j.boardA, 'a1', 'untouched fields stay')
  history().undo()
  assert.equal(jointById('j1').type, 'butt')
  assert.deepEqual(jointById('j1').fasteners, [])
})

test('updateJoint without a change adds no undo step', () => {
  const before = store().project
  store().updateJoint('A', 'j1', { type: 'butt', fasteners: [] })
  store().updateJoint('A', 'nope', { type: 'dowel' })
  store().updateJoint('nope', 'j1', { type: 'dowel' })
  assert.equal(undoSteps(), 0)
  assert.equal(store().project, before)
  // equal fasteners in a new array are no change either
  store().updateJoint('A', 'j1', { fasteners: [screw] })
  store().updateJoint('A', 'j1', { fasteners: [{ ...screw }] })
  assert.equal(undoSteps(), 1)
})

test('a loaded project is clean; an edit makes it dirty; markSaved cleans it', () => {
  assert.equal(dirty(), false)
  store().setProjectName('x')
  assert.equal(dirty(), true)
  const steps = undoSteps()
  store().markSaved()
  assert.equal(dirty(), false)
  assert.equal(undoSteps(), steps, 'marking as saved is not an undo step')
})

test('undo back to the saved state is clean, redo is dirty again', () => {
  store().setProjectName('x')
  store().setProjectName('y')
  assert.equal(dirty(), true)
  history().undo()
  history().undo()
  assert.equal(dirty(), false, 'undo restores the very same project object')
  history().redo()
  assert.equal(dirty(), true)
  // saved in the middle of the history: undo past it is dirty
  store().markSaved()
  history().undo()
  assert.equal(dirty(), true)
  history().redo()
  assert.equal(dirty(), false)
})

test('reset starts clean; a drag that changed nothing stays clean', () => {
  store().setProjectName('x')
  store().resetProject()
  assert.equal(dirty(), false)
  beginDragHistory()
  endDragHistory()
  assert.equal(dirty(), false)
})

test('a grouped drag history is one step and undoes to clean', () => {
  beginDragHistory()
  const asm = store().addAssembly('Schubkasten')
  store().addBoardsBatch(asm, [{ ...board('x'), id: undefined }])
  endDragHistory()
  assert.equal(undoSteps(), 1)
  assert.equal(dirty(), true)
  history().undo()
  assert.equal(store().project.assemblies.length, 1)
  assert.equal(dirty(), false)
})
