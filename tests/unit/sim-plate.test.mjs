// Guards utils/fe/plate.ts, the Kirchhoff plate (ACM rectangle) behind the 2D load
// simulation, against closed-form plate and beam results (Timoshenko & Woinowsky-Krieger,
// Theory of Plates and Shells): a simply supported square plate, a plate simply
// supported on two opposite edges and free on the others (narrow → the beam, wide →
// cylindrical bending with the 1 − ν² factor), a square plate on four corner points,
// orthotropy, and supports that only push.
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
const { solvePlate, isotropicRigidity, orthotropicRigidity, plateMoments } = await import('../../src/renderer/src/utils/fe/plate.ts')
const { solveBeam } = await import('../../src/renderer/src/utils/beam.ts')

const E = 10000, t = 10, q = 0.001 // N/mm², mm, N/mm²
const lines = (L, n) => Array.from({ length: n + 1 }, (_, k) => (L * k) / n)
const within = (actual, expected, rel, msg) =>
  assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), `${msg}: ${actual} vs ${expected} (${(100 * (actual / expected - 1)).toFixed(2)} %)`)

/** A plate over A × B, n × m cells, uniform pressure q, supports as node lists. */
function plate(A, B, n, m, nu, supports, extra = {}) {
  const xa = lines(A, n), xb = lines(B, m)
  const cells = new Uint8Array(n * m).fill(1)
  const D = isotropicRigidity(E, nu, t)
  const res = solvePlate({ xa, xb, cells, rigidity: () => D, pressure: new Float64Array(n * m).fill(q), patches: [], supports, ...extra })
  const node = (x, y) => xb.findIndex((v) => Math.abs(v - y) < 1e-9) * xa.length + xa.findIndex((v) => Math.abs(v - x) < 1e-9)
  return { res, xa, xb, D, node, na: xa.length, nb: xb.length }
}
const edgeNodes = (na, nb, pick) => {
  const out = []
  for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) if (pick(i, j)) out.push(j * na + i)
  return out
}

test('simply supported square plate, uniform load: w = 0.00406·qa⁴/D, M = 0.0479·qa² (ν = 0.3)', () => {
  const a = 1000
  const all = edgeNodes(21, 21, (i, j) => i === 0 || j === 0 || i === 20 || j === 20)
  const { res, D, node } = plate(a, a, 20, 20, 0.3, [{ nodes: all, unilateral: false, line: true }])
  const c = node(a / 2, a / 2)
  within(res.w[c], (0.00406 * q * a ** 4) / D.Da, 0.01, 'w_max')
  const M = plateMoments(D, res.kaa[c], res.kbb[c], res.kab[c])
  within(M.Ma, 0.0479 * q * a * a, 0.02, 'Mx at the centre')
  within(M.Mb, M.Ma, 1e-6, 'symmetric')
  // equilibrium: the reactions carry the load
  within(res.R.reduce((s, r) => s + r, 0), q * a * a, 1e-9, 'Σ R')
})

test('two opposite edges simply supported, two free: a narrow plate is the beam, a wide one bends cylindrically (1 − ν²)', () => {
  const L = 1000
  const run = (B, m) => {
    const n = 24
    const ends = edgeNodes(n + 1, m + 1, (i) => i === 0 || i === n)
    const r = plate(L, B, n, m, 0.3, [{ nodes: ends, unilateral: true, line: true }])
    return { ...r, mid: (y) => r.res.w[r.node(L / 2, y)] }
  }
  // narrow strip (B = L/10): E·I of the beam, no 1 − ν²; the beam solver agrees
  const narrow = run(100, 4)
  const I = (100 * t ** 3) / 12
  const beamW = (5 * (q * 100) * L ** 4) / (384 * E * I)
  within(narrow.mid(50), beamW, 0.02, 'narrow strip vs beam')
  const beam = solveBeam({ length: L, EI: () => E * I, uniform: [{ from: 0, to: L, q: q * 100 }], points: [], supports: [{ from: 0, to: 0, unilateral: true, weight: 1 }, { from: L, to: L, unilateral: true, weight: 1 }] })
  within(narrow.mid(50), beam.w[beam.x.findIndex((x) => Math.abs(x - L / 2) < 1e-6)], 0.02, 'narrow strip vs beam FE')
  // wide plate (B = 4L), mid-width: plate strip D = E·t³/12(1 − ν²)
  const wide = run(4000, 16)
  within(wide.mid(2000), (5 * q * L ** 4) / (384 * wide.D.Da), 0.02, 'wide plate vs cylindrical bending')
  within(wide.mid(2000) / narrow.mid(50), 1 - 0.3 ** 2, 0.03, 'ratio is 1 − ν²')
  // all reactions push
  assert.ok(Math.min(...narrow.res.R) >= -1e-9 && Math.min(...wide.res.R) >= -1e-9)
})

// Timoshenko gives 0.0249 (Marcus' approximate method); the element converges to 0.0257
// (10 × 10: 0.02547, 20 × 20: 0.02562, 40 × 40: 0.02566), +3 % on the handbook value.
test('square plate on four corner points (ν = 0.25): w_centre ≈ 0.0249·qa⁴/D (Timoshenko)', () => {
  const a = 1000
  const corners = [0, 20, 21 * 20, 21 * 21 - 1]
  const { res, D, node } = plate(a, a, 20, 20, 0.25, [{ nodes: corners, unilateral: false }])
  within(res.w[node(a / 2, a / 2)], (0.0249 * q * a ** 4) / D.Da, 0.04, 'w_centre vs Timoshenko')
  within(res.w[node(a / 2, a / 2)], (0.02566 * q * a ** 4) / D.Da, 0.005, 'w_centre vs the converged value')
  for (const c of corners) within(res.R[c], (q * a * a) / 4, 1e-6, 'each corner carries a quarter')
})

test('supports only push: the corners of a simply supported square plate lift off', () => {
  const a = 1000
  const all = edgeNodes(21, 21, (i, j) => i === 0 || j === 0 || i === 20 || j === 20)
  const { res, node } = plate(a, a, 20, 20, 0.3, [{ nodes: all, unilateral: true, line: true }])
  assert.equal(res.held[node(0, 0)], 0, 'the corner lifts')
  assert.ok(res.w[node(0, 0)] < 0, 'upward')
  assert.ok(Math.min(...res.R) >= -1e-6, 'no support pulls')
  assert.ok(res.passes > 1)
  within(res.R.reduce((s, r) => s + r, 0), q * a * a, 1e-9, 'Σ R')
})

test('orthotropic plate: stiffness along a only, so a two-way plate carries its load along a', () => {
  const A = 600, B = 300, n = 12, m = 6
  const xa = lines(A, n), xb = lines(B, m)
  const cells = new Uint8Array(n * m).fill(1)
  const ends = edgeNodes(n + 1, m + 1, (i) => i === 0 || i === n)
  const run = (D) => solvePlate({ xa, xb, cells, rigidity: () => D, pressure: new Float64Array(n * m).fill(q), patches: [], supports: [{ nodes: ends, unilateral: true, line: true }] })
  const along = run(orthotropicRigidity(E, E / 30, 0.4, E / 16, t))
  const across = run(orthotropicRigidity(E / 30, E, 0.4 / 30, E / 16, t))
  const mid = 3 * (n + 1) + 6
  const ratio = across.w[mid] / along.w[mid]
  assert.ok(ratio > 25 && ratio < 32, `deflection ratio ${ratio}`)
})

test('a patch load becomes consistent nodal loads: total and centre of the reactions match', () => {
  const A = 800, B = 400, n = 16, m = 8
  const xa = lines(A, n), xb = lines(B, m)
  const cells = new Uint8Array(n * m).fill(1)
  const D = isotropicRigidity(E, 0.3, 19)
  const ends = edgeNodes(n + 1, m + 1, (i) => i === 0 || i === n)
  const res = solvePlate({ xa, xb, cells, rigidity: () => D, patches: [{ a0: 130, a1: 230, b0: 260, b1: 360, F: 300 }], supports: [{ nodes: ends, unilateral: false, line: true }] })
  const sum = res.R.reduce((s, r) => s + r, 0)
  within(sum, 300, 1e-9, 'Σ R')
  // moment balance about a = 0: the load acts at a = 180
  const moment = res.R.reduce((s, r, k) => s + r * xa[k % (n + 1)], 0)
  within(moment / sum, 180, 1e-6, 'line of action')
})
