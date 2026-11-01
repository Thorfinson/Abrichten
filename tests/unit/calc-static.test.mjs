// Guards services/static-calc.ts and the material data behind the load simulation:
// the rating rule (utilisation, deflection limits, γ_M), the minimum-thickness advice,
// the one colour scale, and characteristic strengths instead of clear-wood lab values.
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
const { rateMember, minBeamThickness, minPanelThickness, utilisationRgb, UTILISATION_STOPS, UTILISATION_GRADIENT_CSS } =
  await import('../../src/renderer/src/services/static-calc.ts')
const { getMaterialById, GAMMA_M, materials } = await import('../../src/renderer/src/data/materials.ts')

test('rating: breaks at u ≥ 1 or span/200, warns once the safety margin 1/γ_M is used or at span/300', () => {
  assert.equal(rateMember(1.0, 0, 1.3), 'critical')
  assert.equal(rateMember(0.5, 1 / 199, 1.3), 'critical')
  assert.equal(rateMember(1 / 1.3, 0, 1.3), 'warning')
  assert.equal(rateMember(0.76, 0, 1.3), 'ok')
  assert.equal(rateMember(0.6, 0, 2.0), 'warning', 'stone and glass warn from 50 %')
  assert.equal(rateMember(0.2, 1 / 299, 1.3), 'warning')
  assert.equal(rateMember(0.2, 1 / 301, 1.3), 'ok')
})

test('minimum thickness: stress ∝ 1/h², deflection ∝ 1/h³, 20 % load margin, rounded up', () => {
  // u = 1.0 at 18 mm, γ = 1.3: h·√(1.2·1.3) = 18·1.249 = 22.48 → 23
  assert.equal(minBeamThickness(18, 1.0, 1.3, 0, 1), 23)
  // deflection twice the limit: 18·∛2.4 = 24.1 → 25
  assert.equal(minBeamThickness(18, 0.1, 1.3, 4, 2), 25)
  // nothing to advise when the board passes with the margin
  assert.equal(minBeamThickness(18, 0.3, 1.3, 1, 2), null)
  // the advice passes: at h_min the scaled utilisation stays below 1/γ_M / 1.2
  const h = minBeamThickness(19, 1.4, 1.3, 0, 1)
  assert.ok(1.4 * (19 / h) ** 2 <= 1 / 1.3 / 1.2 + 1e-9)
  // standing panel: compression ∝ 1/t, buckling ∝ 1/t³
  assert.equal(minPanelThickness(8, 0.01, 2.0, 1.3), Math.ceil(8 * Math.cbrt(1.2 * 2 * 1.3)))
  assert.equal(minPanelThickness(18, 0.01, 0.01, 1.3), null)
})

test('one colour scale: green 0 %, yellow 50 %, orange 80 %, red from 100 %', () => {
  assert.deepEqual(UTILISATION_STOPS.map((s) => s.at), [0, 0.5, 0.8, 1])
  const [r0, g0] = utilisationRgb(0)
  assert.ok(g0 > r0, 'green at 0 %')
  const [r1, g1, b1] = utilisationRgb(1)
  assert.ok(r1 > 0.9 && g1 < 0.4 && b1 < 0.4, 'red at 100 %')
  assert.deepEqual(utilisationRgb(3), utilisationRgb(1), 'beyond 100 % stays red')
  assert.deepEqual(utilisationRgb(Number.NaN), utilisationRgb(1))
  assert.match(UTILISATION_GRADIENT_CSS, /^linear-gradient\(to right, #22c55e 0%.*#ef4444 100%\)$/)
})

test('strengths are characteristic values with γ_M per category', () => {
  // EN 338 C24 for spruce and pine, not the 80 / 85 N/mm² of clear wood
  assert.equal(getMaterialById('fichte').bendingStrength, 24)
  assert.equal(getMaterialById('kiefer').bendingStrength, 24)
  assert.equal(getMaterialById('fichte').compressiveStrength, 21)
  assert.ok(getMaterialById('buche').bendingStrength <= 40, 'beech: a D-class value')
  assert.equal(getMaterialById('spanplatte').bendingStrength, 11)   // EN 312 P2, 13–20 mm
  assert.equal(getMaterialById('mdf').bendingStrength, 20)          // EN 622-5, 12–19 mm
  assert.equal(getMaterialById('floatglas').bendingStrength, 45)    // EN 572
  assert.equal(getMaterialById('esg').bendingStrength, 120)         // EN 12150
  assert.equal(getMaterialById('stahl').bendingStrength, 235)       // S235
  assert.equal(getMaterialById('fichte').eModul, 11000)             // C24 E0,mean
  assert.deepEqual(GAMMA_M, { solid_wood: 1.3, panel: 1.3, stone: 2.0, glass: 2.0, metal: 1.1 })
  for (const m of materials) assert.ok(m.bendingStrength > 0 && m.eModul > 0, m.id)
})
