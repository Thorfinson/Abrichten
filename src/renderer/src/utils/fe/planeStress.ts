import { SymBand, factorHeld, choleskySolve, type HeldFactor } from './band'
import { contactStep, heldKey, MAX_PASSES, unsettled } from './contact'
import { activeNodes, cellNodes, locate, numberNodes, type GridSpec } from './grid'

/**
 * Plane stress in the plane of a standing board (side panel, back, post, a rail on
 * edge): 4-node rectangles, two DOF per node (u along the board, v up). Units mm, N.
 *
 * Plain bilinear quads lock in bending (a rail a few elements deep would come out far
 * too stiff), so each element carries Wilson's incompatible modes 1 − ξ², 1 − η² for u
 * and v, condensed out per element (Q6). On rectangles it passes the patch test and
 * reproduces pure bending exactly, so a rail on edge between two posts gets beam
 * stresses from a coarse grid. Stresses are evaluated at the cell corners (including
 * the incompatible modes) and averaged per node.
 *
 * Out-of-plane effects (buckling, wind, a door pulling on its hinges) are not part of
 * this model; Euler buckling is checked separately (services/static-sim.ts).
 */

/** Plane-stress constitutive matrix (N/mm²): σa = C11·εa + C12·εb, σb = C12·εa + C22·εb, τ = C33·γ. */
export interface PlaneMaterial { C11: number; C12: number; C22: number; C33: number }

export function isotropicPlane(E: number, nu: number): PlaneMaterial {
  const k = E / (1 - nu * nu)
  return { C11: k, C12: nu * k, C22: k, C33: E / (2 * (1 + nu)) }
}

/** Orthotropic, material axes along a and b; ν_ab = strain along b per strain along a under stress along a. */
export function orthotropicPlane(Ea: number, Eb: number, nuAB: number, G: number): PlaneMaterial {
  const nuBA = (nuAB * Eb) / Ea
  const k = 1 / (1 - nuAB * nuBA)
  return { C11: Ea * k, C12: nuAB * Eb * k, C22: Eb * k, C33: G }
}

/** A downward force F (N) spread along [a0, a1] at height b (a point when a0 = a1). */
export interface LineLoad { a0: number; a1: number; b: number; F: number }

/** Nodes held vertically (v = 0); a unilateral support only pushes up. */
export interface PlaneSupport {
  nodes: number[]
  unilateral: boolean
  /** Also hold the displacement along the board (a joint holds its region in the plane) */
  holdU?: boolean
}

export interface PlaneInput extends GridSpec {
  /** Thickness out of the plane, mm */
  t: number
  C: PlaneMaterial
  /** Downward body load per area of the plane, N/mm² (own weight ρ·g·t) */
  weight: number
  loads: LineLoad[]
  supports: PlaneSupport[]
  /** Node whose horizontal displacement is held, so the board cannot slide away */
  fixU: number
  /**
   * Contact state to start from, per node (the final `held` of an earlier solve of the
   * same grid and supports): a load that changes a little then needs one pass.
   */
  initialHeld?: Uint8Array
}

export interface PlaneResult {
  /** Displacement along the board per node, mm */
  ua: Float64Array
  /** Displacement per node, mm downward */
  v: Float64Array
  /** Stresses per node, N/mm², tension positive: along, vertical, shear */
  sa: Float64Array
  sb: Float64Array
  tab: Float64Array
  /** Upward support reaction per node, N */
  R: Float64Array
  held: Uint8Array
  nodeActive: Uint8Array
  passes: number
}

interface Q6 {
  /** Condensed 8 × 8 stiffness */
  K: Float64Array
  /** Stress at the four corners per corner DOF: σ = S_k·u (3 × 8 each) */
  S: Float64Array[]
}

const CORNER_XI: readonly [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
const G2 = 1 / Math.sqrt(3)

/** Strain–displacement matrix (3 × 12: 8 nodal DOFs, then the 4 incompatible modes) at (ξ, η). */
function strainMatrix(a: number, b: number, x: number, y: number): Float64Array {
  const B = new Float64Array(36)
  for (let k = 0; k < 4; k++) {
    const [xk, yk] = CORNER_XI[k]
    const dx = (2 / a) * (xk * (1 + y * yk)) / 4
    const dy = (2 / b) * (yk * (1 + x * xk)) / 4
    B[0 * 12 + 2 * k] = dx
    B[1 * 12 + 2 * k + 1] = dy
    B[2 * 12 + 2 * k] = dy
    B[2 * 12 + 2 * k + 1] = dx
  }
  // incompatible modes: u += α1(1 − ξ²) + α2(1 − η²), v += α3(1 − ξ²) + α4(1 − η²)
  const p1x = (-2 * x * 2) / a, p2y = (-2 * y * 2) / b
  B[0 * 12 + 8] = p1x
  B[1 * 12 + 11] = p2y
  B[2 * 12 + 9] = p2y
  B[2 * 12 + 10] = p1x
  return B
}

function invert4(m: Float64Array): Float64Array {
  const a = Array.from({ length: 4 }, (_, i) => [...Array.from(m.slice(i * 4, i * 4 + 4)), ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))])
  for (let c = 0; c < 4; c++) {
    let p = c
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    ;[a[c], a[p]] = [a[p], a[c]]
    const d = a[c][c]
    for (let k = 0; k < 8; k++) a[c][k] /= d
    for (let r = 0; r < 4; r++) {
      if (r === c) continue
      const f = a[r][c]
      for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k]
    }
  }
  return Float64Array.from(a.flatMap((row) => row.slice(4)))
}

/** The condensed Q6 element of an a × b cell. */
export function q6Element(a: number, b: number, C: PlaneMaterial, t: number): Q6 {
  const Kf = new Float64Array(144)
  const Cm = [C.C11, C.C12, 0, C.C12, C.C22, 0, 0, 0, C.C33]
  const dA = (a * b) / 4
  for (const x of [-G2, G2]) {
    for (const y of [-G2, G2]) {
      const B = strainMatrix(a, b, x, y)
      for (let p = 0; p < 12; p++) {
        // (C·B)[:, p]
        const cb0 = Cm[0] * B[p] + Cm[1] * B[12 + p]
        const cb1 = Cm[3] * B[p] + Cm[4] * B[12 + p]
        const cb2 = Cm[8] * B[24 + p]
        for (let q = 0; q < 12; q++) Kf[q * 12 + p] += t * dA * (B[q] * cb0 + B[12 + q] * cb1 + B[24 + q] * cb2)
      }
    }
  }
  // Condense the incompatible modes: K = Kcc − Kci·Kii⁻¹·Kic, α = −Kii⁻¹·Kic·u
  const Kii = new Float64Array(16)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) Kii[i * 4 + j] = Kf[(8 + i) * 12 + 8 + j]
  const inv = invert4(Kii)
  const A = new Float64Array(32) // 4 × 8: α per nodal DOF
  for (let i = 0; i < 4; i++) {
    for (let c = 0; c < 8; c++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += inv[i * 4 + k] * Kf[(8 + k) * 12 + c]
      A[i * 8 + c] = -s
    }
  }
  const K = new Float64Array(64)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      let s = Kf[r * 12 + c]
      for (let k = 0; k < 4; k++) s += Kf[r * 12 + 8 + k] * A[k * 8 + c]
      K[r * 8 + c] = s
    }
  }
  const S = CORNER_XI.map(([x, y]) => {
    const B = strainMatrix(a, b, x, y)
    // total strain per nodal DOF: B_c + B_i·A
    const Bt = new Float64Array(24)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        let s = B[r * 12 + c]
        for (let k = 0; k < 4; k++) s += B[r * 12 + 8 + k] * A[k * 8 + c]
        Bt[r * 8 + c] = s
      }
    }
    const out = new Float64Array(24)
    for (let c = 0; c < 8; c++) {
      out[c] = Cm[0] * Bt[c] + Cm[1] * Bt[8 + c]
      out[8 + c] = Cm[3] * Bt[c] + Cm[4] * Bt[8 + c]
      out[16 + c] = Cm[8] * Bt[16 + c]
    }
    return out
  })
  return { K, S }
}

/**
 * Solves the standing board. Returns null for a mechanism (it would fall or turn
 * about its supports), before or after releasing supports that would pull.
 */
export function solvePlaneStress(input: PlaneInput): PlaneResult | null {
  const { xa, xb, cells } = input
  const na = xa.length, nb = xb.length
  const nodes = na * nb
  const nodeActive = activeNodes(input)
  const supported = new Uint8Array(na * nb)
  for (const sp of input.supports) for (const n of sp.nodes) if (n >= 0 && n < na * nb) supported[n] = 1
  const { slot, count, bandNodes } = numberNodes(input, nodeActive, supported)
  if (count === 0 || !nodeActive[input.fixU]) return null
  const ndof = 2 * count
  const K = new SymBand(ndof, 2 * bandNodes + 1)
  const F = new Float64Array(ndof)
  const cache = new Map<string, Q6>()
  const element = (a: number, b: number): Q6 => {
    const key = `${a}|${b}`
    let e = cache.get(key)
    if (!e) { e = q6Element(a, b, input.C, input.t); cache.set(key, e) }
    return e
  }
  const dofsOf = (i: number, j: number): number[] =>
    cellNodes(na, i, j).flatMap((n) => [2 * slot[n], 2 * slot[n] + 1])

  let total = 0
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      if (!cells[j * (na - 1) + i]) continue
      const a = xa[i + 1] - xa[i], b = xb[j + 1] - xb[j]
      const { K: Ke } = element(a, b)
      const dofs = dofsOf(i, j)
      for (let p = 0; p < 8; p++) {
        for (let q = 0; q <= p; q++) {
          const dp = dofs[p], dq = dofs[q]
          if (dp >= dq) K.add(dp, dq, Ke[p * 8 + q])
          else K.add(dq, dp, Ke[p * 8 + q])
        }
      }
      if (input.weight !== 0) {
        const f = (input.weight * a * b) / 4
        total += 4 * Math.abs(f)
        for (let k = 0; k < 4; k++) F[dofs[2 * k + 1]] -= f
      }
    }
  }
  // Line and point loads: bilinear shape functions along the line at height b
  for (const l of input.loads) {
    if (l.F === 0) continue
    total += Math.abs(l.F)
    const La = xa[na - 1], Lb = xb[nb - 1]
    const a0 = Math.min(La, Math.max(0, Math.min(l.a0, l.a1))), a1 = Math.min(La, Math.max(0, Math.max(l.a0, l.a1)))
    const y = Math.min(Lb, Math.max(0, l.b))
    const j = locate(xb, y)
    const eta = (2 * (y - xb[j])) / (xb[j + 1] - xb[j]) - 1
    const cellsAlong = a1 - a0 < 1e-9
      ? [locate(xa, a0)]
      : Array.from({ length: na - 1 }, (_, i) => i).filter((i) => xa[i + 1] > a0 && xa[i] < a1)
    const pieces = cellsAlong.flatMap((i) => {
      if (!cells[j * (na - 1) + i]) return []
      const s0 = Math.max(a0, xa[i]), s1 = Math.min(a1, xa[i + 1])
      return [{ i, s0, s1, len: a1 - a0 < 1e-9 ? 1 : s1 - s0 }]
    })
    const sum = pieces.reduce((s, p) => s + p.len, 0)
    for (const p of pieces) {
      const share = (l.F * p.len) / sum
      const a = xa[p.i + 1] - xa[p.i]
      const xi = (s: number): number => (2 * (s - xa[p.i])) / a - 1
      const pts = a1 - a0 < 1e-9 ? [{ x: xi(a0), w: 1 }] : [-G2, G2].map((g) => ({ x: xi((p.s0 + p.s1) / 2 + ((p.s1 - p.s0) / 2) * g), w: 0.5 }))
      const dofs = dofsOf(p.i, j)
      for (const pt of pts) {
        for (let k = 0; k < 4; k++) {
          const [xk, yk] = CORNER_XI[k]
          F[dofs[2 * k + 1]] -= share * pt.w * ((1 + pt.x * xk) * (1 + eta * yk)) / 4
        }
      }
    }
  }

  const covered = new Uint8Array(nodes), bilateral = new Uint8Array(nodes), holdU = new Uint8Array(nodes)
  for (const s of input.supports) {
    for (const n of s.nodes) {
      if (n < 0 || n >= nodes || !nodeActive[n]) continue
      covered[n] = 1
      if (!s.unilateral) bilateral[n] = 1
      if (s.holdU) holdU[n] = 1
    }
  }
  const held = covered.slice()
  const toggles = new Uint8Array(nodes)
  if (input.initialHeld?.length === nodes) for (let n = 0; n < nodes; n++) held[n] = covered[n] && (bilateral[n] || input.initialHeld[n]) ? 1 : 0
  const refDiag = K.diagonal()
  const tolR = 1e-9 * (total + 1)
  let u = new Float64Array(ndof)
  let passes = 0
  const seen = new Set<string>()
  let prev: HeldFactor | null = null
  const vDof = (n: number): number => 2 * slot[n] + 1
  const reaction = (n: number): number => K.rowTimes(vDof(n), u) - F[vDof(n)]

  for (let iter = 0; ; iter++) {
    let heldCount = 0
    for (let n = 0; n < nodes; n++) if (held[n]) heldCount++
    if (heldCount < 2) return null
    const fixed = new Uint8Array(ndof)
    for (let n = 0; n < nodes; n++) {
      if (held[n]) fixed[vDof(n)] = 1
      if (held[n] && holdU[n]) fixed[2 * slot[n]] = 1
    }
    fixed[2 * slot[input.fixU]] = 1
    const factored = factorHeld(K, fixed, refDiag, prev)
    if (!factored) return null
    prev = factored
    const Kc = factored.factor
    u = F.slice()
    for (let d = 0; d < ndof; d++) if (fixed[d]) u[d] = 0
    choleskySolve(Kc, u)
    passes++
    if (iter >= MAX_PASSES) break

    let maxV = 0
    for (let n = 0; n < nodes; n++) if (nodeActive[n]) maxV = Math.max(maxV, Math.abs(u[vDof(n)]))
    const tolV = 1e-7 * maxV + 1e-12
    const solvedSet = held.slice()
    if (!contactStep({ held, covered, bilateral, toggles }, (n) => -u[vDof(n)], reaction, tolV, tolR)) break
    const key = heldKey(held)
    if (seen.has(key)) { held.set(solvedSet); break }
    seen.add(key)
  }
  if (!u.every(Number.isFinite) || unsettled({ held, covered, bilateral }, reaction, total)) return null
  // A node moving farther than the board is large: a mechanism whose pivots the check in
  // band.ts took for real on round-off (they are noise near SINGULAR_PIVOT), not a solution
  const size = Math.max(xa[na - 1], xb[nb - 1])
  for (let n = 0; n < nodes; n++) if (nodeActive[n] && Math.max(Math.abs(u[2 * slot[n]]), Math.abs(u[2 * slot[n] + 1])) > size) return null

  const ua = new Float64Array(nodes), v = new Float64Array(nodes), R = new Float64Array(nodes)
  for (let n = 0; n < nodes; n++) {
    if (!nodeActive[n]) continue
    ua[n] = u[2 * slot[n]]
    v[n] = -u[vDof(n)]
    if (held[n]) R[n] = reaction(n)
  }
  const sa = new Float64Array(nodes), sb = new Float64Array(nodes), tab = new Float64Array(nodes), hits = new Float64Array(nodes)
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      if (!cells[j * (na - 1) + i]) continue
      const { S } = element(xa[i + 1] - xa[i], xb[j + 1] - xb[j])
      const dofs = dofsOf(i, j)
      const corner = cellNodes(na, i, j)
      for (let k = 0; k < 4; k++) {
        let x = 0, y = 0, z = 0
        for (let c = 0; c < 8; c++) {
          const d = u[dofs[c]]
          x += S[k][c] * d; y += S[k][8 + c] * d; z += S[k][16 + c] * d
        }
        const n = corner[k]
        sa[n] += x; sb[n] += y; tab[n] += z; hits[n]++
      }
    }
  }
  for (let n = 0; n < nodes; n++) if (hits[n] > 0) { sa[n] /= hits[n]; sb[n] /= hits[n]; tab[n] /= hits[n] }
  return { ua, v, sa, sb, tab, R, held, nodeActive, passes }
}
