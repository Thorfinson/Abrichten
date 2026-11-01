// Guards the modal bookkeeping in store/useUIStore.ts that useKeyboard relies on: it must see
// every open modal (so global shortcuts pause) and Esc must close the topmost one first.
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
// the store reads onboarding flags from localStorage at import time
const mem = new Map([['abrichten-welcomed', '1']])
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
})
const { useUIStore, topModal } = await import('../../src/renderer/src/store/useUIStore.ts')

test('no modal open: topModal is null', () => {
  assert.equal(topModal(useUIStore.getState()), null)
})

test('every panel flag counts as a modal', () => {
  for (const flag of ['showCuttingList', 'showCostPanel', 'settingsOpen', 'showJointDialog', 'showPanelHub', 'showMaterialsPanel']) {
    useUIStore.setState({ [flag]: true })
    assert.equal(topModal(useUIStore.getState()), flag)
    useUIStore.getState().closeTopModal()
    assert.equal(useUIStore.getState()[flag], false, `${flag} closed`)
  }
})

test('Esc order: context menu, then palette, then the panel underneath', () => {
  useUIStore.setState({
    showCuttingList: true, showCommandPalette: true,
    contextMenu: { x: 1, y: 2, boardId: 'b', assemblyId: 'a' }
  })
  const ui = () => useUIStore.getState()
  ui().closeTopModal()
  assert.equal(ui().contextMenu, null)
  assert.equal(ui().showCommandPalette, true)
  ui().closeTopModal()
  assert.equal(ui().showCommandPalette, false)
  assert.equal(ui().showCuttingList, true)
  ui().closeTopModal()
  assert.equal(ui().showCuttingList, false)
  assert.equal(topModal(ui()), null)
})

test('the welcome screen is a modal until dismissed', () => {
  useUIStore.setState({ hasSeenWelcome: false })
  assert.equal(topModal(useUIStore.getState()), 'welcome')
  useUIStore.getState().closeTopModal()
  assert.equal(useUIStore.getState().hasSeenWelcome, true)
  assert.equal(mem.get('abrichten-welcomed'), '1')
})
