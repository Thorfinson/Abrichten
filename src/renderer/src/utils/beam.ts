/**
 * 1D Euler–Bernoulli beam, finite elements with Hermite cubics (2 DOF per node:
 * deflection w, positive downward, and slope θ = dw/dx). Units: mm, N, N/mm².
 *
 * Nodal values are exact for this element with consistent loads, so reactions and
 * the moments derived from them are exact as well. The stiffness matrix is banded
 * (half bandwidth 3) and solved without pivoting: once two nodes are held, it is
 * symmetric positive definite.
 */

/** Uniform line load q (N/mm) over [from, to], measured from the left end. */
export interface UniformLoad { from: number; to: number; q: number }
/** Point load P (N, downward) at `at`. */
export interface PointLoad { at: number; P: number }
/**
 * Every node inside [from, to] is held at w = 0 (a point support when from = to).
 * Unilateral supports (something the beam rests on) can only push; a node that
 * would pull is released. `weight` splits a node's reaction between supports that
 * share it (e.g. the overlap length across the beam).
 */
export interface BeamSupport { from: number; to: number; unilateral: boolean; weight: number }

export interface BeamInput {
  length: number
  /** Bending stiffness E·I (N·mm²) at x; evaluated at each element's midpoint. */
  EI: (x: number) => number
  uniform: UniformLoad[]
  points: PointLoad[]
  supports: BeamSupport[]
  /** Extra mesh breakpoints, e.g. where the section changes. */
  breakpoints?: number[]
  /** Target element count (default 48). */
  elements?: number
}

/** A share of one support's reaction, spread over the node's tributary length. */
export interface ReactionPiece { from: number; to: number; R: number }

export interface BeamResult {
  /** Node positions from the left end (mm). */
  x: number[]
  /** Deflection (mm, downward positive). */
  w: number[]
  /** Bending moment (N·mm, sagging positive). */
  M: number[]
  /** Upward reaction per node (N); 0 where the node is free. */
  R: number[]
  /** Nodes held at w = 0 in the final contact state. */
  held: boolean[]
  /** Reaction pieces per input support (same index as input.supports). */
  pieces: ReactionPiece[][]
}

export const DEFAULT_ELEMENTS = 48
const HB = 3            // half bandwidth in DOFs
const BW = 2 * HB + 1   // stored band width
const MAX_CONTACT_ITERATIONS = 40
const BATCH_CONTACT_ITERATIONS = 8

/** Node positions: all breakpoints, the segments between them subdivided to about `target` elements in total. */
function buildMesh(L: number, breaks: number[], target: number): number[] {
  const eps = L * 1e-6
  const sorted = [0, L, ...breaks.filter((b) => b > 0 && b < L)].sort((a, b) => a - b)
  const pts: number[] = []
  for (const p of sorted) if (pts.length === 0 || p - pts[pts.length - 1] > eps) pts.push(p)
  if (L - pts[pts.length - 1] > eps) pts.push(L)
  else pts[pts.length - 1] = L
  const x: number[] = [0]
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1], b = pts[s]
    const n = Math.max(1, Math.round((target * (b - a)) / L))
    for (let k = 1; k <= n; k++) x.push(a + ((b - a) * k) / n)
  }
  return x
}

/** Consistent nodal loads of a uniform load q over local [ξa, ξb] of an element of length l. */
function addUniform(F: Float64Array, e: number, l: number, q: number, xa: number, xb: number): void {
  const I1 = (s: number) => s - s ** 3 + s ** 4 / 2
  const I2 = (s: number) => l * (s ** 2 / 2 - (2 * s ** 3) / 3 + s ** 4 / 4)
  const I3 = (s: number) => s ** 3 - s ** 4 / 2
  const I4 = (s: number) => l * (-(s ** 3) / 3 + s ** 4 / 4)
  const k = q * l
  F[2 * e] += k * (I1(xb) - I1(xa))
  F[2 * e + 1] += k * (I2(xb) - I2(xa))
  F[2 * e + 2] += k * (I3(xb) - I3(xa))
  F[2 * e + 3] += k * (I4(xb) - I4(xa))
}

function addPoint(F: Float64Array, e: number, l: number, P: number, s: number): void {
  F[2 * e] += P * (1 - 3 * s ** 2 + 2 * s ** 3)
  F[2 * e + 1] += P * l * (s - 2 * s ** 2 + s ** 3)
  F[2 * e + 2] += P * (3 * s ** 2 - 2 * s ** 3)
  F[2 * e + 3] += P * l * (-(s ** 2) + s ** 3)
}

/** Banded stiffness: entry (i, j) lives at i·BW + (j − i + HB). */
function assemble(x: number[], EI: (x: number) => number): Float64Array {
  const n = 2 * x.length
  const K = new Float64Array(n * BW)
  for (let e = 0; e < x.length - 1; e++) {
    const l = x[e + 1] - x[e]
    const c = EI((x[e] + x[e + 1]) / 2) / l ** 3
    const k = [
      [12, 6 * l, -12, 6 * l],
      [6 * l, 4 * l * l, -6 * l, 2 * l * l],
      [-12, -6 * l, 12, -6 * l],
      [6 * l, 2 * l * l, -6 * l, 4 * l * l]
    ]
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        const i = 2 * e + a, j = 2 * e + b
        K[i * BW + (j - i + HB)] += c * k[a][b]
      }
    }
  }
  return K
}

/** Solves K·u = F with the w DOFs of `held` nodes fixed at 0 (elimination). */
function solveHeld(K: Float64Array, F: Float64Array, held: boolean[]): Float64Array {
  const n = F.length
  const A = K.slice()
  const b = F.slice()
  for (let node = 0; node < held.length; node++) {
    if (!held[node]) continue
    const d = 2 * node
    for (let j = Math.max(0, d - HB); j <= Math.min(n - 1, d + HB); j++) {
      A[d * BW + (j - d + HB)] = 0
      A[j * BW + (d - j + HB)] = 0
    }
    A[d * BW + HB] = 1
    b[d] = 0
  }
  // Gaussian elimination inside the band
  for (let k = 0; k < n; k++) {
    const piv = A[k * BW + HB]
    for (let i = k + 1; i <= Math.min(k + HB, n - 1); i++) {
      const f = A[i * BW + (k - i + HB)] / piv
      if (f === 0) continue
      for (let j = k; j <= Math.min(k + HB, n - 1); j++) A[i * BW + (j - i + HB)] -= f * A[k * BW + (j - k + HB)]
      b[i] -= f * b[k]
    }
  }
  const u = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let j = i + 1; j <= Math.min(i + HB, n - 1); j++) s -= A[i * BW + (j - i + HB)] * u[j]
    u[i] = s / A[i * BW + HB]
  }
  return u
}

/** Upward reaction at node `node`: applied load minus (K·u) in its w row. */
function reactionAt(K: Float64Array, F: Float64Array, u: Float64Array, node: number): number {
  const d = 2 * node
  let ku = 0
  for (let j = Math.max(0, d - HB); j <= Math.min(u.length - 1, d + HB); j++) ku += K[d * BW + (j - d + HB)] * u[j]
  return F[d] - ku
}

/**
 * Solves the beam. Returns null for a mechanism: fewer than two nodes held, so the
 * beam would fall or tip (before or after releasing supports that would pull).
 */
export function solveBeam(input: BeamInput): BeamResult | null {
  const L = input.length
  if (!(L > 0)) return null
  const eps = L * 1e-6
  // Loads clamped to the beam; one narrower than the mesh tolerance becomes a point load
  const clampX = (p: number): number => Math.min(L, Math.max(0, p))
  const spread = input.uniform.map((u) => ({ from: clampX(Math.min(u.from, u.to)), to: clampX(Math.max(u.from, u.to)), q: u.q }))
  const loads = {
    uniform: spread.filter((u) => u.to - u.from > eps),
    points: [
      ...input.points.map((p) => ({ at: clampX(p.at), P: p.P })),
      ...spread.filter((u) => u.to - u.from <= eps).map((u) => ({ at: (u.from + u.to) / 2, P: u.q * (u.to - u.from) }))
    ]
  }
  const breaks = [
    ...(input.breakpoints ?? []),
    ...input.supports.flatMap((s) => [s.from, s.to]),
    ...loads.points.map((p) => p.at),
    ...loads.uniform.flatMap((u) => [u.from, u.to])
  ]
  const x = buildMesh(L, breaks, input.elements ?? DEFAULT_ELEMENTS)
  const nodes = x.length

  // Which supports cover which node (a point support takes its nearest node)
  const cover: number[][] = x.map(() => [])
  input.supports.forEach((s, si) => {
    const from = Math.max(0, Math.min(s.from, s.to)), to = Math.min(L, Math.max(s.from, s.to))
    let any = false
    for (let i = 0; i < nodes; i++) if (x[i] >= from - eps && x[i] <= to + eps) { cover[i].push(si); any = true }
    if (!any) {
      let best = 0
      for (let i = 1; i < nodes; i++) if (Math.abs(x[i] - from) < Math.abs(x[best] - from)) best = i
      cover[best].push(si)
    }
  })

  // Consistent load vector
  const F = new Float64Array(2 * nodes)
  let total = 0
  const elementAt = (p: number): number => {
    let lo = 0, hi = nodes - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (x[mid] <= p) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  for (const p of loads.points) {
    const e = elementAt(p.at)
    const l = x[e + 1] - x[e]
    addPoint(F, e, l, p.P, Math.min(1, (p.at - x[e]) / l))
    total += Math.abs(p.P)
  }
  for (const u of loads.uniform) {
    const a = u.from, b = u.to
    for (let e = elementAt(a); e < nodes - 1 && x[e] < b - eps; e++) {
      const l = x[e + 1] - x[e]
      const sa = Math.max(0, (a - x[e]) / l), sb = Math.min(1, (b - x[e]) / l)
      if (sb > sa) addUniform(F, e, l, u.q, sa, sb)
    }
    total += Math.abs(u.q * (b - a))
  }

  const K = assemble(x, input.EI)
  const unilateralOnly = cover.map((c) => c.length > 0 && c.every((si) => input.supports[si].unilateral))
  const held = cover.map((c) => c.length > 0)
  const tolR = 1e-9 * (total + 1)
  let u: Float64Array = new Float64Array(0)

  // Contact iteration: re-hold released nodes that sink into their support, else release
  // resting nodes that pull. The first steps change every such node at once; if that
  // does not settle, one node per step (the deepest, else the hardest pulling) so it
  // cannot cycle. The last solve always matches the held set: reactions balance the load.
  for (let iter = 0; ; iter++) {
    if (held.filter(Boolean).length < 2) return null
    u = solveHeld(K, F, held)
    if (iter >= MAX_CONTACT_ITERATIONS + nodes) break
    const batch = iter < BATCH_CONTACT_ITERATIONS
    const sinks: number[] = [], pulls: number[] = []
    let sink = -1, pull = -1, sinkW = 1e-9, pullR = -tolR
    for (let i = 0; i < nodes; i++) {
      if (!unilateralOnly[i]) continue
      if (!held[i] && u[2 * i] > 1e-9) {
        sinks.push(i)
        if (u[2 * i] > sinkW) { sink = i; sinkW = u[2 * i] }
      } else if (held[i]) {
        const r = reactionAt(K, F, u, i)
        if (r < -tolR) pulls.push(i)
        if (r < pullR) { pull = i; pullR = r }
      }
    }
    if (sink >= 0) for (const i of batch ? sinks : [sink]) held[i] = true
    else if (pull >= 0) for (const i of batch ? pulls : [pull]) held[i] = false
    else break
  }
  // A degenerate beam (zero stiffness somewhere) has no solution
  if (!u.every(Number.isFinite)) return null

  const w = Array.from({ length: nodes }, (_, i) => (held[i] ? 0 : u[2 * i]))
  const R = Array.from({ length: nodes }, (_, i) => (held[i] ? reactionAt(K, F, u, i) : 0))
  const M = x.map((xi) => momentAt(xi, x, R, loads))

  // Split each node's reaction between the supports covering it, over its tributary length
  const pieces: ReactionPiece[][] = input.supports.map(() => [])
  for (let i = 0; i < nodes; i++) {
    if (!held[i] || R[i] === 0) continue
    const sup = cover[i]
    const wSum = sup.reduce((s, si) => s + Math.max(input.supports[si].weight, 0), 0)
    const left = i > 0 ? (x[i - 1] + x[i]) / 2 : x[i]
    const right = i < nodes - 1 ? (x[i] + x[i + 1]) / 2 : x[i]
    for (const si of sup) {
      const s = input.supports[si]
      const share = wSum > 0 ? Math.max(s.weight, 0) / wSum : 1 / sup.length
      const from = Math.max(left, Math.min(s.from, s.to)), to = Math.min(right, Math.max(s.from, s.to))
      pieces[si].push(from <= to ? { from, to, R: R[i] * share } : { from: x[i], to: x[i], R: R[i] * share })
    }
  }
  return { x, w, M, R, held, pieces }
}

/** Sagging moment at xi from the free body left of it: reactions minus loads. */
function momentAt(xi: number, x: number[], R: number[], loads: { uniform: UniformLoad[]; points: PointLoad[] }): number {
  let m = 0
  for (let i = 0; i < x.length && x[i] < xi; i++) m += R[i] * (xi - x[i])
  for (const p of loads.points) if (p.at < xi) m -= p.P * (xi - p.at)
  for (const u of loads.uniform) {
    if (xi <= u.from) continue
    const c = Math.min(u.to, xi)
    m -= u.q * (c - u.from) * (xi - (u.from + c) / 2)
  }
  return m
}
