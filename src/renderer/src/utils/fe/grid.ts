/**
 * Rectangular finite-element grids shared by the plate and the plane-stress model.
 * Node (i, j) is stored at j·na + i, cell (i, j) at j·(na − 1) + i, i along the first
 * axis (a) and j along the second (b). Cells can be switched off (cutouts).
 */

export interface GridSpec {
  /** Grid lines along a and b, from 0, ascending */
  xa: number[]
  xb: number[]
  /** 1 for cells with material, (na − 1)·(nb − 1) entries */
  cells: Uint8Array
}

/** Element size: at least this, mm … */
export const MIN_ELEMENT_MM = 20
/** … else the longest side over this many elements */
export const ELEMENTS_ALONG_LONGEST = 24
/** About this many elements per board at most (a cold run of a 100-board kitchen stays well below 200 ms) */
export const MAX_ELEMENTS = 300
/** Feature lines closer than this are merged (mm) */
const MERGE_MM = 1.5

/**
 * Grid lines over [0, L]: every feature line (edges of supports, loads, cutouts …),
 * the stretches between them divided into elements of about `h`.
 */
export function gridLines(L: number, features: number[], h: number): number[] {
  const tol = Math.min(MERGE_MM, L / 50)
  const pts = [0, L, ...features.filter((p) => p > 0 && p < L)].sort((p, q) => p - q)
  const keys: number[] = []
  for (const p of pts) {
    if (keys.length === 0 || p - keys[keys.length - 1] > tol) keys.push(p)
  }
  if (L - keys[keys.length - 1] > tol) keys.push(L)
  else keys[keys.length - 1] = L
  const out: number[] = [0]
  for (let s = 1; s < keys.length; s++) {
    const a = keys[s - 1], b = keys[s]
    // an even count puts a node in the middle of each stretch, where a symmetric span peaks
    const exact = (b - a) / h
    let n = Math.max(1, Math.round(exact))
    if (n >= 2 && n % 2 === 1) n += exact > n ? 1 : -1
    for (let k = 1; k <= n; k++) out.push(k === n ? b : a + ((b - a) * k) / n)
  }
  return out
}

/**
 * Grid over La × Lb with lines at the features: elements of about max(20 mm, longest
 * side / 24), coarsened until there are at most about MAX_ELEMENTS (the feature lines
 * themselves always stay).
 */
export function buildLines(La: number, Lb: number, fa: number[], fb: number[], maxCells = MAX_ELEMENTS): { xa: number[]; xb: number[] } {
  let h = Math.max(MIN_ELEMENT_MM, Math.max(La, Lb) / ELEMENTS_ALONG_LONGEST)
  for (let guard = 0; ; guard++) {
    const xa = gridLines(La, fa, h), xb = gridLines(Lb, fb, h)
    if ((xa.length - 1) * (xb.length - 1) <= maxCells || guard > 30 || h > Math.max(La, Lb)) return { xa, xb }
    h *= 1.15
  }
}

/** Index of the cell interval [lines[k], lines[k+1]] containing p (clamped to the grid). */
export function locate(lines: number[], p: number): number {
  let lo = 0, hi = lines.length - 2
  if (p <= lines[0]) return 0
  if (p >= lines[hi + 1]) return hi
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lines[mid] <= p) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Nodes touching at least one active cell. */
export function activeNodes(g: GridSpec): Uint8Array {
  const na = g.xa.length, nb = g.xb.length
  const out = new Uint8Array(na * nb)
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      if (!g.cells[j * (na - 1) + i]) continue
      out[j * na + i] = out[j * na + i + 1] = out[(j + 1) * na + i] = out[(j + 1) * na + i + 1] = 1
    }
  }
  return out
}

/** The four corner nodes of cell (i, j), counter-clockwise from (i, j). */
export function cellNodes(na: number, i: number, j: number): [number, number, number, number] {
  return [j * na + i, j * na + i + 1, (j + 1) * na + i + 1, (j + 1) * na + i]
}

/**
 * Compact numbering of the active nodes, running along the shorter side first so the
 * band stays narrow. Returns the slot per node (−1 when inactive), the node count and
 * the half bandwidth in nodes. `late` (per node, optional) marks nodes to number as late
 * as possible: the rows are taken from the end with more of them first, so the support
 * nodes whose contact state changes between passes come last and the factor rows
 * before them can be kept (band.ts factorHeld).
 */
export function numberNodes(g: GridSpec, active: Uint8Array, late?: Uint8Array): { slot: Int32Array; count: number; bandNodes: number } {
  const na = g.xa.length, nb = g.xb.length
  const slot = new Int32Array(na * nb).fill(-1)
  let count = 0
  const rows = na <= nb ? nb : na
  let weight = 0, total = 0
  if (late) {
    for (let n = 0; n < na * nb; n++) {
      if (!late[n]) continue
      weight += na <= nb ? Math.floor(n / na) : n % na
      total++
    }
  }
  const reverse = total > 0 && weight / total < (rows - 1) / 2
  for (let s = 0; s < rows; s++) {
    const row = reverse ? rows - 1 - s : s
    if (na <= nb) {
      for (let i = 0; i < na; i++) if (active[row * na + i]) slot[row * na + i] = count++
    } else {
      for (let j = 0; j < nb; j++) if (active[j * na + row]) slot[j * na + row] = count++
    }
  }
  let bandNodes = 0
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      if (!g.cells[j * (na - 1) + i]) continue
      const s = cellNodes(na, i, j).map((n) => slot[n])
      bandNodes = Math.max(bandNodes, Math.max(...s) - Math.min(...s))
    }
  }
  return { slot, count, bandNodes }
}

/**
 * A load lying entirely over a hole (a box placed across a sink cutout) bears on the
 * nearest material: the whole load as a point at the closest point of the closest cell.
 */
function nearestCell(g: GridSpec, a: number, b: number): { cell: number; i: number; j: number; share: number; s0: number; s1: number; t0: number; t1: number }[] {
  const na = g.xa.length, nb = g.xb.length
  let best: { cell: number; i: number; j: number; s: number; t: number; d: number } | null = null
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      const cell = j * (na - 1) + i
      if (!g.cells[cell]) continue
      const pa = Math.min(g.xa[i + 1], Math.max(g.xa[i], a)), pb = Math.min(g.xb[j + 1], Math.max(g.xb[j], b))
      const d = Math.hypot(pa - a, pb - b)
      if (!best || d < best.d) {
        best = { cell, i, j, d, s: (pa - g.xa[i]) / (g.xa[i + 1] - g.xa[i]), t: (pb - g.xb[j]) / (g.xb[j + 1] - g.xb[j]) }
      }
    }
  }
  return best ? [{ cell: best.cell, i: best.i, j: best.j, share: 1, s0: best.s, s1: best.s, t0: best.t, t1: best.t }] : []
}

/**
 * Splits a load over [a0, a1] × [b0, b1] (either side may be 0: a line or a point)
 * into its pieces per active cell, each as a share of the load and the covered part of
 * the cell in local coordinates 0…1. Parts over a hole are left out and the rest
 * scaled up, so the whole load reaches the board; a load entirely over a hole goes to
 * the nearest material.
 */
export function splitOverCells(
  g: GridSpec, a0: number, a1: number, b0: number, b1: number
): { cell: number; i: number; j: number; share: number; s0: number; s1: number; t0: number; t1: number }[] {
  const na = g.xa.length
  const La = g.xa[na - 1], Lb = g.xb[g.xb.length - 1]
  const ca0 = Math.min(La, Math.max(0, Math.min(a0, a1))), ca1 = Math.min(La, Math.max(0, Math.max(a0, a1)))
  const cb0 = Math.min(Lb, Math.max(0, Math.min(b0, b1))), cb1 = Math.min(Lb, Math.max(0, Math.max(b0, b1)))
  const lineA = ca1 - ca0 < 1e-9, lineB = cb1 - cb0 < 1e-9
  const range = (lines: number[], p0: number, p1: number, point: boolean): number[] => {
    if (point) {
      // on a grid line the point belongs to both cells beside it (one may be a hole)
      const k = locate(lines, p0)
      const onLine = Math.abs(p0 - lines[k]) < 1e-9 && k > 0
      return onLine ? [k, k - 1] : Math.abs(p0 - lines[k + 1]) < 1e-9 && k + 2 < lines.length ? [k, k + 1] : [k]
    }
    const out: number[] = []
    for (let k = locate(lines, p0); k < lines.length - 1 && lines[k] < p1; k++) if (lines[k + 1] > p0) out.push(k)
    return out
  }
  const ia = range(g.xa, ca0, ca1, lineA), jb = range(g.xb, cb0, cb1, lineB)
  const pieces: { cell: number; i: number; j: number; share: number; s0: number; s1: number; t0: number; t1: number }[] = []
  let total = 0
  for (const j of jb) {
    for (const i of ia) {
      const cell = j * (na - 1) + i
      if (!g.cells[cell]) continue
      const la = g.xa[i + 1] - g.xa[i], lb = g.xb[j + 1] - g.xb[j]
      const p0 = Math.max(ca0, g.xa[i]), p1 = Math.min(ca1, g.xa[i + 1])
      const q0 = Math.max(cb0, g.xb[j]), q1 = Math.min(cb1, g.xb[j + 1])
      const wa = lineA ? 1 : p1 - p0, wb = lineB ? 1 : q1 - q0
      if (wa <= 0 || wb <= 0) continue
      const share = wa * wb
      total += share
      pieces.push({
        cell, i, j, share,
        s0: (p0 - g.xa[i]) / la, s1: (p1 - g.xa[i]) / la,
        t0: (q0 - g.xb[j]) / lb, t1: (q1 - g.xb[j]) / lb
      })
    }
  }
  if (total <= 0) return nearestCell(g, (ca0 + ca1) / 2, (cb0 + cb1) / 2)
  for (const p of pieces) p.share /= total
  // A point or line on a shared grid line must count once: keep the first cell that has it
  if (lineA || lineB) {
    const seen = new Set<string>()
    const unique = pieces.filter((p) => {
      const key = `${lineA ? '' : p.i}|${lineB ? '' : p.j}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const sum = unique.reduce((s, p) => s + p.share, 0)
    for (const p of unique) p.share /= sum
    return unique
  }
  return pieces
}
