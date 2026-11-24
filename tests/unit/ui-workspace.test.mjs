// Guards the workspaces in store/useUIStore.ts (design and assembly — assembly mode is
// the assembly workspace) and the flat part groups of utils/boardGroups.ts that the
// parts column shows.
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
const mem = new Map([['abrichten-welcomed', '1']])
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
})
const { useUIStore, shownStep } = await import('../../src/renderer/src/store/useUIStore.ts')
const { groupBoards, ROLE_COLORS, NO_ROLE_COLOR } = await import('../../src/renderer/src/utils/boardGroups.ts')

const ui = () => useUIStore.getState()

test('the assembly workspace is assembly mode, both ways (one state, no second flag)', () => {
  assert.equal(ui().workspace, 'design')
  assert.equal(shownStep(ui()), -1, 'no step view in design')
  ui().selectBoard('a', 'b1')
  ui().setWorkspace('assembly')
  assert.equal(shownStep(ui()), ui().assemblyStep)
  assert.equal('assemblyMode' in ui(), false)
  assert.deepEqual(ui().selectedBoardIds, [], 'entering assembly clears the selection')
  ui().setAssemblyMode(false)
  assert.equal(ui().workspace, 'design')
  ui().setAssemblyMode(true)
  assert.equal(ui().workspace, 'assembly')
  ui().setWorkspace('design')
  assert.equal(shownStep(ui()), -1)
})

test('an unknown or removed workspace changes nothing', () => {
  for (const w of ['production', 'kitchen']) {
    ui().setWorkspace(w)
    assert.equal(ui().workspace, 'design')
  }
})

test('the parts column groups by assembly until another grouping is chosen', () => {
  assert.equal(ui().drawerGroupBy, 'assembly')
  ui().setDrawerGroupBy('material')
  assert.equal(ui().drawerGroupBy, 'material')
  ui().setDrawerGroupBy('assembly')
})

const b = (id, extra = {}) => ({ id, name: id, width: 600, height: 18, depth: 400, position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, materialId: 'spanplatte', color: '#ccc', ...extra })

test('groups by part role in role order, parts without one last', () => {
  const groups = groupBoards([
    { id: 'A', name: 'A', visible: true, boards: [b('x'), b('front', { role: 'visible' }), b('side', { role: 'carcass' })], joints: [] },
    { id: 'B', name: 'B', visible: true, boards: [b('rw', { role: 'back' }), b('side2', { role: 'carcass' })], joints: [] }
  ], 'role')
  assert.deepEqual(groups.map((g) => [g.key, g.items.map((i) => i.board.id)]), [
    ['visible', ['front']], ['carcass', ['side', 'side2']], ['back', ['rw']], ['none', ['x']]
  ])
  assert.equal(groups[0].label, 'role.visible')
  assert.equal(groups[0].color, ROLE_COLORS.visible)
  assert.equal(groups[3].color, NO_ROLE_COLOR)
  assert.equal(groups[1].items[1].assemblyId, 'B', 'each part keeps its assembly for selecting it')
})

test('groups by material and thickness, by name then thickness', () => {
  const groups = groupBoards([
    { id: 'A', name: 'A', visible: true, boards: [
      b('s25', { height: 25 }), b('m18', { materialId: 'multiplex-birke' }), b('s19', { height: 19 }), b('s19b', { height: 19 })
    ], joints: [] }
  ], 'material', undefined, 'de')
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [
    ['Multiplex Birke 18 mm', 1], ['Spanplatte 19 mm', 2], ['Spanplatte 25 mm', 1]
  ])
  assert.equal(groups[1].key, 'spanplatte|19')
})
