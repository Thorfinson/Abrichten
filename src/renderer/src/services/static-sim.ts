import type { Board, CustomHardwareItem, Joint, Material, PlacedLoad } from '../types/furniture'
import { getMaterialById, permanentMaterial, GAMMA_M } from '../data/materials'
import { hardwareItems } from '../data/hardware'
import { worldAligned, dimDirection } from '../utils/projection'
import { boardFace, type BoardFace } from '../utils/boardFace'
import { GRAVITY, DEFLECTION_WARNING_RATIO, rateMember, minBeamThickness, minPanelThickness, type StaticStatus } from './static-calc'
import {
  solveLying, solveStanding, layerField, plateRigidity, restingField, clearContactMemo, SHELF_PIN_INSET_MM,
  type ContactSupport, type EnteringLoad, type FeOutcome, type Rect, type StaticBox, type StaticField, type WorldAxis
} from './static-fe'

export type { StaticBox, StaticField } from './static-fe'

/*
 * Load simulation of the whole model: every board's loads are followed down to the
 * floor, and each board is solved as a 2D finite-element model on the way
 * (services/static-fe.ts).
 *
 * Model and assumptions
 *  - Boards are taken as their world-aligned box (exact for 90° rotations, the bounding
 *    box otherwise). Cutouts and placed loads lie in the board's own face and count
 *    while that face is horizontal and turned by multiples of 90°.
 *  - Lying board (thickness vertical): a Kirchhoff plate over its face. Standing board
 *    (thickness horizontal: side panel, back, post, a rail on edge): plane stress in
 *    its vertical plane; a panel whose height is its largest dimension is also checked
 *    for Euler buckling.
 *  - Supports: the floor (bottom at y ≤ 0.5), a board whose top touches this board's
 *    bottom (within 5 mm, footprints overlapping) over the contact area, and for
 *    horizontal members a board touching one of its end faces (a shelf between side
 *    panels, in a dado, a rail between posts) along the contact length. An end contact
 *    counts whether or not a joint is modelled. A lying board with shelf pins attached
 *    (hardware category shelfPins) rests on two pins per end contact instead. Every
 *    support only pushes; a board that would lift off a support leaves it.
 *  - Joints (Assembly.joints) connect boards over their contact region and carry the
 *    load between them, replacing their contact (applyJoints): what stands on something
 *    stands and is braced by its joints, what does not stand hangs on its joints. They
 *    push like contacts and pull only where a board would otherwise come off
 *    (static-fe JointMode); every joint braces a standing panel against buckling.
 *  - Loads in N: self-weight ρ·V·g (or Board.weightKg), the payload (Board.loadKg, else the global kg per
 *    shelf on lying boards whose top is free) over the free top, loads placed on the
 *    face (Board.loads), and the reactions of boards resting on it at their real
 *    footprint. Load givers are processed before receivers (see processingOrder).
 *  - A lying board resting on another over most of its area is a layer (stone on a
 *    carrier board): both bend together, sharing the moment by stiffness (LAYER_COVERAGE).
 *  - Every load is permanent (EN 1995-1-1, service class 1): the FE models use the material
 *    under permanent load (data/materials.ts permanentMaterial), so 100 % means it breaks
 *    in the long run and the deflection is the final one, creep included.
 *  - Not modelled: joint and fastener strength, wall anchors, boards held only by a side
 *    face, shear deformation of thick plates, out-of-plane loads on standing boards,
 *    dynamic loads.
 */

/** Up to this height a board stands on the floor. */
const FLOOR_Y_MM = 0.5
/** Gap (or overlap) up to which two faces touch. */
const CONTACT_MM = 5
/** How far a board may reach into another at its end (groove, dado, tenon) and still rest on it. */
const MAX_PENETRATION_MM = 25
/** Overlaps below this are rounding noise. */
const MIN_OVERLAP_MM = 0.5
/** A top covered this much by boards resting on it gets no payload of its own. */
const COVERED_TOP = 0.5
/** The supports must spread over this share of the length, else the board rests on one narrow point. */
const MIN_SUPPORT_BASE = 0.1
/** A lying board with both plan sides shorter than this many thicknesses is a block, not a plate (or a beam). */
const MIN_SLENDERNESS = 2
/**
 * A lying board resting on another over this share of its area is a layer (stone on a
 * carrier board, a liner on a shelf): both bend together, sharing the moment by stiffness.
 */
const LAYER_COVERAGE = 0.8
/** Thinner boards (back panels) do not hold the ends of others. */
const MIN_END_SUPPORT_THICKNESS_MM = 10
/**
 * Metal or glass thicker than this is no sheet but a placeholder body (the appliance
 * presets: oven, sink, dishwasher, cooktop). It is not rated, and weighs what an
 * appliance of that size weighs, not solid steel (a 600 × 850 × 600 oven would be 2.4 t).
 */
const BODY_MIN_THICKNESS_MM = 30
/** Typical appliance mass per bounding volume (oven ≈ 60 kg in 0.3 m³). */
const BODY_DENSITY = 200

const isBody = (b: Board, material: Material | undefined): boolean =>
  (material?.category === 'metal' || material?.category === 'glass') && Math.min(b.width, b.height, b.depth) > BODY_MIN_THICKNESS_MM
const ownWeight = (b: Board): number | undefined => (typeof b.weightKg === 'number' && b.weightKg >= 0 ? b.weightKg : undefined)

/**
 * A board's weight in kg as the simulation takes it: its own weightKg (an appliance from
 * its datasheet), else volume × density, an appliance placeholder at BODY_DENSITY.
 */
export function boardWeightKg(b: Board, material: Material | undefined): number {
  return ownWeight(b) ?? (b.width * b.height * b.depth / 1e9) * (isBody(b, material) ? BODY_DENSITY : material?.density ?? 0)
}
/**
 * Finite-element solutions kept across runs (one board changing re-solves only what it
 * touches): several 100-board projects; the least recently used go first.
 */
const MAX_CACHED = 600

type HAxis = 'x' | 'z'

interface Support extends ContactSupport {
  /** Supporting member, -1 for the floor */
  by: number
  /** Contact area, for sharing a rigid board's load (mm²) */
  area: number
}

interface Member {
  index: number
  raw: Board
  /** World-aligned copy */
  board: Board
  box: StaticBox
  material: Material | undefined
  /** The material under permanent load (strength × k_mod, stiffness ÷ (1 + k_def)): what the FE models use */
  longTerm: Material | undefined
  /** The height is the largest dimension (post, side panel, back, door) */
  vertical: boolean
  /** Thickness (smallest dimension) of the world-aligned board and its axis */
  face: BoardFace
  /** Thickness vertical: shelf, top, bottom (a plate); otherwise standing (plane stress) */
  lying: boolean
  /** Appliance placeholder (see BODY_MIN_THICKNESS_MM): carries load, is not rated */
  body: boolean
  /** Shelf pins attached: rests on pins at its end contacts */
  pins: boolean
  grain: WorldAxis | undefined
  supports: Support[]
  received: EnteringLoad[]
  /** Parts of this board's top that other boards rest on */
  covers: Rect[]
  /** Contact regions of every joint of this board, either direction (they brace it) */
  joints: StaticBox[]
  /** Lying boards resting on this one over most of their area: they bend together */
  layers: { index: number; rect: Rect }[]
}

/** A force handed down to a supporting board (world point of its centre, N). */
export interface StaticReaction { x: number; y: number; z: number; F: number; to: string | null }

export interface BoardStatic {
  boardId: string
  /** 'vertical': the height is the largest dimension (as before) */
  kind: 'horizontal' | 'vertical'
  /** plate: lying board; plane: standing board; none: not bent (on the floor, a block) */
  model: 'plate' | 'plane' | 'none'
  status: StaticStatus
  material: Material
  gammaM: number
  box: StaticBox
  /** Everything the board carries, its own weight included (N) */
  totalLoadN: number
  /** Payload put directly on this board (kg): its own or the global one */
  payloadKg: number
  /** Loads placed on the board (kg) */
  placedKg: number
  /** Utilisation and deflection over the board (FE grid) */
  field: StaticField
  uMax: number
  /** What governs uMax: the stress, or Euler buckling of a standing panel */
  governing: 'stress' | 'buckling'
  /** Where uMax occurs: world point (top face of a lying board, mid-thickness of a standing one) */
  maxAt: { x: number; y: number; z: number }
  /** …in mm from the box's min corner along field.axes */
  maxLocal: { a: number; b: number }
  /** Largest deflection against span/200 (1 = critical) and where it is */
  sagMax: number
  sagAt: { x: number; y: number; z: number }
  /** Free span (between supports, or a cantilever's length) where the deflection is worst; 0 if none */
  spanMm: number
  cantilever: boolean
  deflectionMm: number
  allowableDeflectionMm: number
  thicknessMm: number
  minThicknessMm: number | null
  /** Forces this board hands to its supports */
  reactions: StaticReaction[]
}

export interface StaticSimulation {
  results: Map<string, BoardStatic>
  critical: number
  warning: number
  unsupported: number
  durationMs: number
  /** Boards solved in this run (the others came from the cache) */
  solved: number
}

export interface SimulationOptions {
  /** Global payload per shelf (kg) for boards without their own loadKg */
  payloadKg: number
  customMaterials?: Material[]
  /** Joints between the boards (Assembly.joints of the visible assemblies): fastened connections */
  joints?: Pick<Joint, 'boardA' | 'boardB'>[]
  /** Project hardware, to recognise custom shelf pins */
  customHardware?: CustomHardwareItem[]
}

const lo = (r: Rect | StaticBox, a: HAxis): number => (a === 'x' ? r.x0 : r.z0)
const hi = (r: Rect | StaticBox, a: HAxis): number => (a === 'x' ? r.x1 : r.z1)
const other = (a: HAxis): HAxis => (a === 'x' ? 'z' : 'x')
const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0)
const footprint = (b: StaticBox): Rect => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 })
const rectArea = (r: Rect): number => (r.x1 - r.x0) * (r.z1 - r.z0)
const make = (a: HAxis, a0: number, a1: number, o0: number, o1: number): Rect =>
  (a === 'x' ? { x0: a0, x1: a1, z0: o0, z1: o1 } : { x0: o0, x1: o1, z0: a0, z1: a1 })
const WORLD_AXIS: Record<'width' | 'height' | 'depth', WorldAxis> = { width: 'x', height: 'y', depth: 'z' }

// ── Face coordinates (cutouts, placed loads) ──────────────────────────────

/**
 * Maps a point of the board's own face (x along its width, z along its depth, from its
 * min corner, as cutouts and placed loads are given) to world x/z. Null while the face
 * is not horizontal and turned by a multiple of 90°: then face rectangles have no
 * rectangle in the world-aligned box.
 */
export function faceToWorld(raw: Board): ((x: number, z: number) => { x: number; z: number }) | null {
  const { x, y, z } = raw.rotation
  const cx = raw.position.x + raw.width / 2, cz = raw.position.z + raw.depth / 2
  if (!x && !y && !z) return (px, pz) => ({ x: raw.position.x + px, z: raw.position.z + pz })
  const dW = dimDirection(raw, 'width'), dD = dimDirection(raw, 'depth'), dH = dimDirection(raw, 'height')
  const axisAligned = (d: { x: number; y: number; z: number }): boolean => [d.x, d.y, d.z].every((v) => v === 0 || Math.abs(v) === 1)
  if (Math.abs(dH.y) !== 1 || !axisAligned(dW) || !axisAligned(dD)) return null
  return (px, pz) => ({
    x: cx + (px - raw.width / 2) * dW.x + (pz - raw.depth / 2) * dD.x,
    z: cz + (px - raw.width / 2) * dW.z + (pz - raw.depth / 2) * dD.z
  })
}

/** The inverse of faceToWorld: a world point on the board's top face in face coordinates. */
export function worldToFace(raw: Board, p: { x: number; z: number }): { x: number; z: number } | null {
  if (!faceToWorld(raw)) return null
  const cx = raw.position.x + raw.width / 2, cz = raw.position.z + raw.depth / 2
  const dW = dimDirection(raw, 'width'), dD = dimDirection(raw, 'depth')
  return {
    x: (p.x - cx) * dW.x + (p.z - cz) * dW.z + raw.width / 2,
    z: (p.x - cx) * dD.x + (p.z - cz) * dD.z + raw.depth / 2
  }
}

function faceRect(map: (x: number, z: number) => { x: number; z: number }, x: number, z: number, w: number, d: number): Rect {
  const a = map(x, z), b = map(x + w, z + d)
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }
}

/** Clips a rect to the box's footprint; null when nothing is left. */
function clip(r: Rect, b: StaticBox): Rect | null {
  const out = { x0: Math.max(r.x0, b.x0), x1: Math.min(r.x1, b.x1), z0: Math.max(r.z0, b.z0), z1: Math.min(r.z1, b.z1) }
  return out.x1 >= out.x0 && out.z1 >= out.z0 ? out : null
}

function hasShelfPins(raw: Board, customHardware?: CustomHardwareItem[]): boolean {
  return (raw.hardware ?? []).some((h) => h.quantity > 0 && (
    hardwareItems.find((i) => i.id === h.hardwareId)?.category === 'shelfPins' ||
    customHardware?.find((i) => i.id === h.hardwareId)?.category === 'shelfPins'))
}

function buildMember(raw: Board, index: number, options: SimulationOptions): Member {
  const board = worldAligned(raw)
  const { x, y, z } = board.position
  const material = getMaterialById(board.materialId, options.customMaterials)
  const face = boardFace(board)
  return {
    index, raw, board,
    box: { x0: x, y0: y, z0: z, x1: x + board.width, y1: y + board.height, z1: z + board.depth },
    material,
    longTerm: material && permanentMaterial(material),
    vertical: board.height >= Math.max(board.width, board.depth),
    face,
    lying: face.thicknessAxis === 'height' && board.height < Math.max(board.width, board.depth),
    body: isBody(raw, material),
    pins: hasShelfPins(raw, options.customHardware),
    grain: board.grainDirection ? WORLD_AXIS[board.grainDirection] : undefined,
    supports: [],
    received: [],
    covers: [],
    layers: [],
    joints: []
  }
}

/**
 * A board touching an end face of horizontal member `b` along x or z and overlapping it
 * vertically and across: it holds that end. It may reach into `b` (groove, dado). The
 * broad faces of a panel standing on edge are no ends, and a horizontal board met with
 * its own end face is a continuation (a worktop seam), not a support.
 */
function endContact(b: StaticBox, s: StaticBox, sVertical: boolean, ends: readonly HAxis[]): { rect: Rect; area: number; axis: HAxis } | null {
  const oy = overlap(b.y0, b.y1, s.y0, s.y1)
  if (oy <= MIN_OVERLAP_MM) return null
  for (const a of ends) {
    const o = other(a)
    const across = overlap(lo(b, o), hi(b, o), lo(s, o), hi(s, o))
    if (across <= MIN_OVERLAP_MM) continue
    if (!sVertical && hi(s, a) - lo(s, a) >= hi(s, o) - lo(s, o)) continue
    const pen = Math.min(MAX_PENETRATION_MM, 0.25 * (hi(b, a) - lo(b, a)))
    let at: number | null = null
    if (lo(s, a) >= hi(b, a) - pen && lo(s, a) <= hi(b, a) + CONTACT_MM && hi(s, a) > hi(b, a) + MIN_OVERLAP_MM) at = hi(b, a)
    else if (hi(s, a) <= lo(b, a) + pen && hi(s, a) >= lo(b, a) - CONTACT_MM && lo(s, a) < lo(b, a) - MIN_OVERLAP_MM) at = lo(b, a)
    if (at === null) continue
    return { rect: make(a, at, at, Math.max(lo(b, o), lo(s, o)), Math.min(hi(b, o), hi(s, o))), area: oy * across, axis: a }
  }
  return null
}

/**
 * Shelf pins along an end contact: two per end, 37 mm in from the front and back edges
 * of the shelf (the front row of the 32 mm system; the rear pin mirrors it), at a
 * quarter of the depth on boards too shallow for that; kept within the contact.
 */
function pinPositions(m: Member, rect: Rect, axis: HAxis): { x: number; z: number }[] {
  const o = other(axis)
  const e0 = lo(m.box, o), e1 = hi(m.box, o)
  const inset = e1 - e0 >= 2 * SHELF_PIN_INSET_MM + 20 ? SHELF_PIN_INSET_MM : 0.25 * (e1 - e0)
  const clampTo = (p: number): number => Math.min(hi(rect, o), Math.max(lo(rect, o), p))
  const at = lo(rect, axis)
  const ps = [clampTo(e0 + inset), clampTo(e1 - inset)]
  const unique = ps[1] - ps[0] < 1 ? [(ps[0] + ps[1]) / 2] : ps
  return unique.map((p) => (axis === 'x' ? { x: at, z: p } : { x: p, z: at }))
}

/** Support relations, built once for all members. */
function findSupports(members: Member[]): void {
  for (const m of members) {
    const b = m.box
    if (b.y0 <= FLOOR_Y_MM) {
      m.supports.push({ kind: 'floor', by: -1, rect: footprint(b), area: rectArea(footprint(b)), y0: b.y0, y1: b.y0 })
      continue
    }
    // ends: the horizontal axes along the board's face (both for a lying board, the length of a rail on edge)
    const ends = (['x', 'z'] as const).filter((a) => (a === 'x' ? 'width' : 'depth') !== m.face.thicknessAxis)
    for (const s of members) {
      if (s === m) continue
      const sb = s.box
      const ox = overlap(b.x0, b.x1, sb.x0, sb.x1)
      const oz = overlap(b.z0, b.z1, sb.z0, sb.z1)
      if (Math.abs(sb.y1 - b.y0) <= CONTACT_MM && sb.y0 < b.y0 && ox > MIN_OVERLAP_MM && oz > MIN_OVERLAP_MM) {
        const rect = { x0: Math.max(b.x0, sb.x0), x1: Math.min(b.x1, sb.x1), z0: Math.max(b.z0, sb.z0), z1: Math.min(b.z1, sb.z1) }
        m.supports.push({ kind: 'below', by: s.index, rect, area: ox * oz, y0: b.y0, y1: b.y0 })
        s.covers.push(rect)
        if (m.lying && s.lying && ox * oz >= LAYER_COVERAGE * rectArea(footprint(b))) s.layers.push({ index: m.index, rect })
        continue
      }
      if (m.vertical || s.face.thickness < MIN_END_SUPPORT_THICKNESS_MM) continue
      const end = endContact(b, sb, s.vertical, ends)
      if (!end) continue
      const y0 = Math.max(b.y0, sb.y0), y1 = Math.min(b.y1, sb.y1)
      const pins = m.lying && m.pins ? pinPositions(m, end.rect, end.axis) : undefined
      m.supports.push({ kind: 'end', by: s.index, rect: end.rect, area: end.area, y0, y1, pins })
    }
  }
}

/** A joint bridges a gap up to this: drawer runners (12.7 mm a side), spacer strips. */
const JOINT_GAP_MM = 15

/**
 * Where two boxes touch or overlap: per axis the overlap, or the middle of a gap of at
 * most `gap`. Null when they are apart, or touch only at an edge point.
 */
function contactRegion(a: StaticBox, b: StaticBox, gap: number): StaticBox | null {
  const out: number[] = []
  let flat = 0
  for (const [lo0, hi0, lo1, hi1] of [[a.x0, a.x1, b.x0, b.x1], [a.y0, a.y1, b.y0, b.y1], [a.z0, a.z1, b.z0, b.z1]]) {
    const l = Math.max(lo0, lo1), h = Math.min(hi0, hi1)
    if (h < l - gap) return null
    if (h - l <= MIN_OVERLAP_MM) { flat++; out.push((l + h) / 2, (l + h) / 2) } else out.push(l, h)
  }
  if (flat > 2) return null
  return { x0: out[0], x1: out[1], y0: out[2], y1: out[3], z0: out[4], z1: out[5] }
}

/**
 * Joints (Assembly.joints) are connections: each holds its two boards together over their
 * contact region, pushing and pulling. Which one carries the other follows what stands
 * on what:
 *  - A board stands when it rests on the floor, or by its resting and end contacts
 *    (findSupports) on standing boards, steadily (standsOn). Its joints with the boards
 *    it rests on become two-way connections; its other joints only brace it. So a
 *    cladding standing on the floor and the frame standing beside it brace each other
 *    but carry nothing for each other, and a shelf screwed between two side panels
 *    rests on them as on its ends, now also held down.
 *  - A board that does not stand hangs on its joints: on the standing boards it is
 *    joined to, else on those hanging nearer to them (counted in joints), also where it
 *    hangs below them (tension). Two boards equally far from the standing ones brace each
 *    other but carry nothing for each other (a hanging cladding and a batten both nailed
 *    to the same posts). So the joints form no cycle.
 * A joint replaces the contact of its pair; boards without joints keep the contact rules.
 * Every joint braces both boards (bucklingGap).
 */
function applyJoints(members: Member[], joints: Pick<Joint, 'boardA' | 'boardB'>[]): void {
  const n = members.length
  const index = new Map(members.map((m) => [m.raw.id, m.index]))
  const pairs = new Map<string, { a: number; b: number; region: StaticBox }>()
  for (const j of joints) {
    const a = index.get(j.boardA), b = index.get(j.boardB)
    if (a === undefined || b === undefined || a === b) continue
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (pairs.has(key)) continue
    const region = contactRegion(members[a].box, members[b].box, JOINT_GAP_MM)
    if (!region) continue
    pairs.set(key, { a, b, region })
    members[a].joints.push(region)
    members[b].joints.push(region)
  }
  if (pairs.size === 0) return

  // Standing boards: on the floor, or steadily on standing boards by their contacts. A
  // standing panel whose centre is not over its contacts (a side panel on a rail at its
  // front edge) stands, but not steadily: its joints with steady standing boards carry it
  const standing = new Uint8Array(n), steady = new Uint8Array(n)
  for (const m of members) if (m.supports.some((s) => s.kind === 'floor')) { standing[m.index] = 1; steady[m.index] = 1 }
  for (let changed = true; changed;) {
    changed = false
    for (const m of members) {
      if (standing[m.index]) continue
      const on = m.supports.filter((s) => s.by >= 0 && standing[s.by])
      if (!on.length || !standsOn(m, on)) continue
      standing[m.index] = 1
      steady[m.index] = steadyInPlane(m, on) ? 1 : 0
      changed = true
    }
  }
  // Distance from the standing boards: a joint is one step, resting steadily on boards none
  // (0-1 BFS). A board that would tip on its contacts (a drawer bottom touching a rail with
  // its front edge) gets its place from its joints; the contacts still push.
  const dist = members.map((m) => (standing[m.index] ? 0 : Infinity))
  const steps: { to: number; w: number }[][] = members.map(() => [])
  for (const m of members) {
    const resting = m.supports.filter((s) => s.by >= 0)
    if (resting.length && standsOn(m, resting)) for (const s of resting) steps[s.by].push({ to: m.index, w: 0 })
  }
  for (const { a, b } of pairs.values()) { steps[a].push({ to: b, w: 1 }); steps[b].push({ to: a, w: 1 }) }
  const deque: number[] = members.filter((m) => standing[m.index]).map((m) => m.index)
  for (let head = 0; head < deque.length; head++) {
    const i = deque[head]
    for (const { to, w } of steps[i]) {
      if (dist[i] + w < dist[to]) { dist[to] = dist[i] + w; deque.push(to) }
    }
  }

  const jointSupport = (by: number, region: StaticBox): Support => {
    const ext = [region.x1 - region.x0, region.y1 - region.y0, region.z1 - region.z0].sort((p, q) => q - p)
    return {
      kind: 'joint', by,
      rect: { x0: region.x0, x1: region.x1, z0: region.z0, z1: region.z1 },
      y0: region.y0, y1: region.y1,
      area: Math.max(1, ext[0]) * Math.max(1, ext[1])
    }
  }
  for (const { a, b, region } of pairs.values()) {
    // the contact of the pair, if any: who rests on whom
    const aOnB = members[a].supports.some((s) => s.by === b), bOnA = members[b].supports.some((s) => s.by === a)
    members[a].supports = members[a].supports.filter((s) => s.by !== b)
    members[b].supports = members[b].supports.filter((s) => s.by !== a)
    let carrier = -1, held = -1
    if (aOnB && dist[b] <= dist[a]) { carrier = b; held = a }
    else if (bOnA && dist[a] <= dist[b]) { carrier = a; held = b }
    else if (standing[a] && standing[b] && steady[a] !== steady[b]) [carrier, held] = steady[a] ? [a, b] : [b, a]
    else if (dist[a] !== dist[b] && !(standing[a] && standing[b])) {
      ;[carrier, held] = dist[a] < dist[b] ? [a, b] : [b, a]
    }
    if (carrier < 0 || members[held].supports.some((s) => s.kind === 'floor')) continue
    members[held].supports.push(jointSupport(carrier, region))
  }
}

/**
 * The supports `on` hold board m steadily under its own weight: its centre lies within
 * their extent (both ways for a lying board, along its plane for a rail on edge), which
 * is not one narrow point. A standing panel stands on any support (it is not checked for
 * tipping in its plane, the carcass holds it: see steadyInPlane).
 */
function standsOn(m: Member, on: Support[]): boolean {
  if (m.vertical) return true
  return steadyInPlane(m, on)
}

/** Board m's centre lies over the supports `on` (both ways when lying, along its plane when standing). */
function steadyInPlane(m: Member, on: Support[]): boolean {
  const axes: HAxis[] = m.lying ? ['x', 'z'] : [m.face.thicknessAxis === 'width' ? 'z' : 'x']
  return holdsAt(m, on, [{ rect: footprint(m.box), F: 1 }], axes)
}

/**
 * The longest unbraced stretch of a standing panel's height: between its ends (taken as
 * pinned, as before) and the joints along it, which hold it sideways (a cladding nailed
 * to posts or battens).
 */
function bucklingGap(m: Member): [number, number] {
  const { y0, y1 } = m.box
  const held = m.joints.map((r) => [Math.max(y0, r.y0), Math.min(y1, r.y1)] as [number, number]).filter(([p, q]) => q >= p)
  const spans: [number, number][] = [[y0, y0] as [number, number], ...held, [y1, y1] as [number, number]].sort((p, q) => p[0] - q[0])
  let best: [number, number] = [y0, y0]
  let reach = y0
  for (const [p, q] of spans) {
    if (p - reach > best[1] - best[0]) best = [reach, p]
    reach = Math.max(reach, q)
  }
  return best
}

/**
 * Load givers before receivers: a board is processed once every board resting on it is.
 * A cycle in the support graph (two boards each holding the other, e.g. overlapping parts)
 * is broken by taking the remaining board with the highest top first (then the lower
 * index); loads it would still receive from the cycle are dropped.
 */
function processingOrder(members: Member[]): number[] {
  const n = members.length
  const receivers = members.map((m) => [...new Set(m.supports.filter((s) => s.by >= 0).map((s) => s.by))])
  const pending = new Array<number>(n).fill(0)
  for (const r of receivers) for (const j of r) pending[j]++
  const done = new Array<boolean>(n).fill(false)
  const order: number[] = []
  const pick = (ready: boolean): number => {
    let best = -1
    for (let i = 0; i < n; i++) {
      if (done[i] || (ready && pending[i] > 0)) continue
      if (best < 0 || members[i].box.y1 > members[best].box.y1) best = i
    }
    return best
  }
  while (order.length < n) {
    let next = pick(true)
    if (next < 0) next = pick(false)
    done[next] = true
    order.push(next)
    for (const j of receivers[next]) pending[j]--
  }
  return order
}

interface OwnLoads {
  /** Own weight, N, and per area of the face / plane, N/mm² */
  selfN: number
  selfPressure: number
  payloadN: number
  payloadKg: number
  placed: { rect: Rect; F: number }[]
  placedKg: number
}

/** Own weight, payload and placed loads of a member. */
function ownLoads(m: Member, payloadKg: number): OwnLoads {
  const raw = m.raw
  const map = m.lying ? faceToWorld(raw) : null
  const cuts = map ? (raw.cutouts ?? []) : []
  const cut = cuts.reduce((s, c) => s + c.width * c.depth, 0)
  const volumeM3 = (Math.max(0, raw.width * raw.depth - cut) * raw.height) / 1e9
  // a part with its own weight (Board.weightKg) spreads it over its volume
  const weight = ownWeight(raw)
  const density = weight !== undefined && volumeM3 > 0 ? weight / volumeM3 : m.body ? BODY_DENSITY : m.material?.density ?? 0
  const selfN = density * volumeM3 * GRAVITY
  const coveredTop = m.covers.reduce((s, r) => s + rectArea(r), 0) >= COVERED_TOP * rectArea(footprint(m.box))
  const own = typeof raw.loadKg === 'number' && raw.loadKg >= 0 ? raw.loadKg : m.lying && !coveredTop ? payloadKg : 0
  const placed = map ? (raw.loads ?? []).flatMap((l: PlacedLoad) => {
    const r = clip(faceRect(map, l.x, l.z, l.w, l.d), m.box)
    return r && l.kg > 0 ? [{ rect: r, F: l.kg * GRAVITY }] : []
  }) : []
  return {
    selfN,
    selfPressure: (density * m.face.thickness * GRAVITY) / 1e9,
    payloadN: own * GRAVITY,
    payloadKg: own,
    placed,
    placedKg: placed.reduce((s, p) => s + p.F, 0) / GRAVITY
  }
}

/**
 * The supports must hold the board: the centre of its downward load lies within their
 * extent, which must not be one narrow point. Lying boards in x and z, standing boards
 * along their plane (across it they are held by the carcass, which is not modelled).
 */
function isStable(m: Member, loads: { rect: Rect; F: number }[], axes: readonly HAxis[]): boolean {
  return holdsAt(m, m.supports, loads, axes)
}

/** The centre of the downward loads lies within the extent of the supports, which is no narrow point. */
function holdsAt(m: Member, supports: Support[], loads: { rect: Rect; F: number }[], axes: readonly HAxis[]): boolean {
  if (supports.length === 0) return false
  const down = loads.filter((l) => l.F > 0)
  const total = down.reduce((s, l) => s + l.F, 0)
  if (total <= 0) return true
  const rects = supports.flatMap((s) => s.pins ? s.pins.map((p) => ({ x0: p.x, x1: p.x, z0: p.z, z1: p.z })) : [s.rect])
  for (const a of axes) {
    const c = down.reduce((s, l) => s + l.F * (lo(l.rect, a) + hi(l.rect, a)) / 2, 0) / total
    const s0 = Math.min(...rects.map((r) => lo(r, a)))
    const s1 = Math.max(...rects.map((r) => hi(r, a)))
    const length = hi(m.box, a) - lo(m.box, a)
    if (c < s0 - MIN_OVERLAP_MM || c > s1 + MIN_OVERLAP_MM) return false
    if (s1 - s0 < MIN_SUPPORT_BASE * length) return false
  }
  return true
}

interface Transfer { toId: string; load: Omit<EnteringLoad, 'from'> }

interface Outcome {
  result: BoardStatic | null
  transfers: Transfer[]
  /** FE solution of a lying board, for the layers resting on it */
  fe?: FeOutcome
}

function centreTop(box: StaticBox): { x: number; y: number; z: number } {
  return { x: (box.x0 + box.x1) / 2, y: box.y1, z: (box.z0 + box.z1) / 2 }
}

function baseResult(m: Member, status: StaticStatus, totalLoadN: number, own: OwnLoads): BoardStatic {
  const box = m.box
  const axes: StaticField['axes'] = m.lying ? ['x', 'z'] : m.face.thicknessAxis === 'depth' ? ['x', 'y'] : ['z', 'y']
  return {
    boardId: m.raw.id,
    kind: m.vertical ? 'vertical' : 'horizontal',
    model: 'none',
    status,
    material: m.material!,
    gammaM: GAMMA_M[m.material!.category],
    box,
    totalLoadN,
    payloadKg: own.payloadKg,
    placedKg: own.placedKg,
    field: restingField(box, axes),
    uMax: 0,
    governing: 'stress',
    maxAt: centreTop(box),
    maxLocal: { a: 0, b: 0 },
    sagMax: 0,
    sagAt: centreTop(box),
    spanMm: 0,
    cantilever: false,
    deflectionMm: 0,
    allowableDeflectionMm: 0,
    thicknessMm: m.face.thickness,
    minThicknessMm: null,
    reactions: []
  }
}

/** A world point of field node n: on the top face of a lying board, mid-thickness of a standing one. */
function nodePoint(m: Member, f: StaticField, n: number): { x: number; y: number; z: number } {
  const na = f.a.length
  const pa = f.a[n % na], pb = f.b[Math.floor(n / na)]
  if (f.axes[1] === 'z') return { x: pa, y: m.box.y1, z: pb }
  const mid = (a: number, b: number): number => (a + b) / 2
  return f.axes[0] === 'x' ? { x: pa, y: pb, z: mid(m.box.z0, m.box.z1) } : { x: mid(m.box.x0, m.box.x1), y: pb, z: pa }
}

function fieldLocal(m: Member, f: StaticField, n: number): { a: number; b: number } {
  const na = f.a.length
  const start = (k: WorldAxis): number => (k === 'x' ? m.box.x0 : k === 'y' ? m.box.y0 : m.box.z0)
  return { a: f.a[n % na] - start(f.axes[0]), b: f.b[Math.floor(n / na)] - start(f.axes[1]) }
}

/**
 * The reactions of a board that had to be held both ways (a fastened panel base, joints
 * that had to pull, see static-fe JointMode): the pull is taken by the joint or the
 * carcass, whose give is not modelled, so only the contacts that push hand anything
 * down, together carrying the board's load. Otherwise every supporter, being taken as
 * rigid, would pass push/pull pairs on through the frame.
 */
function pushingOnly(reactions: FeOutcome['reactions'], totalN: number): FeOutcome['reactions'] {
  const net = new Map<number, { pos: number; sum: number }>()
  for (const r of reactions) {
    const g = net.get(r.support) ?? { pos: 0, sum: 0 }
    g.sum += r.F
    if (r.F > 0) g.pos += r.F
    net.set(r.support, g)
  }
  const pushing = [...net.values()].reduce((s, g) => s + Math.max(0, g.sum), 0)
  if (pushing <= 0) return []
  return reactions.flatMap((r) => {
    const g = net.get(r.support)!
    if (r.F <= 0 || g.sum <= 0) return []
    return [{ ...r, F: r.F * (g.sum / g.pos) * (totalN / pushing) }]
  })
}

/** BoardStatic and the loads handed down from a finite-element solution. */
function fromFe(m: Member, fe: FeOutcome, base: BoardStatic, members: Member[]): Outcome {
  const gammaM = base.gammaM
  const f = fe.field
  let sagMax = 0
  for (let n = 0; n < f.sag.length; n++) sagMax = Math.max(sagMax, f.sag[n])
  const t = m.face.thickness
  const transfers: Transfer[] = []
  const reactions: StaticReaction[] = []
  // a board its joints had to hold both ways (or a fastened base) hands down only what pushes
  const pulled = fe.fastened || (fe.jointMode !== undefined && fe.jointMode !== 'contact')
  for (const r of pulled ? pushingOnly(fe.reactions, base.totalLoadN) : fe.reactions) {
    const s = m.supports[r.support]
    const point = { x: (r.rect.x0 + r.rect.x1) / 2, y: r.y, z: (r.rect.z0 + r.rect.z1) / 2 }
    reactions.push({ ...point, F: r.F, to: s.by >= 0 ? members[s.by].raw.id : null })
    if (s.by >= 0) transfers.push({ toId: members[s.by].raw.id, load: { rect: r.rect, y: r.y, F: r.F } })
  }
  const minThicknessMm = m.lying
    ? minBeamThickness(t, fe.uMax, gammaM, fe.deflectionMm, fe.allowableMm)
    : minPanelThickness(t, fe.uStress, fe.uBuckling, gammaM, fe.deflectionMm, fe.allowableMm)
  return {
    result: {
      ...base,
      model: m.lying ? 'plate' : 'plane',
      status: rateMember(fe.uMax, fe.ratio, gammaM),
      field: f,
      uMax: fe.uMax,
      governing: fe.uBuckling > fe.uStress ? 'buckling' : 'stress',
      maxAt: nodePoint(m, f, fe.uNode),
      maxLocal: fieldLocal(m, f, fe.uNode),
      sagMax,
      sagAt: nodePoint(m, f, fe.sagNode),
      spanMm: fe.spanMm,
      cantilever: fe.cantilever,
      deflectionMm: fe.deflectionMm,
      allowableDeflectionMm: fe.allowableMm,
      minThicknessMm,
      reactions
    },
    transfers,
    fe
  }
}

/** A board that does not bend (unknown material, block): its load goes to its supports by contact area. */
function rigidTransfers(m: Member, totalN: number, members: Member[]): Transfer[] {
  if (m.supports.some((s) => s.by < 0)) return []
  const area = m.supports.reduce((sum, s) => sum + s.area, 0)
  return m.supports.map((s) => ({
    toId: members[s.by].raw.id,
    load: { rect: s.rect, y: s.kind === 'end' || s.kind === 'joint' ? (s.y0 + s.y1) / 2 : m.box.y0, F: area > 0 ? (totalN * s.area) / area : totalN / m.supports.length }
  }))
}

/** Loads handed down by a rigid board, as its reactions. */
function asReactions(transfers: Transfer[]): StaticReaction[] {
  return transfers.map((t) => ({ x: (t.load.rect.x0 + t.load.rect.x1) / 2, y: t.load.y, z: (t.load.rect.z0 + t.load.rect.z1) / 2, F: t.load.F, to: t.toId }))
}

/** Everything a member's solution depends on, as a cache key. */
function memberKey(m: Member, own: OwnLoads, members: Member[]): string {
  return JSON.stringify([
    m.raw.id, m.box, m.material ?? null, m.body, m.vertical, m.lying, m.pins, m.grain, m.face.thicknessAxis,
    m.supports.map((s) => [s.kind, s.by >= 0 ? members[s.by].raw.id : '', s.rect, s.y0, s.y1, s.pins ?? null]),
    m.joints,
    m.received.map((l) => [l.rect, l.y, l.F, l.from]),
    m.covers,
    m.layers.map((l) => [l.rect, members[l.index].material ?? null, members[l.index].grain, members[l.index].face.thickness]),
    m.lying ? (m.raw.cutouts ?? []) : [], m.raw.rotation, m.raw.width, m.raw.depth, m.raw.height,
    own
  ])
}

const solutionCache = new Map<string, Outcome>()

/** A cached solution, now the most recently used. */
function cached(key: string): Outcome | undefined {
  const hit = solutionCache.get(key)
  if (hit) { solutionCache.delete(key); solutionCache.set(key, hit) }
  return hit
}

/** Stores a solution, first dropping the least recently used quarter when full. */
function remember(key: string, outcome: Outcome): void {
  if (solutionCache.size >= MAX_CACHED) {
    let dropped = 0
    for (const old of solutionCache.keys()) {
      solutionCache.delete(old)
      if (++dropped >= MAX_CACHED / 4) break
    }
  }
  solutionCache.set(key, outcome)
}

function solveMember(m: Member, own: OwnLoads, members: Member[]): Outcome {
  const totalN = own.selfN + own.payloadN + own.placed.reduce((s, p) => s + p.F, 0) + m.received.reduce((s, l) => s + l.F, 0)
  if (!m.material || m.body) return { result: null, transfers: rigidTransfers(m, totalN, members) }
  const base = baseResult(m, 'ok', totalN, own)
  const loads = [
    { rect: footprint(m.box), F: own.selfN + own.payloadN },
    ...own.placed,
    ...m.received.map((l) => ({ rect: l.rect, F: l.F }))
  ]

  if (m.lying) {
    if (m.supports.some((s) => s.by < 0)) return { result: base, transfers: [] }
    const t = m.face.thickness
    if (m.box.x1 - m.box.x0 < MIN_SLENDERNESS * t && m.box.z1 - m.box.z0 < MIN_SLENDERNESS * t) {
      const transfers = rigidTransfers(m, totalN, members)
      return { result: { ...base, reactions: asReactions(transfers) }, transfers }
    }
    const fastened = m.supports.some((s) => s.kind === 'joint')
    if (!fastened && !isStable(m, loads, ['x', 'z'])) return { result: { ...base, status: 'unsupported' }, transfers: [] }
    const map = faceToWorld(m.raw)
    const cutouts = map ? (m.raw.cutouts ?? []).flatMap((c) => {
      const r = clip(faceRect(map, c.x, c.z, c.width, c.depth), m.box)
      return r ? [r] : []
    }) : []
    const fe = solveLying({
      box: m.box,
      material: m.longTerm!,
      grain: m.grain,
      cutouts,
      supports: m.supports,
      selfPressure: own.selfPressure,
      payloadN: own.payloadN,
      covers: m.covers,
      placed: own.placed,
      received: m.received,
      layers: m.layers.map((l) => {
        const k = members[l.index]
        return { rect: l.rect, D: plateRigidity(k.longTerm ?? m.longTerm!, k.grain, k.face.thickness) }
      })
    })
    return fe ? fromFe(m, fe, base, members) : { result: { ...base, status: 'unsupported' }, transfers: [] }
  }

  if (m.supports.length === 0) return { result: { ...base, status: m.vertical ? 'wallHung' : 'unsupported' }, transfers: [] }
  const along: HAxis = m.face.thicknessAxis === 'width' ? 'z' : 'x'
  // A rail on edge must rest stably on what holds it. A standing panel is not checked
  // for tipping in its plane: the carcass holds it (as in the previous model), so where
  // resting alone would let it tip, its base counts as fastened (supports pull too).
  const fastened = m.supports.some((s) => s.kind === 'joint')
  if (!m.vertical && !fastened && !isStable(m, loads, [along])) return { result: { ...base, status: 'unsupported' }, transfers: [] }
  // A payload set on a standing board (Board.loadKg) rests on its top edge
  const payload: EnteringLoad[] = own.payloadN > 0
    ? [{ rect: footprint(m.box), y: m.box.y1, F: own.payloadN, from: m.raw.id }]
    : []
  const input = {
    box: m.box,
    along,
    material: m.longTerm!,
    grain: m.grain,
    supports: m.supports,
    weight: own.selfPressure,
    received: [...m.received, ...payload],
    bucklingN: m.vertical ? totalN : null,
    bucklingGap: bucklingGap(m)
  }
  // a panel, or a board joined into a frame (a plinth glued to the frame members hanging on
  // it), is held down at its base by the carcass where resting alone would let it lift
  const fe = solveStanding(input) ?? (m.vertical || m.joints.length > 0 ? solveStanding({ ...input, fastened: true }) : null)
  return fe ? fromFe(m, fe, base, members) : { result: { ...base, status: 'unsupported' }, transfers: [] }
}

/**
 * A layer was first solved as resting on the board below (no bending). Once that board
 * is solved, the layer's share of their common moment and their common sag replace its
 * own result where they are worse.
 */
function layerResult(r: BoardStatic, k: Member, host: FeOutcome): BoardStatic {
  if (r.status === 'unsupported' || !k.material) return r
  const lf = layerField(r.field, { material: k.longTerm!, grain: k.grain, t: k.face.thickness }, host)
  if (!lf) return r
  const ownRatio = r.allowableDeflectionMm > 0 ? r.deflectionMm / (r.allowableDeflectionMm * DEFLECTION_WARNING_RATIO) : 0
  if (lf.uMax <= r.uMax && host.ratio <= ownRatio) return r
  let sagMax = 0
  for (let n = 0; n < lf.field.sag.length; n++) sagMax = Math.max(sagMax, lf.field.sag[n])
  const na = lf.field.a.length
  const at = (n: number) => ({ x: lf.field.a[n % na], y: k.box.y1, z: lf.field.b[Math.floor(n / na)] })
  return {
    ...r,
    model: 'plate',
    status: rateMember(lf.uMax, host.ratio, r.gammaM),
    field: lf.field,
    uMax: lf.uMax,
    maxAt: at(lf.uNode),
    maxLocal: { a: lf.field.a[lf.uNode % na] - k.box.x0, b: lf.field.b[Math.floor(lf.uNode / na)] - k.box.z0 },
    sagMax,
    spanMm: host.spanMm,
    cantilever: host.cantilever,
    deflectionMm: host.deflectionMm,
    allowableDeflectionMm: host.allowableMm,
    minThicknessMm: minBeamThickness(r.thicknessMm, lf.uMax, r.gammaM, host.deflectionMm, host.allowableMm)
  }
}

/** A result that is not a number (a degenerate board) is no rating: shown as without adequate support. */
function finite(r: BoardStatic): BoardStatic {
  if (Number.isFinite(r.uMax) && Number.isFinite(r.deflectionMm)) return r
  return { ...r, status: 'unsupported', uMax: 0, deflectionMm: 0, sagMax: 0, field: restingField(r.box, r.field.axes), minThicknessMm: null }
}

/** Runs the load simulation over `boards` (normally those of the visible assemblies). */
export function simulateStatics(boards: Board[], options: SimulationOptions): StaticSimulation {
  const t0 = performance.now()
  const members = boards.map((b, i) => buildMember(b, i, options))
  const indexById = new Map(members.map((m) => [m.raw.id, m.index]))
  findSupports(members)
  applyJoints(members, options.joints ?? [])
  const processed = new Array<boolean>(members.length).fill(false)
  const results = new Map<string, BoardStatic>()
  let solved = 0

  for (const i of processingOrder(members)) {
    const m = members[i]
    const own = ownLoads(m, Math.max(0, options.payloadKg))
    const key = memberKey(m, own, members)
    let outcome = cached(key)
    if (!outcome) {
      outcome = solveMember(m, own, members)
      solved++
      remember(key, outcome)
    }
    processed[i] = true
    if (outcome.result) results.set(m.raw.id, finite(outcome.result))
    if (outcome.fe) {
      for (const l of m.layers) {
        const k = members[l.index]
        const r = results.get(k.raw.id)
        if (r) results.set(k.raw.id, layerResult(r, k, outcome.fe))
      }
    }
    for (const t of outcome.transfers) {
      const to = indexById.get(t.toId)
      // a receiver already processed can only come from a broken cycle (see processingOrder)
      if (to !== undefined && !processed[to]) members[to].received.push({ ...t.load, from: m.raw.id })
    }
  }

  let critical = 0, warning = 0, unsupported = 0
  for (const r of results.values()) {
    if (r.status === 'critical') critical++
    else if (r.status === 'warning') warning++
    else if (r.status === 'unsupported') unsupported++
  }
  return { results, critical, warning, unsupported, durationMs: performance.now() - t0, solved }
}

/** Empties the solution cache and the remembered contact states (tests, benchmarks). */
export function clearStaticCache(): void {
  solutionCache.clear()
  clearContactMemo()
}
