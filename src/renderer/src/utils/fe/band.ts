/**
 * Symmetric band matrix and an in-place Cholesky solver for the finite-element models
 * (utils/fe/plate.ts, utils/fe/planeStress.ts). Only the lower band is stored: entry
 * (i, j) with i − hb ≤ j ≤ i lives at i·(hb + 1) + (i − j). Numbering the nodes along
 * the shorter side of the grid keeps the half bandwidth hb small, and the work at
 * n·hb²/2, a few milliseconds for the ≈ 400 elements of one board.
 */
export class SymBand {
  readonly n: number
  /** Half bandwidth */
  readonly hb: number
  /** Stored entries per row */
  readonly w: number
  readonly a: Float64Array

  constructor(n: number, hb: number, a?: Float64Array) {
    this.n = n
    this.hb = hb
    this.w = hb + 1
    this.a = a ?? new Float64Array(n * this.w)
  }

  /** Adds v to entry (i, j); the caller adds each symmetric pair once, from the lower side or the upper. */
  add(i: number, j: number, v: number): void {
    if (j > i) this.a[j * this.w + (j - i)] += v
    else this.a[i * this.w + (i - j)] += v
  }

  get(i: number, j: number): number {
    const d = i >= j ? i - j : j - i
    if (d > this.hb) return 0
    return i >= j ? this.a[i * this.w + d] : this.a[j * this.w + d]
  }

  copy(): SymBand {
    return new SymBand(this.n, this.hb, this.a.slice())
  }

  /** (K·x)_i */
  rowTimes(i: number, x: Float64Array): number {
    const { w, a, hb, n } = this
    let s = 0
    const j0 = Math.max(0, i - hb)
    for (let j = j0; j <= i; j++) s += a[i * w + (i - j)] * x[j]
    const j1 = Math.min(n - 1, i + hb)
    for (let j = i + 1; j <= j1; j++) s += a[j * w + (j - i)] * x[j]
    return s
  }

  diagonal(): Float64Array {
    const d = new Float64Array(this.n)
    for (let i = 0; i < this.n; i++) d[i] = this.a[i * this.w]
    return d
  }
}

/**
 * Holds the given DOFs at 0: their row and column are cleared, the diagonal kept (so
 * the pivot check sees its usual size). The right-hand side of a held DOF must be 0.
 */
export function fixDofs(m: SymBand, fixed: Uint8Array): void {
  const { w, a, hb, n } = m
  for (let i = 0; i < n; i++) {
    if (!fixed[i]) continue
    const j0 = Math.max(0, i - hb)
    for (let j = j0; j < i; j++) a[i * w + (i - j)] = 0
    const j1 = Math.min(n - 1, i + hb)
    for (let j = i + 1; j <= j1; j++) a[j * w + (j - i)] = 0
    if (!(a[i * w] > 0)) a[i * w] = 1
  }
}

/**
 * A pivot below this share of its original diagonal means the structure can move
 * without straining: it is a mechanism (it would fall, tip or swing about its supports).
 */
const SINGULAR_PIVOT = 1e-11

/**
 * In-place Cholesky factorisation K = L·Lᵀ (L in the lower band). Returns false for a
 * singular matrix: a mechanism. `refDiag` is the diagonal before factorising. Rows
 * before `start` must already hold their factor (see factorHeld).
 */
export function cholesky(m: SymBand, refDiag: Float64Array, start = 0): boolean {
  const { w, a, hb, n } = m
  for (let i = start; i < n; i++) {
    const ri = i * w
    const j0 = Math.max(0, i - hb)
    for (let j = j0; j <= i; j++) {
      const rj = j * w
      let s = a[ri + (i - j)]
      // Σ L(i,k)·L(j,k) for k = j0 … j−1: both rows walk down their stored band
      let p = ri + (i - j0), q = rj + (j - j0)
      for (let k = j0; k < j; k++) { s -= a[p] * a[q]; p--; q-- }
      if (j === i) {
        if (!(s > SINGULAR_PIVOT * Math.abs(refDiag[i])) || !Number.isFinite(s)) return false
        a[ri] = Math.sqrt(s)
      } else {
        a[ri + (i - j)] = s / a[rj]
      }
    }
  }
  return true
}

/** A factor and the held DOFs it was made for. */
export interface HeldFactor { factor: SymBand; fixed: Uint8Array }

/**
 * Factor of K with the `fixed` DOFs held at 0, reusing `prev` (the factor for an earlier
 * held set) where it still holds: row i of L depends only on rows ≤ i of the matrix, so
 * every row before the first DOF whose state changed is kept. Between two contact
 * passes that saves part of the work. Null for a mechanism.
 */
export function factorHeld(K: SymBand, fixed: Uint8Array, refDiag: Float64Array, prev?: HeldFactor | null): HeldFactor | null {
  let start = 0
  if (prev) {
    start = K.n
    for (let d = 0; d < K.n; d++) if (fixed[d] !== prev.fixed[d]) { start = d; break }
  }
  const m = K.copy()
  fixDofs(m, fixed)
  if (prev && start > 0) m.a.set(prev.factor.a.subarray(0, start * m.w))
  return cholesky(m, refDiag, start) ? { factor: m, fixed } : null
}

/** Solves L·Lᵀ·x = b in place (after cholesky). */
export function choleskySolve(m: SymBand, b: Float64Array): void {
  const { w, a, hb, n } = m
  for (let i = 0; i < n; i++) {
    let s = b[i]
    const j0 = Math.max(0, i - hb)
    for (let j = j0; j < i; j++) s -= a[i * w + (i - j)] * b[j]
    b[i] = s / a[i * w]
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    const j1 = Math.min(n - 1, i + hb)
    for (let j = i + 1; j <= j1; j++) s -= a[j * w + (j - i)] * b[j]
    b[i] = s / a[i * w]
  }
}
