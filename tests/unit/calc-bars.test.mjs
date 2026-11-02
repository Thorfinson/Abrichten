// Guards the bar stock cut plan of the cut list (utils/barCutting.ts) and the plain-number
// length format of its tables (utils/units.ts formatNumber).
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
const { planBars, DEFAULT_BAR_SETTINGS } = await import('../../src/renderer/src/utils/barCutting.ts')
const { formatNumber } = await import('../../src/renderer/src/utils/units.ts')

const part = (name, length, width = 60, thickness = 40, materialId = 'fichte') => ({ name, materialId, length, width, thickness })

test('bar stock is packed longest first onto bars, with kerf and end trim', () => {
  const settings = { stockMm: 1000, kerfMm: 5, trimMm: 10 }   // 980 usable
  const groups = planBars([part('a', 400), part('b', 600), part('c', 300), part('d', 500)], settings)
  assert.equal(groups.length, 1)
  const g = groups[0]
  assert.deepEqual([g.count, g.totalMm, g.width, g.thickness], [4, 1800, 60, 40])
  // 600 + 5 + 300 fits 980, 600 + 5 + 400 does not
  assert.deepEqual(g.bars.map((b) => b.pieces.map((p) => p.name)), [['b', 'c'], ['d', 'a']])
  assert.deepEqual(g.bars.map((b) => b.restMm), [75, 75])
  // a piece longer than a trimmed bar is listed, not placed
  const long = planBars([part('rail', 990), part('post', 700)], settings)[0]
  assert.deepEqual(long.tooLong.map((p) => p.name), ['rail'])
  assert.equal(long.bars.length, 1)
})

test('only solid wood bars count: panels, thin fronts and wide boards stay sheet parts; sections apart', () => {
  const groups = planBars([
    part('batten', 800),
    part('square', 700, 40, 40),
    part('ply strip', 500, 70, 15, 'multiplex-birke'),
    part('beech front', 590, 100, 18, 'buche'),
    part('beech top', 900, 300, 30, 'buche')
  ], DEFAULT_BAR_SETTINGS)
  assert.deepEqual(groups.map((g) => [g.width, g.thickness, g.count]), [[60, 40, 1], [40, 40, 1]])
})

test('cut list lengths: plain numbers in the display unit, no thousands separator', () => {
  assert.equal(formatNumber(2660, 'cm', 'de'), '266')
  assert.equal(formatNumber(536.6, 'cm', 'de'), '53,66')
  assert.equal(formatNumber(2660, 'mm', 'de'), '2660')
  assert.equal(formatNumber(536.6, 'mm', 'en'), '536.6')
  assert.equal(formatNumber(2660, 'm', 'de'), '2,66')
})
