import type { Material, MaterialCategory } from '../types/furniture'
import { solvePlate, isotropicRigidity, orthotropicRigidity, plateMoments, type PlateRigidity, type PatchLoad } from '../utils/fe/plate'
import { solvePlaneStress, isotropicPlane, orthotropicPlane, type LineLoad, type PlaneMaterial } from '../utils/fe/planeStress'
import { buildLines } from '../utils/fe/grid'
import { DEFLECTION_CRITICAL_RATIO, DEFLECTION_WARNING_RATIO } from './static-calc'

/*
 * The finite-element model of one board in the load simulation (services/static-sim.ts):
 *  - a lying board (thickness vertical) is a Kirchhoff plate over its face
 *    (utils/fe/plate.ts), loaded by its own weight, the payload on its free top,
 *    placed loads and the boards resting on it at their real footprint;
 *  - a standing board (side panel, back, post, a rail on edge) is a plane-stress model
 *    in its vertical plane (utils/fe/planeStress.ts), loaded where the shelves and the
 *    boards on top really bear on it.
 * Supports are regions of nodes: the contact area with the board below, the touching
 * end of a shelf over the contact length, or a pair of shelf pins per end. They only
 * push. The result is a field over the whole board: the utilisation (stress /
 * strength), the deflection against the free span, the hot spot, and the reactions
 * handed to the supporting boards.
 */

/** Material axes and strengths: mean E, characteristic strengths (data/materials.ts). */
/** Poisson's ratio per category: wood-based panels and metal ≈ 0.3, stone 0.25, glass 0.22. */
const POISSON: Record<MaterialCategory, number> = { solid_wood: 0.3, panel: 0.3, stone: 0.25, glass: 0.22, metal: 0.3 }
/** Stiffness across the grain: EN 338 gives E90,mean = E0,mean / 30. */
const CROSS_GRAIN_E_DIVISOR = 30
/** Bending across the grain is tension perpendicular to it: f_t,90,k = 0.4 vs f_m,k = 24 (C24, EN 338). */
const CROSS_GRAIN_STRENGTH_DIVISOR = 60
/** Compression across the grain: f_c,90,k / f_c,0,k = 2.5 / 21 (C24, EN 338). */
const CROSS_GRAIN_COMPRESSION_SHARE = 0.12
/** Solid wood, major Poisson's ratio ν_LT (strain across per strain along the grain); typical 0.4–0.5. */
const NU_ALONG_GRAIN = 0.4
/** In-plane shear modulus of solid wood: G ≈ E0 / 16 (EN 338: C24 G = 690 = 11000 / 16). */
const SHEAR_MODULUS_DIVISOR = 16
/** Shear strength of solid wood: f_v,k ≈ f_m,k / 6 (EN 338: C24 f_v,k = 4.0). */
const SHEAR_STRENGTH_DIVISOR = 6
/** Node selection tolerance, mm (feature lines closer than 1.5 mm are merged). */
const TOL = 1.6
/**
 * Plates get fewer elements than standing boards (utils/fe/grid.ts MAX_ELEMENTS): with
 * three DOF per node and contact passes over large contact areas they cost the most;
 * a shelf still gets about 23 × 11 elements.
 */
const PLATE_MAX_ELEMENTS = 240
/** Shelf pins: the front row of the 32 mm system sits 37 mm from the front edge; the rear pin mirrors it. */
export const SHELF_PIN_INSET_MM = 37

/**
 * The final contact state per grid and support layout. When only the loads on a board
 * change (a board above was moved or loaded), its contact iteration starts from there
 * and usually needs a single pass.
 */
const contactMemo = new Map<string, Uint8Array>()
const MAX_CONTACT_MEMO = 1000
function rememberContact(key: string, held: Uint8Array): void {
  contactMemo.delete(key)
  if (contactMemo.size >= MAX_CONTACT_MEMO) contactMemo.delete(contactMemo.keys().next().value as string)
  contactMemo.set(key, held)
}

export type WorldAxis = 'x' | 'y' | 'z'
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface StaticBox { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

/** A force (N, downward) entering a board over `rect` (world x/z; a line or point when degenerate) at height y. */
export interface EnteringLoad { rect: Rect; y: number; F: number; from: string }

/** One contact a board rests on. */
export interface ContactSupport {
  /**
   * floor, below (resting on a board), end (an end face touching a board): these only
   * push. joint: a modelled connection (Assembly.joints), holding in both directions
   * over the contact region of the two boards.
   */
  kind: 'floor' | 'below' | 'end' | 'joint'
  /** Contact footprint in world x/z; an end contact is a line on the end face */
  rect: Rect
  /** Vertical extent of the contact (the end contact of a rail, a joint region) */
  y0: number
  y1: number
  /** Shelf pins: point supports here instead of the contact line */
  pins?: { x: number; z: number }[]
}

/**
 * The result field over a board: a grid in world coordinates along `axes` (lying
 * boards x/z on the top face, standing boards their horizontal axis and y); node (i, j)
 * at j·a.length + i, cell (i, j) at j·(a.length − 1) + i.
 */
export interface StaticField {
  axes: ['x', 'z'] | ['x', 'y'] | ['z', 'y']
  a: number[]
  b: number[]
  /** 1 for cells with material (0 inside a cutout) */
  cells: Uint8Array
  /** Utilisation per node: stress / strength, for a standing panel at least its buckling share (1 = breaks) */
  u: Float32Array
  /** Deflection per node against its free span / 200 (1 = critical) */
  sag: Float32Array
  /** Deflection per node, mm downward (a standing board: its in-plane vertical displacement) */
  w: Float32Array
  /** Standing boards: in-plane displacement along `a`, mm */
  da?: Float32Array
  /** Node rests on a support in the final contact state: 1 on a contact, 2 on a joint */
  held: Uint8Array
}

export interface FeOutcome {
  field: StaticField
  uMax: number
  /** Node index of uMax, and of the worst deflection */
  uNode: number
  sagNode: number
  /** Stress share and buckling share of a standing board's uMax */
  uStress: number
  uBuckling: number
  /** Worst deflection against its reference length (δ / span, a cantilever: δ / 2·length) */
  ratio: number
  deflectionMm: number
  allowableMm: number
  spanMm: number
  cantilever: boolean
  /** Forces handed to the supports, by index into the input's supports */
  reactions: { support: number; rect: Rect; y: number; F: number }[]
  /** Standing boards: solved with a fastened base (StandingInput.fastened) */
  fastened?: boolean
  /** How its joints held it (JointMode) */
  jointMode?: JointMode
  /** Lying boards: curvatures per node, for layers resting on it (utils/fe/plate.ts) */
  curvature?: { kaa: Float64Array; kbb: Float64Array; kab: Float64Array }
}

// ── Material ────────────────────────────────────────────────────────────────

interface InPlane {
  orthotropic: boolean
  Ea: number
  Eb: number
  nuAB: number
  G: number
  /** Strength along a and b in tension and compression, and in shear */
  fa: { t: number; c: number }
  fb: { t: number; c: number }
  fv: number
}

/**
 * Stiffness and strength in the plane spanned by world axes a and b. Panels, metal,
 * stone and glass are isotropic. Solid wood with a grain direction in that plane is
 * orthotropic: E/30 and f/60 across the grain (as before for a beam bent across its
 * grain), G = E/16. A grain along the thickness, or none, is taken as isotropic along
 * the grain. `bending`: plate stresses, where tension and compression come together and
 * the bending strength governs both.
 */
function inPlane(mat: Material, grain: WorldAxis | undefined, a: WorldAxis, b: WorldAxis, bending: boolean): InPlane {
  const E = mat.eModul, fm = mat.bendingStrength
  const fc = bending ? fm : (mat.compressiveStrength ?? fm)
  const along = { t: fm, c: fc }
  const wood = mat.category === 'solid_wood' && (grain === a || grain === b)
  if (!wood) {
    const nu = POISSON[mat.category]
    return { orthotropic: false, Ea: E, Eb: E, nuAB: nu, G: E / (2 * (1 + nu)), fa: along, fb: along, fv: fm }
  }
  const across = {
    t: fm / CROSS_GRAIN_STRENGTH_DIVISOR,
    c: bending ? fm / CROSS_GRAIN_STRENGTH_DIVISOR : fc * CROSS_GRAIN_COMPRESSION_SHARE
  }
  const Eacross = E / CROSS_GRAIN_E_DIVISOR
  const G = E / SHEAR_MODULUS_DIVISOR, fv = fm / SHEAR_STRENGTH_DIVISOR
  return grain === a
    ? { orthotropic: true, Ea: E, Eb: Eacross, nuAB: NU_ALONG_GRAIN, G, fa: along, fb: across, fv }
    : { orthotropic: true, Ea: Eacross, Eb: E, nuAB: NU_ALONG_GRAIN / CROSS_GRAIN_E_DIVISOR, G, fa: across, fb: along, fv }
}

/** Plate rigidity of a lying board of thickness t. */
export function plateRigidity(mat: Material, grain: WorldAxis | undefined, t: number): PlateRigidity {
  const p = inPlane(mat, grain, 'x', 'z', true)
  return p.orthotropic ? orthotropicRigidity(p.Ea, p.Eb, p.nuAB, p.G, t) : isotropicRigidity(p.Ea, p.nuAB, t)
}

function planeMaterial(p: InPlane): PlaneMaterial {
  return p.orthotropic ? orthotropicPlane(p.Ea, p.Eb, p.nuAB, p.G) : isotropicPlane(p.Ea, p.nuAB)
}

/**
 * Utilisation of a stress state (σa, σb, τ): isotropic materials by the larger principal
 * stress against the strength in its sense; solid wood by the quadratic interaction
 * (σ_L/f_L)² + (σ_T/f_T)² + (τ/f_v)² (Norris), the root taken so it scales with the load.
 */
function utilisationAt(p: InPlane, sa: number, sb: number, tab: number): number {
  if (!p.orthotropic) {
    const c = (sa + sb) / 2, r = Math.hypot((sa - sb) / 2, tab)
    const one = (s: number): number => (s >= 0 ? s / p.fa.t : -s / p.fa.c)
    return Math.max(one(c + r), one(c - r))
  }
  const fa = sa >= 0 ? p.fa.t : p.fa.c, fb = sb >= 0 ? p.fb.t : p.fb.c
  return Math.sqrt((sa / fa) ** 2 + (sb / fb) ** 2 + (tab / p.fv) ** 2)
}

// ── Deflection against the free span ──────────────────────────────────────

interface LineRef { ref: number; span: number; cantilever: boolean }

/**
 * Reference length per node of one grid line for the deflection limit: between two
 * held nodes the free span; beyond the last one a cantilever, allowed twice its
 * length but at least the span next to it (a short overhang only tilts with that span);
 * ref 0 where the line holds nowhere.
 */
function lineRefs(p: number[], held: (k: number) => boolean): LineRef[] {
  const n = p.length
  const heldIdx: number[] = []
  for (let k = 0; k < n; k++) if (held(k)) heldIdx.push(k)
  const out: LineRef[] = new Array(n)
  if (heldIdx.length === 0) { for (let k = 0; k < n; k++) out[k] = { ref: 0, span: 0, cantilever: false }; return out }
  const spans: number[] = []
  for (let s = 1; s < heldIdx.length; s++) if (heldIdx[s] - heldIdx[s - 1] > 1) spans.push(p[heldIdx[s]] - p[heldIdx[s - 1]])
  const first = heldIdx[0], last = heldIdx[heldIdx.length - 1]
  let s = 0
  for (let k = 0; k < n; k++) {
    while (s < heldIdx.length && heldIdx[s] < k) s++
    if (held(k)) { out[k] = { ref: 0, span: 0, cantilever: false }; continue }
    if (k < first) {
      const free = p[first] - p[0]
      out[k] = { ref: Math.max(2 * free, spans[0] ?? 0), span: free, cantilever: true }
    } else if (k > last) {
      const free = p[n - 1] - p[last]
      out[k] = { ref: Math.max(2 * free, spans[spans.length - 1] ?? 0), span: free, cantilever: true }
    } else {
      const span = p[heldIdx[s]] - p[heldIdx[s - 1]]
      out[k] = { ref: span, span, cantilever: false }
    }
  }
  return out
}

/**
 * The node of a field's maximum. Of nodes that tie (the front and back edge of a
 * symmetric shelf) the last one counts: the larger z, nearer the viewer, the front.
 */
function peakNode(v: ArrayLike<number>): number {
  let max = 0
  for (let n = 0; n < v.length; n++) max = Math.max(max, v[n])
  if (!(max > 0)) return -1
  let node = -1
  for (let n = 0; n < v.length; n++) if (v[n] >= max * (1 - 1e-6)) node = n
  return node
}

/**
 * A free span or overhang shorter than this many thicknesses is no span to check for
 * deflection (a 20 mm projection of a 40 mm timber): the member is deep there, its load
 * goes straight down by shear, and span/300 means nothing.
 */
const SHORT_SPAN_THICKNESSES = 4

/** Reference lengths with spans shorter than `min` left out (see SHORT_SPAN_THICKNESSES). */
function deepSpansOff(refs: LineRef[], min: number): LineRef[] {
  return refs.map((r) => (r && r.span > 0 && r.span < min ? { ref: 0, span: 0, cantilever: false } : r))
}

interface SagResult { sag: Float32Array; node: number; ratio: number; deflectionMm: number; allowableMm: number; spanMm: number; cantilever: boolean }

function sagFrom(w: ArrayLike<number>, refs: LineRef[]): SagResult {
  const sag = new Float32Array(w.length)
  let node = -1, ratio = 0
  for (let n = 0; n < w.length; n++) {
    const r = refs[n]
    if (!r || r.ref <= 0) continue
    const q = Math.max(0, w[n]) / r.ref
    sag[n] = q * DEFLECTION_CRITICAL_RATIO
    if (q > ratio) ratio = q
  }
  node = peakNode(sag)
  if (ratio <= 0 || node < 0) return { sag, node: 0, ratio: 0, deflectionMm: 0, allowableMm: 0, spanMm: 0, cantilever: false }
  const r = refs[node]
  return { sag, node, ratio, deflectionMm: w[node], allowableMm: r.ref / DEFLECTION_WARNING_RATIO, spanMm: r.span, cantilever: r.cantilever }
}

/**
 * Reference lengths over a plate: per node the stricter (shorter) of the spans along
 * its grid row and column; where neither line holds (between point supports) the
 * extent of the supports, at least twice the distance to the nearest one.
 */
function plateRefs(xa: number[], xb: number[], held: Uint8Array, active: Uint8Array): LineRef[] {
  const na = xa.length, nb = xb.length
  const refs: LineRef[] = new Array(na * nb)
  const rows = Array.from({ length: nb }, (_, j) => lineRefs(xa, (i) => held[j * na + i] === 1))
  const cols = Array.from({ length: na }, (_, i) => lineRefs(xb, (j) => held[j * na + i] === 1))
  const heldPts: [number, number][] = []
  for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) if (held[j * na + i]) heldPts.push([xa[i], xb[j]])
  const ext = (k: 0 | 1): number => (heldPts.length ? Math.max(...heldPts.map((p) => p[k])) - Math.min(...heldPts.map((p) => p[k])) : 0)
  const base = Math.max(ext(0), ext(1))
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < na; i++) {
      const n = j * na + i
      if (!active[n] || held[n]) { refs[n] = { ref: 0, span: 0, cantilever: false }; continue }
      const c = [rows[j][i], cols[i][j]].filter((r) => r.ref > 0)
      if (c.length) { refs[n] = c.reduce((m, r) => (r.ref < m.ref ? r : m)); continue }
      let near = Infinity
      for (const [x, z] of heldPts) near = Math.min(near, Math.hypot(x - xa[i], z - xb[j]))
      const ref = Math.max(base, 2 * near)
      refs[n] = { ref, span: ref, cantilever: false }
    }
  }
  return refs
}

// ── Shared helpers ─────────────────────────────────────────────────────────

/**
 * How a board's joints hold it, tried in this order until the board is held:
 *  - contact: like a resting or end contact over the joint's region, pushing only. A
 *    board hanging on its joints is pushed up by them, so this is the usual case; it
 *    also avoids the push/pull pairs that rigid two-way supports would pass on through
 *    the frame (every supporter is taken as rigid, its own give is not modelled).
 *  - fastened: the region still pushes, and its middle line (the row of fasteners) also
 *    pulls, for a board that would otherwise lift or tip (a loaded overhang screwed down).
 *  - clamped: the same line also holds the rotation, for a board that would otherwise
 *    swing about it (a bracket or a shelf screwed at one end only).
 */
export type JointMode = 'contact' | 'fastened' | 'clamped'
const JOINT_MODES: JointMode[] = ['contact', 'fastened', 'clamped']

/** An unbraced stretch shorter than this many thicknesses does not buckle as a column. */
const BRACED_GAP = 2

/** The held nodes, marked 2 where they hold on a joint (for the support markers). */
function markJoints(held: Uint8Array, cover: number[][], supports: ContactSupport[]): Uint8Array {
  const out = held.slice()
  for (let n = 0; n < out.length; n++) {
    if (out[n] && cover[n].some((si) => supports[si].kind === 'joint')) out[n] = 2
  }
  return out
}

/** Half-way to the neighbouring grid lines: the stretch a node stands for. */
const tributary = (g: number[], k: number): [number, number] =>
  [k > 0 ? (g[k - 1] + g[k]) / 2 : g[0], k < g.length - 1 ? (g[k] + g[k + 1]) / 2 : g[g.length - 1]]

const inside = (p: number, lo: number, hi: number): boolean => p >= lo - TOL && p <= hi + TOL

/** A field with no stress and no deflection over the board's box (a board on the floor, a block). */
export function restingField(box: StaticBox, axes: StaticField['axes']): StaticField {
  const lo = (k: WorldAxis): number => (k === 'x' ? box.x0 : k === 'y' ? box.y0 : box.z0)
  const hi = (k: WorldAxis): number => (k === 'x' ? box.x1 : k === 'y' ? box.y1 : box.z1)
  return {
    axes, a: [lo(axes[0]), hi(axes[0])], b: [lo(axes[1]), hi(axes[1])], cells: Uint8Array.of(1),
    u: new Float32Array(4), sag: new Float32Array(4), w: new Float32Array(4), held: new Uint8Array(4).fill(1)
  }
}

/** Reaction pieces of the held nodes, split evenly between the supports covering a node. */
function collectReactions(
  R: Float64Array, held: Uint8Array, cover: number[][],
  piece: (n: number, support: number) => { rect: Rect; y: number }
): FeOutcome['reactions'] {
  const out: FeOutcome['reactions'] = []
  for (let n = 0; n < R.length; n++) {
    if (!held[n] || R[n] === 0 || cover[n].length === 0) continue
    const share = R[n] / cover[n].length
    for (const s of cover[n]) out.push({ support: s, ...piece(n, s), F: share })
  }
  return out
}

// ── Lying board: plate ─────────────────────────────────────────────────────

export interface LyingInput {
  box: StaticBox
  material: Material
  grain?: WorldAxis
  /** Cutouts through the board, world x/z */
  cutouts: Rect[]
  supports: ContactSupport[]
  /** Own weight per area of face, N/mm² */
  selfPressure: number
  /** Payload, N, spread over the free top */
  payloadN: number
  /** Parts of the top that other boards rest on (no payload there) */
  covers: Rect[]
  /** Loads placed by the user, world x/z patches */
  placed: { rect: Rect; F: number }[]
  received: EnteringLoad[]
  /** Lying boards resting on this one over most of their area: they bend with it */
  layers: { rect: Rect; D: PlateRigidity }[]
}

/**
 * Solves a lying board as a plate; null when its supports cannot hold it (a mechanism).
 * Joint lines act as hinges (a shelf screwed between two sides is simply supported);
 * only a board that would swing about them (a bracket or a shelf screwed at one end)
 * is held by the joints' moment: then its joint lines are clamped.
 */
export function solveLying(inp: LyingInput): FeOutcome | null {
  const modes = inp.supports.some((s) => s.kind === 'joint') ? JOINT_MODES : JOINT_MODES.slice(0, 1)
  for (const mode of modes) {
    const fe = solveLyingWith(inp, mode)
    if (fe) return { ...fe, jointMode: mode }
  }
  return null
}

function solveLyingWith(inp: LyingInput, mode: JointMode): FeOutcome | null {
  const { box } = inp
  const La = box.x1 - box.x0, Lb = box.z1 - box.z0, t = box.y1 - box.y0
  const fa: number[] = [], fb: number[] = []
  const feature = (r: Rect): void => { fa.push(r.x0 - box.x0, r.x1 - box.x0); fb.push(r.z0 - box.z0, r.z1 - box.z0) }
  inp.cutouts.forEach(feature)
  inp.covers.forEach(feature)
  inp.layers.forEach((l) => feature(l.rect))
  inp.placed.forEach((p) => feature(p.rect))
  for (const s of inp.supports) {
    if (s.pins) for (const p of s.pins) { fa.push(p.x - box.x0); fb.push(p.z - box.z0) }
    else feature(s.rect)
    if (s.kind === 'joint') { fa.push((s.rect.x0 + s.rect.x1) / 2 - box.x0); fb.push((s.rect.z0 + s.rect.z1) / 2 - box.z0) }
  }
  const { xa, xb } = buildLines(La, Lb, fa, fb, PLATE_MAX_ELEMENTS)
  const na = xa.length, nb = xb.length
  const nCells = (na - 1) * (nb - 1)
  const cells = new Uint8Array(nCells)
  const centreIn = (r: Rect, i: number, j: number): boolean => {
    const x = box.x0 + (xa[i] + xa[i + 1]) / 2, z = box.z0 + (xb[j] + xb[j + 1]) / 2
    return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1
  }
  const D = plateRigidity(inp.material, inp.grain, t)
  const rigidities: PlateRigidity[] = new Array(nCells)
  const pressure = new Float64Array(nCells)
  let freeArea = 0
  const free = new Uint8Array(nCells)
  for (let j = 0; j < nb - 1; j++) {
    for (let i = 0; i < na - 1; i++) {
      const c = j * (na - 1) + i
      cells[c] = inp.cutouts.some((r) => centreIn(r, i, j)) ? 0 : 1
      let Dc = D
      for (const l of inp.layers) {
        if (centreIn(l.rect, i, j)) Dc = { Da: Dc.Da + l.D.Da, Db: Dc.Db + l.D.Db, D1: Dc.D1 + l.D.D1, Dab: Dc.Dab + l.D.Dab }
      }
      rigidities[c] = Dc
      if (!cells[c]) continue
      pressure[c] = inp.selfPressure
      if (!inp.covers.some((r) => centreIn(r, i, j))) {
        free[c] = 1
        freeArea += (xa[i + 1] - xa[i]) * (xb[j + 1] - xb[j])
      }
    }
  }
  // The payload goes on the free top; a payload set on a board that is covered all over
  // (Board.loadKg on a carrier under a stone layer) is spread over the whole face
  if (inp.payloadN > 0) {
    let area = freeArea
    if (area <= 0) {
      for (let j = 0; j < nb - 1; j++) for (let i = 0; i < na - 1; i++) {
        const c = j * (na - 1) + i
        if (cells[c]) { free[c] = 1; area += (xa[i + 1] - xa[i]) * (xb[j + 1] - xb[j]) }
      }
    }
    if (area > 0) for (let c = 0; c < nCells; c++) if (free[c]) pressure[c] += inp.payloadN / area
  }
  const local = (r: Rect, F: number): PatchLoad => ({ a0: r.x0 - box.x0, a1: r.x1 - box.x0, b0: r.z0 - box.z0, b1: r.z1 - box.z0, F })
  const patches = [...inp.placed.map((p) => local(p.rect, p.F)), ...inp.received.map((l) => local(l.rect, l.F))]

  // Supports as node sets
  const cover: number[][] = Array.from({ length: na * nb }, () => [])
  const nodeAt = (i: number, j: number): number => j * na + i
  const nearest = (lines: number[], p: number): number => lines.reduce((best, v, k) => (Math.abs(v - p) < Math.abs(lines[best] - p) ? k : best), 0)
  // Nodes on a fastened joint's row of fasteners: they hold both ways
  const fastener = new Uint8Array(na * nb)
  inp.supports.forEach((s, si) => {
    const r = { a0: s.rect.x0 - box.x0, a1: s.rect.x1 - box.x0, b0: s.rect.z0 - box.z0, b1: s.rect.z1 - box.z0 }
    if (s.pins) {
      for (const p of s.pins) cover[nodeAt(nearest(xa, p.x - box.x0), nearest(xb, p.z - box.z0))].push(si)
      return
    }
    const lineA = r.a1 - r.a0 < TOL, lineB = r.b1 - r.b0 < TOL
    const fastened = s.kind === 'joint' && mode !== 'contact'
    if (fastened && !lineA && !lineB) {
      // fastened over an area: the area still pushes (covered below), and its middle line
      // the long way (the row of fasteners) also pulls, a hinge there, not a clamp
      if (r.a1 - r.a0 >= r.b1 - r.b0) {
        const j = nearest(xb, (r.b0 + r.b1) / 2)
        for (let i = 0; i < na; i++) if (inside(xa[i], r.a0, r.a1)) fastener[nodeAt(i, j)] = 1
      } else {
        const i = nearest(xa, (r.a0 + r.a1) / 2)
        for (let j = 0; j < nb; j++) if (inside(xb[j], r.b0, r.b1)) fastener[nodeAt(i, j)] = 1
      }
    } else if (s.kind === 'end' || (s.kind === 'joint' && (lineA || lineB) && !(lineA && lineB))) {
      // the line on the end face, over the contact length
      const onEndA = r.a1 - r.a0 < r.b1 - r.b0   // the end face lies at a fixed a (an x end)
      const hold = (n: number): void => { cover[n].push(si); if (fastened) fastener[n] = 1 }
      if (onEndA) {
        const i = nearest(xa, r.a0)
        for (let j = 0; j < nb; j++) if (inside(xb[j], r.b0, r.b1)) hold(nodeAt(i, j))
      } else {
        const j = nearest(xb, r.b0)
        for (let i = 0; i < na; i++) if (inside(xa[i], r.a0, r.a1)) hold(nodeAt(i, j))
      }
      return
    }
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
      if (!inside(xa[i], r.a0, r.a1) || !inside(xb[j], r.b0, r.b1)) continue
      cover[nodeAt(i, j)].push(si)
      if (fastened && lineA && lineB) fastener[nodeAt(i, j)] = 1
    }
  })
  // end contacts and joint lines are lines (the slope along them is held too), contact
  // areas and pins hold their nodes; joints hold in both directions
  // Fastened, only the row of fasteners is a line: the rest of the area holds its nodes, so
  // the row stays a hinge (held slopes beside it would clamp it and make the contact chatter)
  const isLine = (si: number, n: number): boolean => {
    const s = inp.supports[si]
    if (s.pins) return false
    if (s.kind === 'end') return true
    return s.kind === 'joint' && !(s.rect.x1 - s.rect.x0 < TOL && s.rect.z1 - s.rect.z0 < TOL) && (mode === 'contact' || fastener[n] === 1)
  }
  const group = (line: boolean, joint: boolean): number[] =>
    cover.flatMap((c, n) => (c.length && c.some((si) => isLine(si, n)) === line && (fastener[n] === 1) === joint ? [n] : []))
  const lineNodes = group(true, false), otherNodes = group(false, false)
  const jointLines = group(true, true), jointNodes = group(false, true)

  const memoKey = `p|${xa.join(',')}|${xb.join(',')}|${lineNodes.join(',')}|${otherNodes.join(',')}|${jointLines.join(',')}|${jointNodes.join(',')}|${mode}`
  const res = solvePlate({
    xa, xb, cells,
    rigidity: (c) => rigidities[c],
    pressure,
    patches,
    supports: [
      { nodes: lineNodes, unilateral: true, line: true }, { nodes: otherNodes, unilateral: true },
      { nodes: jointLines, unilateral: false, line: true, clamped: mode === 'clamped' }, { nodes: jointNodes, unilateral: false }
    ],
    initialHeld: contactMemo.get(memoKey)
  })
  if (!res) return null
  rememberContact(memoKey, res.held)
  const held = markJoints(res.held, cover, inp.supports)

  // Utilisation from this board's own share of the moment (a layer on top takes the rest)
  const props = inPlane(inp.material, inp.grain, 'x', 'z', true)
  // A board narrower than SHORT_SPAN_THICKNESSES thicknesses (a 40 × 60 timber) is a beam:
  // only its bending along the length counts; across, it is too deep for plate bending
  const beamA = Lb < SHORT_SPAN_THICKNESSES * t && La > Lb, beamB = La < SHORT_SPAN_THICKNESSES * t && Lb > La
  const nodes = na * nb
  const u = new Float32Array(nodes)
  let uMax = 0, uNode = 0
  for (let n = 0; n < nodes; n++) {
    if (!res.nodeActive[n]) continue
    const M = plateMoments(D, res.kaa[n], res.kbb[n], res.kab[n])
    const k = 6 / (t * t)
    u[n] = utilisationAt(props, beamB ? 0 : k * M.Ma, beamA ? 0 : k * M.Mb, beamA || beamB ? 0 : k * M.Mab)
    uMax = Math.max(uMax, u[n])
  }
  uNode = Math.max(0, peakNode(u))
  const s = sagFrom(res.w, deepSpansOff(plateRefs(xa, xb, res.held, res.nodeActive), SHORT_SPAN_THICKNESSES * t))
  const ax = xa.map((v) => v + box.x0), bz = xb.map((v) => v + box.z0)
  const reactions = collectReactions(res.R, res.held, cover, (n, si) => {
    const sup = inp.supports[si]
    const i = n % na, j = Math.floor(n / na)
    const pin = sup.pins?.find((p) => nearest(xa, p.x - box.x0) === i && nearest(xb, p.z - box.z0) === j)
    if (pin) return { rect: { x0: pin.x, x1: pin.x, z0: pin.z, z1: pin.z }, y: box.y0 }
    const y = sup.kind === 'joint' ? (sup.y0 + sup.y1) / 2 : box.y0
    const [x0, x1] = tributary(ax, i), [z0, z1] = tributary(bz, j)
    const r = sup.rect
    return {
      rect: { x0: Math.max(x0, r.x0), x1: Math.max(Math.max(x0, r.x0), Math.min(x1, r.x1)), z0: Math.max(z0, r.z0), z1: Math.max(Math.max(z0, r.z0), Math.min(z1, r.z1)) },
      y
    }
  })
  return {
    field: { axes: ['x', 'z'], a: ax, b: bz, cells, u, sag: s.sag, w: Float32Array.from(res.w), held },
    uMax, uNode, sagNode: s.node, uStress: uMax, uBuckling: 0,
    ratio: s.ratio, deflectionMm: s.deflectionMm, allowableMm: s.allowableMm, spanMm: s.spanMm, cantilever: s.cantilever,
    reactions,
    curvature: { kaa: res.kaa, kbb: res.kbb, kab: res.kab }
  }
}

/**
 * The field of a layer (stone on a carrier board) from the plate it rests on: the
 * common curvature with the layer's own rigidity gives its share of the moment, the
 * carrier's deflection is its deflection.
 */
export function layerField(own: StaticField, layer: { material: Material; grain?: WorldAxis; t: number }, host: FeOutcome): { field: StaticField; uMax: number; uNode: number } | null {
  const hf = host.field
  if (!host.curvature || hf.axes[1] !== 'z') return null
  const na = hf.a.length
  const D = plateRigidity(layer.material, layer.grain, layer.t)
  const props = inPlane(layer.material, layer.grain, 'x', 'z', true)
  const sample = (arr: ArrayLike<number>, x: number, z: number): number => {
    const i = Math.min(na - 2, Math.max(0, hf.a.findIndex((v, k) => k < na - 1 && x <= hf.a[k + 1])))
    const j = Math.min(hf.b.length - 2, Math.max(0, hf.b.findIndex((v, k) => k < hf.b.length - 1 && z <= hf.b[k + 1])))
    const s = Math.min(1, Math.max(0, (x - hf.a[i]) / (hf.a[i + 1] - hf.a[i])))
    const r = Math.min(1, Math.max(0, (z - hf.b[j]) / (hf.b[j + 1] - hf.b[j])))
    const v = (ii: number, jj: number): number => arr[jj * na + ii]
    return (1 - s) * (1 - r) * v(i, j) + s * (1 - r) * v(i + 1, j) + s * r * v(i + 1, j + 1) + (1 - s) * r * v(i, j + 1)
  }
  const n = own.a.length * own.b.length
  const u = new Float32Array(n), w = new Float32Array(n), sag = new Float32Array(n)
  let uMax = 0, uNode = 0
  for (let j = 0; j < own.b.length; j++) {
    for (let i = 0; i < own.a.length; i++) {
      const k = j * own.a.length + i
      const x = own.a[i], z = own.b[j]
      const M = plateMoments(D, sample(host.curvature.kaa, x, z), sample(host.curvature.kbb, x, z), sample(host.curvature.kab, x, z))
      const f = 6 / (layer.t * layer.t)
      u[k] = utilisationAt(props, f * M.Ma, f * M.Mb, f * M.Mab)
      w[k] = sample(hf.w, x, z)
      sag[k] = sample(hf.sag, x, z)
      if (u[k] > uMax) { uMax = u[k]; uNode = k }
    }
  }
  return { field: { ...own, u, w, sag, held: new Uint8Array(n) }, uMax, uNode }
}

// ── Standing board: plane stress ───────────────────────────────────────────

export interface StandingInput {
  box: StaticBox
  /** Horizontal axis in the board's plane (the other one is its thickness) */
  along: 'x' | 'z'
  material: Material
  grain?: WorldAxis
  supports: ContactSupport[]
  /** Own weight per area of the plane, N/mm² */
  weight: number
  received: EnteringLoad[]
  /** Check Euler buckling (a standing panel or post), with this axial load, N */
  bucklingN: number | null
  /**
   * The longest unbraced stretch of its height (world y0, y1), pinned at both ends:
   * the whole height, or less where joints along it brace the panel. Default: the height.
   */
  bucklingGap?: [number, number]
  /** The base is fastened: its supports hold in both directions (a panel the carcass keeps from tipping) */
  fastened?: boolean
}

/**
 * Solves a standing board in its plane; null when its supports cannot hold it. Joints
 * hold their region vertically; only a board that would swing about them (a rail
 * screwed at one end) is held in the plane as well, as by the joints' moment.
 */
export function solveStanding(inp: StandingInput): FeOutcome | null {
  const modes = inp.supports.some((s) => s.kind === 'joint') ? JOINT_MODES : JOINT_MODES.slice(0, 1)
  for (const mode of modes) {
    const fe = solveStandingWith(inp, mode)
    if (fe) return { ...fe, jointMode: mode }
  }
  return null
}

function solveStandingWith(inp: StandingInput, mode: JointMode): FeOutcome | null {
  const { box, along } = inp
  const across: 'x' | 'z' = along === 'x' ? 'z' : 'x'
  const lo = (r: Rect | StaticBox, k: 'x' | 'z'): number => (k === 'x' ? r.x0 : r.z0)
  const hi = (r: Rect | StaticBox, k: 'x' | 'z'): number => (k === 'x' ? r.x1 : r.z1)
  const a0 = lo(box, along), La = hi(box, along) - a0, H = box.y1 - box.y0
  const t = hi(box, across) - lo(box, across)

  const fa: number[] = [], fb: number[] = []
  for (const s of inp.supports) {
    if (s.kind === 'end' || s.kind === 'joint') fb.push(s.y0 - box.y0, s.y1 - box.y0)
    if (s.kind !== 'end') fa.push(lo(s.rect, along) - a0, hi(s.rect, along) - a0)
    if (s.kind === 'joint') { fa.push((lo(s.rect, along) + hi(s.rect, along)) / 2 - a0); fb.push((s.y0 + s.y1) / 2 - box.y0) }
  }
  // Where the loads come in: per giving board its extent along and its height
  const groups = new Map<string, { min: number; max: number; ys: Set<number> }>()
  for (const l of inp.received) {
    const g = groups.get(l.from) ?? { min: Infinity, max: -Infinity, ys: new Set<number>() }
    g.min = Math.min(g.min, lo(l.rect, along)); g.max = Math.max(g.max, hi(l.rect, along)); g.ys.add(l.y)
    groups.set(l.from, g)
  }
  for (const g of groups.values()) {
    fa.push(g.min - a0, g.max - a0)
    for (const y of g.ys) fb.push(y - box.y0)
  }
  const { xa, xb } = buildLines(La, H, fa, fb)
  const na = xa.length, nb = xb.length
  const cells = new Uint8Array((na - 1) * (nb - 1)).fill(1)

  const cover: number[][] = Array.from({ length: na * nb }, () => [])
  // Nodes on a fastened joint's row of fasteners: they hold both ways
  const fastener = new Uint8Array(na * nb)
  inp.supports.forEach((s, si) => {
    if (s.kind === 'joint') {
      // the joint's region in the board's plane pushes like a contact; fastened, its middle
      // line the long way (the row of fasteners) also pulls: a row or a column of nodes
      const p0 = lo(s.rect, along) - a0, p1 = hi(s.rect, along) - a0
      const q0 = Math.max(s.y0, box.y0) - box.y0, q1 = Math.min(s.y1, box.y1) - box.y0
      const near = (lines: number[], v: number): number => lines.reduce((best, x, k) => (Math.abs(x - v) < Math.abs(lines[best] - v) ? k : best), 0)
      for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
        if (inside(xa[i], p0, p1) && inside(xb[j], q0, q1)) cover[j * na + i].push(si)
      }
      if (mode === 'contact') return
      if (p1 - p0 >= q1 - q0) {
        const j = near(xb, (q0 + q1) / 2)
        for (let i = 0; i < na; i++) if (inside(xa[i], p0, p1)) fastener[j * na + i] = 1
      } else {
        const i = near(xa, (p0 + p1) / 2)
        for (let j = 0; j < nb; j++) if (inside(xb[j], q0, q1)) fastener[j * na + i] = 1
      }
      return
    }
    if (s.kind === 'end') {
      const i = Math.abs(lo(s.rect, along) - a0) < Math.abs(lo(s.rect, along) - (a0 + La)) ? 0 : na - 1
      const y0 = Math.max(s.y0, box.y0) - box.y0, y1 = Math.min(s.y1, box.y1) - box.y0
      for (let j = 0; j < nb; j++) if (inside(xb[j], y0, y1)) cover[j * na + i].push(si)
      return
    }
    const r0 = s.kind === 'floor' ? 0 : lo(s.rect, along) - a0, r1 = s.kind === 'floor' ? La : hi(s.rect, along) - a0
    for (let i = 0; i < na; i++) if (inside(xa[i], r0, r1)) cover[i].push(si)
  })
  const supportNodes = cover.flatMap((c, n) => (c.length ? [n] : []))
  if (supportNodes.length === 0) return null
  const contactNodes = supportNodes.filter((n) => !fastener[n])
  const jointNodes = supportNodes.filter((n) => fastener[n])
  // Hold the sliding at the lowest support node nearest the middle of the supports
  const mid = supportNodes.reduce((s, n) => s + xa[n % na], 0) / supportNodes.length
  const fixU = supportNodes.reduce((best, n) => {
    const key = (k: number): number => Math.floor(k / na) * 1e6 + Math.abs(xa[k % na] - mid)
    return key(n) < key(best) ? n : best
  })

  const props = inPlane(inp.material, inp.grain, along, 'y', false)
  const loads: LineLoad[] = inp.received.map((l) => ({ a0: lo(l.rect, along) - a0, a1: hi(l.rect, along) - a0, b: l.y - box.y0, F: l.F }))
  const memoKey = `s|${xa.join(',')}|${xb.join(',')}|${contactNodes.join(',')}|${jointNodes.join(',')}|${fixU}|${inp.fastened ? 1 : 0}|${mode}`
  const res = solvePlaneStress({
    xa, xb, cells, t, C: planeMaterial(props), weight: inp.weight, loads,
    supports: [{ nodes: contactNodes, unilateral: !inp.fastened }, { nodes: jointNodes, unilateral: false, holdU: mode === 'clamped' }],
    fixU,
    initialHeld: contactMemo.get(memoKey)
  })
  if (!res) return null
  rememberContact(memoKey, res.held)
  const held = markJoints(res.held, cover, inp.supports)

  // Euler buckling, pinned at both ends of its longest unbraced stretch (the whole height
  // unless joints along it brace the panel); shown over that stretch as its first mode,
  // sin(π·s/L), on top of the stress field. A stretch shorter than BRACED_GAP thicknesses
  // counts as braced throughout.
  let uBuckling = 0
  const [g0, g1] = inp.bucklingGap ?? [box.y0, box.y1]
  const gap = g1 - g0
  if (inp.bucklingN !== null && inp.bucklingN > 0 && gap > BRACED_GAP * t) {
    const nCrit = (Math.PI ** 2 * props.Eb * ((La * t ** 3) / 12)) / (gap * gap)
    uBuckling = inp.bucklingN / nCrit
  }
  const modeShape = (y: number): number => (y > g0 && y < g1 ? Math.sin((Math.PI * (y - g0)) / gap) : 0)
  const nodes = na * nb
  const u = new Float32Array(nodes)
  let uMax = 0, uNode = 0, uStress = 0
  for (let n = 0; n < nodes; n++) {
    const s = utilisationAt(props, res.sa[n], res.sb[n], res.tab[n])
    uStress = Math.max(uStress, s)
    u[n] = Math.max(s, uBuckling * modeShape(box.y0 + xb[Math.floor(n / na)]))
    if (u[n] > uMax) { uMax = u[n]; uNode = n }
  }
  if (uBuckling > uMax) {
    // buckling governs: its hot spot is the middle of the unbraced stretch, mid-width
    uMax = uBuckling
    const yMid = (g0 + g1) / 2 - box.y0
    const j = xb.reduce((best, v, k) => (Math.abs(v - yMid) < Math.abs(xb[best] - yMid) ? k : best), 0)
    const i = xa.reduce((best, v, k) => (Math.abs(v - La / 2) < Math.abs(xa[best] - La / 2) ? k : best), 0)
    uNode = j * na + i
  }
  // Deflection: a column of the grid that rests somewhere does not span; the others span between those that do
  const colHeld = (i: number): boolean => { for (let j = 0; j < nb; j++) if (res.held[j * na + i]) return true; return false }
  const colRefs = lineRefs(xa, colHeld)
  const s = sagFrom(res.v, deepSpansOff(Array.from({ length: nodes }, (_, n) => colRefs[n % na]), H))

  const aw = xa.map((v) => v + a0), bw = xb.map((v) => v + box.y0)
  const reactions = collectReactions(res.R, res.held, cover, (n, si) => {
    const sup = inp.supports[si]
    const i = n % na, j = Math.floor(n / na)
    if (sup.kind === 'end') return { rect: sup.rect, y: bw[j] }
    const [p0, p1] = tributary(aw, i)
    if (sup.kind === 'joint') {
      // into the joined board over the joint region, at the node's height
      const q0 = Math.max(p0, lo(sup.rect, along)), q1 = Math.max(q0, Math.min(p1, hi(sup.rect, along)))
      const c0 = lo(sup.rect, across), c1 = hi(sup.rect, across)
      return { rect: along === 'x' ? { x0: q0, x1: q1, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: q0, z1: q1 }, y: bw[j] }
    }
    const q0 = sup.kind === 'floor' ? p0 : Math.max(p0, lo(sup.rect, along)), q1 = sup.kind === 'floor' ? p1 : Math.min(p1, hi(sup.rect, along))
    const c0 = lo(box, across), c1 = hi(box, across)
    return {
      rect: along === 'x' ? { x0: q0, x1: Math.max(q0, q1), z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: q0, z1: Math.max(q0, q1) },
      y: box.y0
    }
  })
  return {
    field: {
      axes: along === 'x' ? ['x', 'y'] : ['z', 'y'],
      a: aw, b: bw, cells, u, sag: s.sag, w: Float32Array.from(res.v), da: Float32Array.from(res.ua), held
    },
    uMax, uNode, sagNode: s.node, uStress, uBuckling,
    ratio: s.ratio, deflectionMm: s.deflectionMm, allowableMm: s.allowableMm, spanMm: s.spanMm, cantilever: s.cantilever,
    reactions,
    fastened: inp.fastened === true
  }
}

/** Forgets the remembered contact states (tests, benchmarks). */
export function clearContactMemo(): void {
  contactMemo.clear()
}
