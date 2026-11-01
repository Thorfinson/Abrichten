// Guards utils/beam.ts, the finite-element beam behind the load simulation, against
// closed-form results: simply supported beams under uniform and centre point load,
// two equal spans, an overhang, and supports that can only push.
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
const { solveBeam } = await import('../../src/renderer/src/utils/beam.ts')

const EI = 2e11 // N·mm²
const pin = (at, unilateral = false) => ({ from: at, to: at, unilateral, weight: 1 })
const close = (actual, expected, rel = 1e-6, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), `${msg} ${actual} ≠ ${expected}`)
const at = (r, x) => r.x.findIndex((v) => Math.abs(v - x) < 1e-6)

test('simply supported, uniform load: δ = 5qL⁴/384EI, M = qL²/8, R = qL/2', () => {
  const L = 1000, q = 0.5
  const r = solveBeam({ length: L, EI: () => EI, uniform: [{ from: 0, to: L, q }], points: [], supports: [pin(0), pin(L)] })
  const mid = at(r, L / 2)
  close(r.w[mid], (5 * q * L ** 4) / (384 * EI), 1e-9, 'δ')
  close(r.M[mid], (q * L ** 2) / 8, 1e-9, 'M')
  close(r.R[0], (q * L) / 2, 1e-9, 'R')
  assert.ok(r.x.length >= 41, 'at least 40 elements')
})

test('centre point load: δ = PL³/48EI, M = PL/4', () => {
  const L = 800, P = 300
  const r = solveBeam({ length: L, EI: () => EI, uniform: [], points: [{ at: L / 2, P }], supports: [pin(0), pin(L)] })
  const mid = at(r, L / 2)
  close(r.w[mid], (P * L ** 3) / (48 * EI), 1e-9, 'δ')
  close(r.M[mid], (P * L) / 4, 1e-9, 'M')
})

test('two equal spans, uniform load: middle reaction 1.25·qL, support moment −qL²/8', () => {
  const L = 600, q = 1
  const r = solveBeam({ length: 2 * L, EI: () => EI, uniform: [{ from: 0, to: 2 * L, q }], points: [], supports: [pin(0), pin(L), pin(2 * L)] })
  const mid = at(r, L)
  close(r.R[mid], 1.25 * q * L, 1e-9, 'R middle')
  close(r.R[0], 0.375 * q * L, 1e-9, 'R end')
  close(r.M[mid], -(q * L ** 2) / 8, 1e-9, 'M support')
})

test('overhang: support moment −q·a²/2', () => {
  const Ls = 800, a = 300, q = 0.8
  const r = solveBeam({ length: Ls + a, EI: () => EI, uniform: [{ from: 0, to: Ls + a, q }], points: [], supports: [pin(0), pin(Ls)] })
  close(r.M[at(r, Ls)], -(q * a ** 2) / 2, 1e-9, 'M support')
  // the free end of a cantilever deflects; reactions balance the load
  assert.ok(r.R[0] + r.R[at(r, Ls)] - q * (Ls + a) < 1e-6)
})

test('a beam resting on a wide support lifts off its inner edge instead of being clamped', () => {
  // 1000 long, resting on two 50 mm wide blocks at the ends: acts as simply supported between the inner edges
  const L = 1000, q = 0.5
  const block = (from, to) => ({ from, to, unilateral: true, weight: 1 })
  const r = solveBeam({ length: L, EI: () => EI, uniform: [{ from: 0, to: L, q }], points: [], supports: [block(0, 50), block(950, 1000)] })
  assert.ok(r.R.every((R) => R >= -1e-9), 'no support pulls')
  assert.ok(r.held[at(r, 50)] && r.held[at(r, 950)], 'inner edges carry')
  assert.ok(!r.held[0] && !r.held[r.x.length - 1], 'outer edges lift off')
  // the same supports held both ways clamp the beam: less sag
  const clamped = solveBeam({ length: L, EI: () => EI, uniform: [{ from: 0, to: L, q }], points: [], supports: [{ ...block(0, 50), unilateral: false }, { ...block(950, 1000), unilateral: false }] })
  assert.ok(Math.max(...clamped.w) < Math.max(...r.w) / 3)
  // simply supported over the 900 mm between the inner edges (the 50 mm ends barely matter)
  close(Math.max(...r.w), (5 * q * 900 ** 4) / (384 * EI), 0.02, 'δ')
})

test('a mechanism returns null: one support, or a load that tips the beam off its only resting point', () => {
  assert.equal(solveBeam({ length: 500, EI: () => EI, uniform: [{ from: 0, to: 500, q: 1 }], points: [], supports: [pin(500)] }), null)
  // a 1000 long board resting on a 40 mm block near one end: it tips
  const r = solveBeam({ length: 1000, EI: () => EI, uniform: [{ from: 0, to: 1000, q: 1 }], points: [], supports: [{ from: 900, to: 940, unilateral: true, weight: 1 }] })
  assert.equal(r, null)
})

test('reaction pieces split a shared node by weight and sum to the load', () => {
  const L = 600, q = 1
  const r = solveBeam({
    length: L, EI: () => EI, uniform: [{ from: 0, to: L, q }], points: [],
    supports: [{ from: 0, to: 0, unilateral: false, weight: 3 }, { from: 0, to: 0, unilateral: false, weight: 1 }, pin(L)]
  })
  const sum = (i) => r.pieces[i].reduce((s, p) => s + p.R, 0)
  close(sum(0), 0.75 * (q * L) / 2, 1e-9)
  close(sum(1), 0.25 * (q * L) / 2, 1e-9)
  close(sum(0) + sum(1) + sum(2), q * L, 1e-9)
})
