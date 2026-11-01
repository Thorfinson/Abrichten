// Guards utils/fe/planeStress.ts, the plane-stress model (Q6 rectangles) of standing
// boards in the 2D load simulation: the patch test on an uneven grid, a column under
// an axial load (N/A away from the load), a rail on edge between two supports against
// beam theory, and supports that only push.
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
const { solvePlaneStress, isotropicPlane } = await import('../../src/renderer/src/utils/fe/planeStress.ts')

const lines = (L, n) => Array.from({ length: n + 1 }, (_, k) => (L * k) / n)
const within = (actual, expected, rel, msg) =>
  assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), `${msg}: ${actual} vs ${expected} (${(100 * (actual / expected - 1)).toFixed(2)} %)`)
const rowNodes = (na, j, from = 0, to = na - 1) => Array.from({ length: to - from + 1 }, (_, k) => j * na + from + k)

test('patch test: a uniform load on an uneven grid gives the same constant stress at every node', () => {
  const xa = [0, 30, 45, 100], xb = [0, 20, 70, 80]
  const na = xa.length
  const C = isotropicPlane(5000, 0.3)
  const res = solvePlaneStress({
    xa, xb, cells: new Uint8Array(9).fill(1), t: 10, C, weight: 0,
    loads: [{ a0: 0, a1: 100, b: 80, F: 1000 }],
    supports: [{ nodes: rowNodes(na, 0), unilateral: false }],
    fixU: 0
  })
  for (let n = 0; n < 16; n++) {
    within(res.sb[n], -1000 / (100 * 10), 1e-9, `σy at node ${n}`)
    assert.ok(Math.abs(res.sa[n]) < 1e-9 && Math.abs(res.tab[n]) < 1e-9, `σx, τ at node ${n}`)
  }
  // ε_y = σ/E everywhere: the top sinks by σ·H/E
  within(res.v[3 * na + 2], (1 * 80) / 5000, 1e-9, 'shortening')
})

test('a column under an axial point load: N/A away from the load (Saint-Venant)', () => {
  const W = 40, H = 1000, t = 40, N = 5000
  const xa = lines(W, 4), xb = lines(H, 40)
  const na = xa.length
  const res = solvePlaneStress({
    xa, xb, cells: new Uint8Array(4 * 40).fill(1), t, C: isotropicPlane(11000, 0.3), weight: 0,
    loads: [{ a0: W / 2, a1: W / 2, b: H, F: N }],
    supports: [{ nodes: rowNodes(na, 0), unilateral: true }],
    fixU: 2
  })
  for (let i = 0; i < na; i++) within(res.sb[20 * na + i], -N / (W * t), 0.01, `σy at mid-height, node ${i}`)
  within(res.R.reduce((s, r) => s + r, 0), N, 1e-9, 'Σ R')
  // the point load itself is a hot spot
  assert.ok(-res.sb[40 * na + 2] > 2 * (N / (W * t)))
})

test('a rail on edge between two posts: bending stress M/W and deflection of the beam theory', () => {
  const L = 1000, h = 100, t = 20, q = 1, E = 11000, nu = 0.3
  const xa = lines(L, 24), xb = lines(h, 4)
  const na = xa.length, nb = xb.length
  const ends = [...Array.from({ length: nb }, (_, j) => j * na), ...Array.from({ length: nb }, (_, j) => j * na + na - 1)]
  const res = solvePlaneStress({
    xa, xb, cells: new Uint8Array(24 * 4).fill(1), t, C: isotropicPlane(E, nu), weight: 0,
    loads: [{ a0: 0, a1: L, b: h, F: q * L }],
    supports: [{ nodes: ends, unilateral: true }],
    fixU: 0
  })
  const M = (q * L * L) / 8, W = (t * h * h) / 6, I = (t * h ** 3) / 12
  const mid = 12
  within(res.sa[mid], M / W, 0.03, 'tension at the bottom, mid-span')
  within(-res.sa[(nb - 1) * na + mid], M / W, 0.03, 'compression at the top')
  // Timoshenko beam: bending + shear (κ = 5/6)
  const G = E / (2 * (1 + nu))
  const delta = (5 * q * L ** 4) / (384 * E * I) + (q * L * L) / (8 * (5 / 6) * G * t * h)
  within(res.v[2 * na + mid], delta, 0.05, 'mid-span deflection')
  within(res.R.reduce((s, r) => s + r, 0), q * L, 1e-9, 'Σ R')
})

test('supports only push: a panel loaded at one end lifts off the far part of its base', () => {
  const xa = lines(600, 12), xb = lines(300, 6)
  const na = xa.length
  const res = solvePlaneStress({
    xa, xb, cells: new Uint8Array(72).fill(1), t: 18, C: isotropicPlane(10000, 0.3), weight: 0,
    // a load hanging off the left end pulls the right end up, it would lift off
    loads: [{ a0: 0, a1: 0, b: 300, F: 1000 }],
    supports: [{ nodes: rowNodes(na, 0, 0, 12), unilateral: true }],
    fixU: 6
  })
  assert.equal(res.held[12], 0, 'right end lifted')
  assert.ok(Math.min(...res.R) >= -1e-6)
  assert.ok(res.passes > 1)
  // a mechanism: held on one point only
  const tip = solvePlaneStress({
    xa, xb, cells: new Uint8Array(72).fill(1), t: 18, C: isotropicPlane(10000, 0.3), weight: 0,
    loads: [{ a0: 0, a1: 0, b: 300, F: 1000 }],
    supports: [{ nodes: [6], unilateral: true }],
    fixU: 6
  })
  assert.equal(tip, null)
})
