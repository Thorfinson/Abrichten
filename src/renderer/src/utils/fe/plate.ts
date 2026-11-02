import { SymBand, factorHeld, choleskySolve, type HeldFactor } from './band'
import { contactStep, heldKey, MAX_PASSES, unsettled } from './contact'
import { activeNodes, cellNodes, numberNodes, splitOverCells, type GridSpec } from './grid'

/**
 * Kirchhoff plate bending on a rectangular grid: the 12-DOF ACM rectangle (Adini,
 * Clough, Melosh), with w (mm, downward), ∂w/∂a and ∂w/∂b per node. Units mm, N, N/mm².
 *
 * The element is derived numerically, not typed from a table: the 12-term polynomial
 * basis (1, ξ, η, ξ², ξη, η², ξ³, ξ²η, ξη², η³, ξ³η, ξη³) on the unit square, its
 * values and slopes at the four corners give the nodal matrix C, whose inverse turns
 * the basis into shape functions. Their second derivatives are the curvature matrix B,
 * and BᵀDB is integrated with 3 × 3 Gauss points (exact for these polynomials). The
 * integrals do not depend on the cell size, so four universal 12 × 12 matrices are
 * built once and every element is a linear combination of them, scaled by its
 * size a × b and rigidities.
 *
 * Kirchhoff theory: no shear deformation (thin plates: span ≥ ~5 × thickness, true for
 * furniture panels), small deflections, linear elastic material.
 */

/**
 * Flexural rigidities (N·mm): Da, Db for bending along a and b, D1 the coupling
 * (ν·D for an isotropic plate) and Dab the twisting rigidity (G·t³/12).
 */
export interface PlateRigidity { Da: number; Db: number; D1: number; Dab: number }

/** Isotropic plate: D = E·t³ / 12(1 − ν²). */
export function isotropicRigidity(E: number, nu: number, t: number): PlateRigidity {
  const D = (E * t ** 3) / (12 * (1 - nu * nu))
  return { Da: D, Db: D, D1: nu * D, Dab: ((1 - nu) / 2) * D }
}

/**
 * Orthotropic plate with its material axes along a and b: Ea, Eb, the Poisson ratio
 * ν_ab (strain along b per strain along a under stress along a) and the in-plane
 * shear modulus G.
 */
export function orthotropicRigidity(Ea: number, Eb: number, nuAB: number, G: number, t: number): PlateRigidity {
  const nuBA = (nuAB * Eb) / Ea
  const k = t ** 3 / (12 * (1 - nuAB * nuBA))
  return { Da: Ea * k, Db: Eb * k, D1: nuAB * Eb * k, Dab: (G * t ** 3) / 12 }
}

/** Uniform load F (N, downward) over [a0, a1] × [b0, b1]; a zero width makes it a line or a point. */
export interface PatchLoad { a0: number; a1: number; b0: number; b1: number; F: number }

/**
 * Nodes held at w = 0. A unilateral support only pushes: a node that would pull is
 * released. A line support (`line`) also holds the slope along the line between two of
 * its neighbouring nodes, so the plate rests on the whole line, not just its nodes.
 */
export interface PlateSupport {
  nodes: number[]
  unilateral: boolean
  line?: boolean
  /** Clamped: both slopes held at its nodes too (a joint that holds a bracket by its moment) */
  clamped?: boolean
}

export interface PlateInput extends GridSpec {
  /** Rigidity of each cell (by cell index) */
  rigidity: (cell: number) => PlateRigidity
  /** Downward pressure per cell, N/mm² (own weight, payload) */
  pressure?: Float64Array
  patches: PatchLoad[]
  supports: PlateSupport[]
  /**
   * Contact state to start from, per node (the final `held` of an earlier solve of the
   * same grid and supports): a load that changes a little then needs one pass.
   */
  initialHeld?: Uint8Array
}

export interface PlateResult {
  /** Deflection per node, mm downward (0 at nodes without material) */
  w: Float64Array
  /** Curvatures per node, averaged over the cells around it: ∂²w/∂a², ∂²w/∂b², 2·∂²w/∂a∂b */
  kaa: Float64Array
  kbb: Float64Array
  kab: Float64Array
  /** Upward support reaction per node, N */
  R: Float64Array
  /** Node rests on its support in the final contact state */
  held: Uint8Array
  /** Node has material around it */
  nodeActive: Uint8Array
  /** Contact passes (solves) it took */
  passes: number
}

// ── The element, built once ────────────────────────────────────────────────

const EXP: readonly [number, number][] = [
  [0, 0], [1, 0], [0, 1], [2, 0], [1, 1], [0, 2], [3, 0], [2, 1], [1, 2], [0, 3], [3, 1], [1, 3]
]
const CORNERS: readonly [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
const GAUSS3 = [
  { x: (1 - Math.sqrt(3 / 5)) / 2, w: 5 / 18 },
  { x: 0.5, w: 8 / 18 },
  { x: (1 + Math.sqrt(3 / 5)) / 2, w: 5 / 18 }
]

/** d^p/dξ^p of ξ^e */
const dpow = (x: number, e: number, p: number): number => {
  if (p > e) return 0
  let c = 1
  for (let k = 0; k < p; k++) c *= e - k
  return c * x ** (e - p)
}

/** Basis monomials (or their derivatives of order dx in ξ, dy in η) at (ξ, η). */
function monomials(x: number, y: number, dx: number, dy: number): Float64Array {
  const out = new Float64Array(12)
  for (let k = 0; k < 12; k++) out[k] = dpow(x, EXP[k][0], dx) * dpow(y, EXP[k][1], dy)
  return out
}

/** Inverse of a small dense matrix (Gauss–Jordan with partial pivoting). */
function invert(m: number[][]): number[][] {
  const n = m.length
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    ;[a[c], a[p]] = [a[p], a[c]]
    const d = a[c][c]
    for (let k = 0; k < 2 * n; k++) a[c][k] /= d
    for (let r = 0; r < n; r++) {
      if (r === c || a[r][c] === 0) continue
      const f = a[r][c]
      for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]
    }
  }
  return a.map((row) => row.slice(n))
}

/** Nodal matrix: per corner the basis value and its slopes in ξ and η. */
const C_INV = invert(CORNERS.flatMap(([x, y]) => [
  Array.from(monomials(x, y, 0, 0)), Array.from(monomials(x, y, 1, 0)), Array.from(monomials(x, y, 0, 1))
]))

/** Shape functions (or derivatives) at (ξ, η) for the normalised DOFs (w, ∂w/∂ξ, ∂w/∂η per corner). */
function shape(x: number, y: number, dx: number, dy: number): Float64Array {
  const m = monomials(x, y, dx, dy)
  const out = new Float64Array(12)
  for (let j = 0; j < 12; j++) {
    let s = 0
    for (let i = 0; i < 12; i++) s += m[i] * C_INV[i][j]
    out[j] = s
  }
  return out
}

/** ∫∫ f·gᵀ over the unit square for shape-derivative pairs. */
function integrate(fa: [number, number], fb: [number, number]): Float64Array {
  const K = new Float64Array(144)
  for (const gx of GAUSS3) {
    for (const gy of GAUSS3) {
      const f = shape(gx.x, gy.x, fa[0], fa[1]), g = shape(gx.x, gy.x, fb[0], fb[1])
      const wgt = gx.w * gy.w
      for (let p = 0; p < 12; p++) for (let q = 0; q < 12; q++) K[p * 12 + q] += wgt * f[p] * g[q]
    }
  }
  return K
}

const K_AA = integrate([2, 0], [2, 0])
const K_BB = integrate([0, 2], [0, 2])
const K_AB_MIX = (() => {
  const x = integrate([2, 0], [0, 2]), y = integrate([0, 2], [2, 0])
  return x.map((v, i) => v + y[i])
})()
const K_TWIST = integrate([1, 1], [1, 1])
/** Mean of each shape function over the cell (consistent load of a uniform pressure). */
const N_MEAN = (() => {
  const out = new Float64Array(12)
  for (const gx of GAUSS3) for (const gy of GAUSS3) {
    const n = shape(gx.x, gy.x, 0, 0)
    for (let k = 0; k < 12; k++) out[k] += gx.w * gy.w * n[k]
  }
  return out
})()
/** C⁻¹ flat, for the fast value-only evaluation below. */
const C_FLAT = Float64Array.from(C_INV.flat())
/** Two-point Gauss on [0, 1]: exact for the cubics a shape function has along each axis. */
const GAUSS2 = [{ x: 0.5 - 0.5 / Math.sqrt(3), w: 0.5 }, { x: 0.5 + 0.5 / Math.sqrt(3), w: 0.5 }]

/** Adds f · N(ξ, η) to out (the shape-function values, no derivatives; the load path's hot loop). */
function addShape(x: number, y: number, f: number, out: Float64Array): void {
  const x2 = x * x, y2 = y * y, x3 = x2 * x, y3 = y2 * y
  const m = [1, x, y, x2, x * y, y2, x3, x2 * y, x * y2, y3, x3 * y, x * y3]
  for (let j = 0; j < 12; j++) {
    let s = 0
    for (let i = 0; i < 12; i++) s += m[i] * C_FLAT[i * 12 + j]
    out[j] += f * s
  }
}

/** Second derivatives at the corners, for the curvatures: [corner][ξξ | ηη | ξη] */
const D2_CORNER = CORNERS.map(([x, y]) => [shape(x, y, 2, 0), shape(x, y, 0, 2), shape(x, y, 1, 1)])

/** Physical DOF scale per element DOF: w, ∂w/∂a = (∂w/∂ξ)/a, ∂w/∂b = (∂w/∂η)/b. */
function dofScale(a: number, b: number): Float64Array {
  const T = new Float64Array(12)
  for (let k = 0; k < 4; k++) { T[3 * k] = 1; T[3 * k + 1] = a; T[3 * k + 2] = b }
  return T
}

/** Element stiffness for the physical DOFs of an a × b cell. */
export function plateElement(a: number, b: number, D: PlateRigidity): Float64Array {
  const T = dofScale(a, b)
  const cAA = (a * b * D.Da) / a ** 4, cBB = (a * b * D.Db) / b ** 4
  const cMix = (a * b * D.D1) / (a * a * b * b), cTw = (4 * a * b * D.Dab) / (a * a * b * b)
  const K = new Float64Array(144)
  for (let p = 0; p < 12; p++) {
    for (let q = 0; q < 12; q++) {
      const i = p * 12 + q
      K[i] = T[p] * T[q] * (cAA * K_AA[i] + cBB * K_BB[i] + cMix * K_AB_MIX[i] + cTw * K_TWIST[i])
    }
  }
  return K
}

/** Consistent nodal loads (physical DOFs) of a force F spread evenly over [s0, s1] × [t0, t1] of the unit cell. */
function patchVector(a: number, b: number, F: number, s0: number, s1: number, t0: number, t1: number): Float64Array {
  const T = dofScale(a, b)
  const out = new Float64Array(12)
  if (s0 === 0 && s1 === 1 && t0 === 0 && t1 === 1) {
    for (let k = 0; k < 12; k++) out[k] = F * N_MEAN[k] * T[k]
    return out
  }
  const pts = (p0: number, p1: number) => (p1 - p0 < 1e-12 ? [{ x: p0, w: 1 }] : GAUSS2.map((g) => ({ x: p0 + (p1 - p0) * g.x, w: g.w })))
  for (const gx of pts(s0, s1)) for (const gy of pts(t0, t1)) addShape(gx.x, gy.x, F * gx.w * gy.w, out)
  for (let k = 0; k < 12; k++) out[k] *= T[k]
  return out
}

// ── Solver ─────────────────────────────────────────────────────────────────

/**
 * Solves the plate. Returns null when it is a mechanism: too few supports to hold it
 * (it would fall or tip), before or after releasing supports that would pull.
 *
 * Supports hold w at their nodes; along a line support also the slope along the line
 * (see PlateSupport). A contact area holds w at every node in it, a shelf pin at one.
 */
export function solvePlate(input: PlateInput): PlateResult | null {
  const { xa, xb, cells } = input
  const na = xa.length, nb = xb.length
  const nodes = na * nb
  const nodeActive = activeNodes(input)
  const supported = new Uint8Array(na * nb)
  for (const sp of input.supports) for (const n of sp.nodes) if (n >= 0 && n < na * nb) supported[n] = 1
  const { slot, count, bandNodes } = numberNodes(input, nodeActive, supported)
  if (count === 0) return null
  const ndof = 3 * count
  const K = new SymBand(ndof, 3 * bandNodes + 2)
  const F = new Float64Array(ndof)
  const elementCache = new Map<string, Float64Array>()

  // the 12 DOF numbers of every cell, worked out once
  const cellDofs = new Int32Array((na - 1) * (nb - 1) * 12)
  for (let j = 0; j < nb - 1; j++) for (let i = 0; i < na - 1; i++) {
    const base = (j * (na - 1) + i) * 12
    cellNodes(na, i, j).forEach((n, k) => { for (let c = 0; c < 3; c++) cellDofs[base + 3 * k + c] = 3 * slot[n] + c })
  }
  const dofsOf = (i: number, j: number): Int32Array => cellDofs.subarray((j * (na - 1) + i) * 12, (j * (na - 1) + i + 1) * 12)

  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      const cell = j * (na - 1) + i
      if (!cells[cell]) continue
      const a = xa[i + 1] - xa[i], b = xb[j + 1] - xb[j]
      const D = input.rigidity(cell)
      const key = `${a}|${b}|${D.Da}|${D.Db}|${D.D1}|${D.Dab}`
      let Ke = elementCache.get(key)
      if (!Ke) { Ke = plateElement(a, b, D); elementCache.set(key, Ke) }
      const dofs = dofsOf(i, j)
      for (let p = 0; p < 12; p++) {
        for (let q = 0; q <= p; q++) {
          const dp = dofs[p], dq = dofs[q]
          if (dp >= dq) K.add(dp, dq, Ke[p * 12 + q])
          else K.add(dq, dp, Ke[p * 12 + q])
        }
      }
      const q = input.pressure?.[cell] ?? 0
      if (q !== 0) {
        const fe = patchVector(a, b, q * a * b, 0, 1, 0, 1)
        for (let p = 0; p < 12; p++) F[dofs[p]] += fe[p]
      }
    }
  }
  let total = 0
  for (const l of input.patches) {
    if (l.F === 0) continue
    total += Math.abs(l.F)
    for (const piece of splitOverCells(input, l.a0, l.a1, l.b0, l.b1)) {
      const a = xa[piece.i + 1] - xa[piece.i], b = xb[piece.j + 1] - xb[piece.j]
      const fe = patchVector(a, b, l.F * piece.share, piece.s0, piece.s1, piece.t0, piece.t1)
      const dofs = dofsOf(piece.i, piece.j)
      for (let p = 0; p < 12; p++) F[dofs[p]] += fe[p]
    }
  }
  if (input.pressure) {
    for (let j = 0; j < nb - 1; j++) for (let i = 0; i < na - 1; i++) {
      const cell = j * (na - 1) + i
      if (cells[cell]) total += Math.abs(input.pressure[cell] * (xa[i + 1] - xa[i]) * (xb[j + 1] - xb[j]))
    }
  }

  // Which nodes rest on something, and whether only on unilateral supports
  const covered = new Uint8Array(nodes), bilateral = new Uint8Array(nodes), onLine = new Uint8Array(nodes), clamp = new Uint8Array(nodes)
  for (const s of input.supports) {
    for (const n of s.nodes) {
      if (n < 0 || n >= nodes || !nodeActive[n]) continue
      covered[n] = 1
      if (!s.unilateral) bilateral[n] = 1
      if (s.line) onLine[n] = 1
      if (s.clamped) clamp[n] = 1
    }
  }
  const toggles = new Uint8Array(nodes)
  const held = covered.slice()
  if (input.initialHeld?.length === nodes) for (let n = 0; n < nodes; n++) held[n] = covered[n] && (bilateral[n] || input.initialHeld[n]) ? 1 : 0
  const refDiag = K.diagonal()
  const tolR = 1e-9 * (total + 1)
  let u = new Float64Array(ndof)
  let passes = 0
  const seen = new Set<string>()
  let prev: HeldFactor | null = null

  const fixedDofs = (): Uint8Array => {
    const fixed = new Uint8Array(ndof)
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        const n = j * na + i
        if (!held[n]) continue
        const d = 3 * slot[n]
        fixed[d] = 1
        if (clamp[n]) { fixed[d + 1] = 1; fixed[d + 2] = 1; continue }
        if (!onLine[n]) continue
        const line = (k: number): boolean => held[k] === 1 && onLine[k] === 1
        if ((i > 0 && line(n - 1)) || (i < na - 1 && line(n + 1))) fixed[d + 1] = 1
        if ((j > 0 && line(n - na)) || (j < nb - 1 && line(n + na))) fixed[d + 2] = 1
      }
    }
    return fixed
  }
  const reaction = (n: number): number => F[3 * slot[n]] - K.rowTimes(3 * slot[n], u)

  for (let iter = 0; ; iter++) {
    let heldCount = 0
    for (let n = 0; n < nodes; n++) if (held[n]) heldCount++
    if (heldCount < 3) return null
    const fixed = fixedDofs()
    const factored = factorHeld(K, fixed, refDiag, prev)
    if (!factored) return null
    prev = factored
    const Kc = factored.factor
    u = F.slice()
    for (let d = 0; d < ndof; d++) if (fixed[d]) u[d] = 0
    choleskySolve(Kc, u)
    passes++
    if (iter >= MAX_PASSES) break

    let maxW = 0
    for (let n = 0; n < nodes; n++) if (nodeActive[n]) maxW = Math.max(maxW, Math.abs(u[3 * slot[n]]))
    const tolW = 1e-7 * maxW + 1e-12
    const solvedSet = held.slice()
    if (!contactStep({ held, covered, bilateral, toggles }, (n) => u[3 * slot[n]], reaction, tolW, tolR)) break
    const key = heldKey(held)
    if (seen.has(key)) { held.set(solvedSet); break }
    seen.add(key)
  }
  if (!u.every(Number.isFinite) || unsettled({ held, covered, bilateral }, reaction, total)) return null
  // A node moving farther than the board is large: a mechanism whose pivots the check in
  // band.ts took for real on round-off (they are noise near SINGULAR_PIVOT), not a solution
  const size = Math.max(xa[na - 1], xb[nb - 1])
  for (let n = 0; n < nodes; n++) if (nodeActive[n] && Math.abs(u[3 * slot[n]]) > size) return null

  const w = new Float64Array(nodes), R = new Float64Array(nodes)
  for (let n = 0; n < nodes; n++) {
    if (!nodeActive[n]) continue
    w[n] = held[n] ? 0 : u[3 * slot[n]]
    if (held[n]) R[n] = reaction(n)
  }

  // Curvatures at the cell corners, averaged per node
  const kaa = new Float64Array(nodes), kbb = new Float64Array(nodes), kab = new Float64Array(nodes)
  const hits = new Float64Array(nodes)
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      if (!cells[j * (na - 1) + i]) continue
      const a = xa[i + 1] - xa[i], b = xb[j + 1] - xb[j]
      const T = dofScale(a, b)
      const corner = cellNodes(na, i, j)
      const dofs = dofsOf(i, j)
      const d = new Float64Array(12)
      for (let p = 0; p < 12; p++) d[p] = u[dofs[p]] * T[p]   // normalised DOFs: w, a·∂w/∂a, b·∂w/∂b
      for (let k = 0; k < 4; k++) {
        const [nxx, nyy, nxy] = D2_CORNER[k]
        let sxx = 0, syy = 0, sxy = 0
        for (let p = 0; p < 12; p++) { sxx += nxx[p] * d[p]; syy += nyy[p] * d[p]; sxy += nxy[p] * d[p] }
        const n = corner[k]
        kaa[n] += sxx / (a * a); kbb[n] += syy / (b * b); kab[n] += (2 * sxy) / (a * b)
        hits[n]++
      }
    }
  }
  for (let n = 0; n < nodes; n++) if (hits[n] > 0) { kaa[n] /= hits[n]; kbb[n] /= hits[n]; kab[n] /= hits[n] }
  return { w, kaa, kbb, kab, R, held, nodeActive, passes }
}

/**
 * Bending moments per unit width (N·mm/mm) from the curvatures: M = −D·κ, sagging
 * positive (w points down, so a sagging plate has negative curvature).
 */
export function plateMoments(D: PlateRigidity, kaa: number, kbb: number, kab: number): { Ma: number; Mb: number; Mab: number } {
  return { Ma: -(D.Da * kaa + D.D1 * kbb), Mb: -(D.D1 * kaa + D.Db * kbb), Mab: -D.Dab * kab }
}
