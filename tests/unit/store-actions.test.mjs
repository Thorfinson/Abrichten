// Guards project-store actions (store/useProjectStore.ts): parameters drive the
// boards that use them, undo history, and no-op / data-loss cases. The store is
// zustand + zundo without React, so it runs directly in Node.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// the app imports siblings without extension (Vite style); let Node try "<spec>.ts"
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const { useProjectStore } = await import('../../src/renderer/src/store/useProjectStore.ts')

const store = () => useProjectStore.getState()
const history = () => useProjectStore.temporal.getState()
const undoSteps = () => history().pastStates.length
const boardById = (id) => store().project.assemblies.flatMap((a) => a.boards).find((b) => b.id === id)

const board = (id, extra = {}) => ({ id, name: id, width: 600, height: 720, depth: 18, position: { x: 0, y: 0, z: 0 }, ...extra })
const joint = (id, a, b) => ({ id, type: 'butt', boardA: a, boardB: b, position: { x: 0, y: 0, z: 0 }, fasteners: [] })

/** Two assemblies; A holds a joint between a1 and b1 (in B) and one between a1 and a2. */
function fixture() {
  store().loadProject({
    parameters: { H: 720, B: 600, T: 18 },
    assemblies: [
      { id: 'A', name: 'A', boards: [
        board('a1', { height: 720, heightFormula: 'H', width: 582, widthFormula: 'B - T' }),
        board('a2', { height: 702, heightFormula: 'H - T' })
      ], joints: [joint('j-ab', 'a1', 'b1'), joint('j-aa', 'a1', 'a2')] },
      { id: 'B', name: 'B', boards: [board('b1', { depth: 600, depthFormula: 'B' }), board('b2')], joints: [joint('j-bb', 'b1', 'b2')] }
    ]
  })
}

beforeEach(() => fixture())

test('loadProject and resetProject clear the undo history', () => {
  assert.equal(undoSteps(), 0, 'nothing to undo right after loading')
  store().setProjectName('changed')
  assert.equal(undoSteps(), 1)
  store().resetProject()
  assert.equal(undoSteps(), 0, 'nothing to undo right after reset')
  fixture()
  history().undo()
  assert.equal(boardById('a1').width, 582, 'undo after load does not bring back the previous project')
})

test('no-op actions add no undo step', () => {
  store().updateBoard('A', 'nope', { width: 1 })
  store().updateBoard('nope', 'a1', { width: 1 })
  store().updateBoard('A', 'a1', { width: 582 })
  store().nudgeBoards('A', ['nope'], { x: 1, y: 0, z: 0 })
  store().removeBoards('A', ['nope'])
  store().removeBoard('A', 'b1')
  store().renameAssembly('nope', 'x')
  store().toggleAssemblyVisibility('nope')
  store().removeJoint('A', 'nope')
  store().renameParameter('nope', 'X')
  store().removeParameter('nope')
  store().setParameter('H', 720)
  store().addHardwareToBoard('A', 'nope', 'h', 1)
  assert.equal(undoSteps(), 0)
  assert.equal(boardById('b1').id, 'b1', 'removeBoard with the wrong assembly does not touch b1')
})

test('moving boards to a missing assembly keeps them', () => {
  store().moveBoardToAssembly('A', 'a1', 'missing')
  store().moveBoardsToAssembly('A', ['a1', 'a2'], 'missing')
  assert.ok(boardById('a1') && boardById('a2'))
  assert.equal(undoSteps(), 0)
  store().moveBoardsToAssembly('A', ['a2'], 'B')
  assert.ok(store().project.assemblies[1].boards.some((b) => b.id === 'a2'))
})

test('removeBoards prunes joints only of the boards it actually removed', () => {
  // b1 lives in B, so removing ['a2', 'b1'] from A removes only a2
  store().removeBoards('A', ['a2', 'b1'])
  const [A, B] = store().project.assemblies
  assert.deepEqual(A.boards.map((b) => b.id), ['a1'])
  assert.deepEqual(A.joints.map((j) => j.id), ['j-ab'], 'the a1–b1 joint survives, the a1–a2 joint goes with a2')
  assert.deepEqual(B.joints.map((j) => j.id), ['j-bb'])
  assert.equal(undoSteps(), 1)
})

test('setParameter re-evaluates every board formula in one undo step', () => {
  store().setParameter('H', 800)
  assert.equal(boardById('a1').height, 800)
  assert.equal(boardById('a2').height, 782)
  assert.equal(boardById('a1').width, 582, 'unrelated formulas keep their value')
  assert.equal(undoSteps(), 1)
  history().undo()
  assert.equal(boardById('a1').height, 720)
  assert.equal(boardById('a2').height, 702)
  assert.equal(store().project.parameters.H, 720)
})

test('setParameter keeps the last good value when a formula stops giving a usable size', () => {
  store().setParameter('T', 720)          // H - T = 0 → not a board size
  assert.equal(boardById('a2').height, 702)
  assert.equal(boardById('a2').heightFormula, 'H - T')
  store().setParameter('B', 1e9)          // beyond the size limit
  assert.equal(boardById('b1').depth, 600)
})

test('setParameter ignores names a formula could not reference', () => {
  store().setParameter('(', 1)
  store().setParameter('a b', 1)
  store().setParameter('X', NaN)
  assert.deepEqual(store().project.parameters, { H: 720, B: 600, T: 18 })
  assert.equal(undoSteps(), 0)
})

test('renameParameter onto an existing name is refused', () => {
  store().renameParameter('B', 'H')
  assert.deepEqual(store().project.parameters, { H: 720, B: 600, T: 18 })
  assert.equal(boardById('a1').widthFormula, 'B - T')
  assert.equal(undoSteps(), 0)
})

test('renameParameter rewrites formulas and re-evaluates boards whose formula now resolves', () => {
  store().loadProject({
    parameters: { H: 720, OLD: 50 },
    assemblies: [{ id: 'A', boards: [board('x', { height: 720, heightFormula: 'H' }), board('y', { width: 600, widthFormula: 'NEW * 2' })], joints: [] }]
  })
  store().renameParameter('OLD', 'NEW')
  assert.deepEqual(store().project.parameters, { H: 720, NEW: 50 })
  assert.equal(boardById('y').width, 100)
  assert.equal(boardById('x').heightFormula, 'H')
  assert.equal(undoSteps(), 1)
})

test('renameParameter with regex characters in the old name does not throw', () => {
  store().loadProject({ parameters: { H: 1 }, assemblies: [{ id: 'A', boards: [board('x', { widthFormula: 'H' })], joints: [] }] })
  assert.doesNotThrow(() => store().renameParameter('(', 'X'))
})

test('removeParameter clears the formulas that used it and keeps the numbers', () => {
  store().removeParameter('T')
  assert.deepEqual(store().project.parameters, { H: 720, B: 600 })
  assert.equal(boardById('a1').width, 582)
  assert.equal(boardById('a1').widthFormula, undefined)
  assert.equal(boardById('a1').heightFormula, 'H', 'formulas without T stay')
  assert.equal(boardById('a2').height, 702)
  assert.equal(boardById('a2').heightFormula, undefined)
  assert.equal(undoSteps(), 1)
  history().undo()
  assert.equal(boardById('a2').heightFormula, 'H - T')
})

test('setBoardsRole sets the role of several boards in one undo step', () => {
  store().setBoardsRole('A', ['a1', 'a2'], 'carcass')
  assert.equal(boardById('a1').role, 'carcass')
  assert.equal(boardById('a2').role, 'carcass')
  assert.equal(boardById('b1').role, undefined)
  assert.equal(undoSteps(), 1)
  history().undo()
  assert.equal(boardById('a1').role, undefined)
  assert.equal(boardById('a2').role, undefined)
  history().redo()
  assert.equal(boardById('a2').role, 'carcass')
})

test('setBoardsRole: clearing, no-ops and unknown roles', () => {
  store().setBoardsRole('A', ['a1'], 'visible')
  store().setBoardsRole('A', ['a1'], 'visible')          // already set
  store().setBoardsRole('A', ['a2'], undefined)          // has none
  store().setBoardsRole('A', ['b1'], 'back')             // b1 is in B, not A
  store().setBoardsRole('nope', ['a1'], 'back')
  store().setBoardsRole('A', ['a1', 'a2'], 'front')      // not a role: the validator would drop it
  assert.equal(undoSteps(), 1)
  assert.equal(boardById('a1').role, 'visible')
  assert.equal(boardById('b1').role, undefined)

  // a mixed selection takes one role; then clearing removes it from all
  store().setBoardsRole('A', ['a1', 'a2'], 'drawer')
  assert.deepEqual([boardById('a1').role, boardById('a2').role], ['drawer', 'drawer'])
  store().setBoardsRole('A', ['a1', 'a2'], undefined)
  assert.deepEqual([boardById('a1').role, boardById('a2').role], [undefined, undefined])
  assert.equal(undoSteps(), 3)
})

test('a part role survives duplicating, moving and saving + loading', () => {
  store().setBoardsRole('A', ['a2'], 'back')
  const copy = store().duplicateBoard('A', 'a2')
  assert.equal(boardById(copy).role, 'back')
  store().moveBoardsToAssembly('A', ['a2'], 'B')
  assert.equal(boardById('a2').role, 'back')
  store().loadProject(JSON.parse(JSON.stringify(store().project)))
  assert.equal(boardById('a2').role, 'back')
  assert.equal(boardById('a1').role, undefined)
})
