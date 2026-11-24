// Guards the step view of the assembly workspace as one rule: what it hides (parts of later
// steps, parts in no step) can neither be seen nor picked — ⌘A, the marquee and every layer
// over the boards use stepHiddenIds (utils/assemblySteps.ts, store/useUIStore.ts).
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
const mem = new Map([['abrichten-welcomed', '1']])
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
})
const { stepHiddenIds } = await import('../../src/renderer/src/utils/assemblySteps.ts')
const { useUIStore, shownStep } = await import('../../src/renderer/src/store/useUIStore.ts')
const { useProjectStore } = await import('../../src/renderer/src/store/useProjectStore.ts')

const board = (id) => ({ id, name: id, width: 600, height: 18, depth: 560, position: { x: 0, y: 0, z: 0 }, materialId: 'spanplatte' })
/** Carcass (side, bottom) in step 1, back in step 2, the front in no step */
const project = () => ({
  id: 'p', name: 'P',
  assemblies: [{ id: 'a', name: 'Schrank', visible: true, boards: ['side', 'bottom', 'back', 'front'].map(board), joints: [] }],
  assemblySteps: [{ id: 's1', title: 'Korpus', boardIds: ['side', 'bottom'] }, { id: 's2', title: 'Rückwand', boardIds: ['back'] }]
})
const ui = () => useUIStore.getState()

beforeEach(() => {
  useProjectStore.getState().loadProject(project())
  ui().setWorkspace('design')
  ui().deselectAll()
})

test('what the step view hides: later steps and parts in no step; nothing outside it', () => {
  const p = project()
  assert.deepEqual([...stepHiddenIds(p, -1)], [])
  assert.deepEqual([...stepHiddenIds(p, 0)].sort(), ['back', 'front'])
  assert.deepEqual([...stepHiddenIds(p, 1)], ['front'])
  assert.deepEqual([...stepHiddenIds({ ...p, assemblySteps: [] }, 0)], [], 'no steps: the model as usual')
})

test('the shown step is the workspace’s, only in the assembly workspace', () => {
  ui().setAssemblyStep(1)
  assert.equal(shownStep(ui()), -1)
  ui().setWorkspace('assembly')
  assert.equal(shownStep(ui()), 1)
})

test('⌘A picks only the parts you can see', () => {
  ui().selectAllBoards('a')
  assert.deepEqual(ui().selectedBoardIds, ['side', 'bottom', 'back', 'front'], 'design: all')
  ui().setWorkspace('assembly')
  ui().setAssemblyStep(0)
  ui().selectAllBoards('a')
  assert.deepEqual(ui().selectedBoardIds, ['side', 'bottom'])
  ui().setAssemblyStep(1)
  ui().selectAllBoards('a')
  assert.deepEqual(ui().selectedBoardIds, ['side', 'bottom', 'back'])
})

test('stepping back drops the parts it hides from the selection, so Del cannot hit them', () => {
  ui().setWorkspace('assembly')
  ui().setAssemblyStep(1)
  ui().selectAllBoards('a')
  ui().setAssemblyStep(0)
  assert.deepEqual(ui().selectedBoardIds, ['side', 'bottom'])
  // nothing hidden: the selection stays as it is (same array)
  const before = ui().selectedBoardIds
  ui().setAssemblyStep(0)
  assert.equal(ui().selectedBoardIds, before)
})
