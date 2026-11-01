// Layout rules of the canvas chrome (components/layout/layoutRules.ts) and the
// UI-store defaults behind them: HUD compaction, selection-pill clamping,
// fit-view bounds, joint layer off by default, remembered HUD fold state.
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
// the store reads its remembered flags from localStorage at import time
const mem = new Map([['abrichten-welcomed', '1'], ['abrichten-hud-collapsed', '1']])
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
})

const {
  isHudAutoCompact, HUD_COMPACT_BELOW_PX, clampCentre, fitBounds, EMPTY_FIT_BOUNDS, SNAP_SIZES
} = await import('../../src/renderer/src/components/layout/layoutRules.ts')
const { useUIStore } = await import('../../src/renderer/src/store/useUIStore.ts')

test('HUD folds itself in the quad layout and on narrow canvases', () => {
  assert.equal(isHudAutoCompact(1600, 'single'), false)
  assert.equal(isHudAutoCompact(HUD_COMPACT_BELOW_PX, 'single'), false)
  assert.equal(isHudAutoCompact(HUD_COMPACT_BELOW_PX - 1, 'single'), true)
  assert.equal(isHudAutoCompact(2400, 'quad'), true)
})

test('selection pill: clamped fully inside its canvas with a margin', () => {
  const area = { width: 400, height: 300 }
  const box = { width: 120, height: 30 }
  // inside: unchanged
  assert.deepEqual(clampCentre(200, 150, box, area), [200, 150])
  // off the left/top edge: pushed in so its edge sits 8 px inside
  assert.deepEqual(clampCentre(-50, -80, box, area), [68, 23])
  // off the right/bottom edge
  assert.deepEqual(clampCentre(990, 990, box, area), [332, 277])
  // wider than the canvas: centred on that axis
  assert.deepEqual(clampCentre(10, 150, { width: 500, height: 30 }, area), [200, 150])
})

test('fit bounds: box around all boards; an empty project frames the first metre', () => {
  assert.deepEqual(fitBounds([]), EMPTY_FIT_BOUNDS)
  const boards = [
    { position: { x: 0, y: 0, z: 0 }, width: 600, height: 18, depth: 300 },
    { position: { x: -100, y: 500, z: 20 }, width: 50, height: 720, depth: 400 }
  ]
  assert.deepEqual(fitBounds(boards), { minX: -100, maxX: 600, minY: 0, maxY: 1220, minZ: 0, maxZ: 420 })
})

test('status bar offers the snap sizes in ascending order, incl. the 10 mm default', () => {
  assert.deepEqual([...SNAP_SIZES].sort((a, b) => a - b), [...SNAP_SIZES])
  assert.ok(SNAP_SIZES.includes(useUIStore.getState().snapSize))
})

test('joint layer is off by default; the toggle still works', () => {
  const ui = () => useUIStore.getState()
  assert.equal(ui().showJointMarkers, false)
  ui().toggleJointMarkers()
  assert.equal(ui().showJointMarkers, true)
  ui().toggleJointMarkers()
})

test('HUD fold state is read from and written to localStorage', () => {
  const ui = () => useUIStore.getState()
  assert.equal(ui().hudCollapsed, true) // stored '1' before import
  ui().setHudCollapsed(false)
  assert.equal(ui().hudCollapsed, false)
  assert.equal(mem.get('abrichten-hud-collapsed'), '0')
  ui().setHudCollapsed(true)
  assert.equal(mem.get('abrichten-hud-collapsed'), '1')
})
