// Guards the drag bracket (utils/transformLock.ts + utils/dragHistory.ts): Esc during a gizmo
// drag restores the pre-drag project, resumes undo tracking and leaves no stale snapshot behind.
import { test } from 'node:test'
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
const { beginDragHistory, endDragHistory, cancelDragHistory } = await import('../../src/renderer/src/utils/dragHistory.ts')
const { beginTransform, endTransform, cancelTransform, isDragActive } = await import('../../src/renderer/src/utils/transformLock.ts')

function setup() {
  const st = useProjectStore.getState()
  const aid = st.addAssembly('A')
  const bid = st.addBoard(aid, {
    name: 'B', width: 100, height: 18, depth: 100, materialId: 'buche', color: '#fff',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }
  })
  useProjectStore.temporal.getState().clear()
  const x = () => useProjectStore.getState().project.assemblies.find((a) => a.id === aid).boards.find((b) => b.id === bid).position.x
  const move = (v) => useProjectStore.getState().updateBoard(aid, bid, { position: { x: v, y: 0, z: 0 } })
  return { x, move }
}

test('cancelDragHistory restores the pre-drag project and adds no undo step', () => {
  const { x, move } = setup()
  beginDragHistory()
  move(50); move(80)
  cancelDragHistory()
  assert.equal(x(), 0)
  assert.equal(useProjectStore.temporal.getState().pastStates.length, 0)
  assert.equal(useProjectStore.temporal.getState().isTracking, true, 'undo tracking resumed')
})

test('after a cancel the next drag takes a fresh snapshot (one Ctrl+Z reverts only that drag)', () => {
  const { x, move } = setup()
  beginDragHistory(); move(50); cancelDragHistory()
  move(10)                       // a normal edit, tracked
  beginDragHistory(); move(90); endDragHistory()
  assert.equal(x(), 90)
  useProjectStore.temporal.getState().undo()
  assert.equal(x(), 10, 'undo returns to the state right before the second drag')
})

test('cancelTransform runs the active handle\'s cancel callback once and ends the drag', () => {
  let cancelled = 0
  beginTransform(() => { cancelled++ })
  assert.equal(isDragActive(), true)
  assert.equal(cancelTransform(), true)
  assert.equal(cancelled, 1)
  assert.equal(isDragActive(), false)
  assert.equal(cancelTransform(), false, 'nothing to cancel any more')
  beginTransform(() => { cancelled++ })
  endTransform()
  assert.equal(cancelTransform(), false, 'a finished drag cannot be cancelled')
  assert.equal(cancelled, 1)
})
