import type { MeasurementPoint } from '../types/measurement'
import type { Board, BoardCutout, GrainDirection, Vec3 } from '../types/furniture'
import { boardCorners3D } from './projection'
import { boardFace, type BoardAxis } from './boardFace'

// ── Joint geometry ────────────────────────────────────────────────────────────

/**
 * Joint position between two boards: centre of the region where they touch,
 * i.e. per axis the middle of the overlap of their (rotated) bounding boxes.
 * Where the boxes don't overlap on an axis, that is the middle of the gap.
 * A shelf at y 300–318 against a side panel gives y = 309.
 */
export function computeJointPosition(boardA: Board, boardB: Board): Vec3 {
  const bounds = (b: Board, axis: 'x' | 'y' | 'z'): [number, number] => {
    const v = boardCorners3D(b).map((c) => c[axis])
    return [Math.min(...v), Math.max(...v)]
  }
  const mid = (axis: 'x' | 'y' | 'z'): number => {
    const [aMin, aMax] = bounds(boardA, axis)
    const [bMin, bMax] = bounds(boardB, axis)
    return (Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2
  }
  return { x: mid('x'), y: mid('y'), z: mid('z') }
}

// Board dimension along world x, y, z (unrotated boards, like the groove overlay)
const WORLD_AXES: BoardAxis[] = ['width', 'height', 'depth']
const lowAt = (b: Board, i: number): number => [b.position.x, b.position.y, b.position.z][i]
const highAt = (b: Board, i: number): number => lowAt(b, i) + b[WORLD_AXES[i]]

/**
 * Groove of a dado/rabbet joint: cut into the host (boardA) from the face towards
 * the let-in board (boardB). Depth runs along A's thickness (35 % of it, max 14 mm),
 * width along B's thickness centred on the joint, length over the boards' overlap.
 * Returns centre and size as [x, y, z] in world mm.
 */
export function grooveBox(jointPos: Vec3, boardA: Board, boardB: Board): { centre: number[]; size: number[] } {
  const iA = WORLD_AXES.indexOf(boardFace(boardA).thicknessAxis)
  const iB = WORLD_AXES.indexOf(boardFace(boardB).thicknessAxis)
  const iW = iB !== iA ? iB : (iA + 1) % 3
  const iL = 3 - iA - iW
  const depth = Math.min(boardA[WORLD_AXES[iA]] * 0.35, 14)
  const towardsB = lowAt(boardB, iA) + highAt(boardB, iA) >= lowAt(boardA, iA) + highAt(boardA, iA)
  const lenLow = Math.max(lowAt(boardA, iL), lowAt(boardB, iL))
  const lenHigh = Math.min(highAt(boardA, iL), highAt(boardB, iL))

  const centre = [0, 0, 0]
  const size = [0, 0, 0]
  centre[iA] = towardsB ? highAt(boardA, iA) - depth / 2 : lowAt(boardA, iA) + depth / 2
  size[iA] = depth + 0.5
  centre[iW] = [jointPos.x, jointPos.y, jointPos.z][iW]
  size[iW] = boardB[WORLD_AXES[iW]]
  centre[iL] = (lenLow + lenHigh) / 2
  size[iL] = Math.max(lenHigh - lenLow, 1) + 1
  return { centre, size }
}

/** Euclidean distance between two 2D points (in mm on the canvas) */
export function distance(a: MeasurementPoint, b: MeasurementPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Angle at point B formed by rays BA and BC, in degrees */
export function angleBetween(
  a: MeasurementPoint,
  b: MeasurementPoint,
  c: MeasurementPoint
): number {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const dot = ba.x * bc.x + ba.y * bc.y
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y)
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y)
  if (magBA === 0 || magBC === 0) return 0
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
  return (Math.acos(cosAngle) * 180) / Math.PI
}

/** Snap a value to the nearest grid position */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

/** Rotate a point (px, py) around a center (cx, cy) by angleDeg degrees */
export function rotatePoint(
  px: number, py: number,
  cx: number, cy: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = px - cx
  const dy = py - cy
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos
  }
}

/** Area of a polygon defined by points, using the shoelace formula (returns mm²) */
export function polygonArea(points: MeasurementPoint[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

/** A stored cutout on the face, measured from the face's min corner (its x/z may be
 *  stored from the far edges, BoardCutout.uFrom/vFrom). */
export function faceCutout(board: Board, c: BoardCutout): BoardCutout {
  const face = boardFace(board)
  const depth = c.shape === 'circle' ? c.width : c.depth
  return {
    ...c,
    depth,
    x: c.uFrom === 'max' ? face.u - c.x - c.width : c.x,
    z: c.vFrom === 'max' ? face.v - c.z - depth : c.z
  }
}

/** What is wrong with a cutout, or null: off the face, a cut through the whole board, or
 *  overlapping or touching an earlier cutout of the board (not built), or reaching past the
 *  board's edge (built, cut back to the edge — e.g. after the board got smaller while the
 *  cutout is measured from the other edge). */
export type CutoutProblem = 'outside' | 'splits' | 'overlaps' | 'beyond'
const notBuilt = (p: CutoutProblem | null): boolean => p === 'outside' || p === 'splits' || p === 'overlaps'
/** Cutouts closer than this (mm) touch: they would leave a sliver or one open shape */
const TOUCH_MM = 1

/** The problem of one cutout on its own (not looking at the board's other cutouts). */
export function cutoutProblem(board: Board, raw: BoardCutout): CutoutProblem | null {
  const face = boardFace(board)
  const c = faceCutout(board, raw)
  if (c.shape === 'circle') {
    return c.width >= 1 && c.x >= 0 && c.z >= 0 && c.x + c.width <= face.u && c.z + c.width <= face.v ? null : 'outside'
  }
  const x0 = Math.max(0, c.x), z0 = Math.max(0, c.z)
  const x1 = Math.min(face.u, c.x + c.width), z1 = Math.min(face.v, c.z + c.depth)
  if (x1 - x0 < 1 || z1 - z0 < 1) return 'outside'
  // across the whole face one way: the board would fall in two (or vanish)
  if ((x0 <= 0 && x1 >= face.u) || (z0 <= 0 && z1 >= face.v)) return 'splits'
  return c.x < 0 || c.z < 0 || c.x + c.width > face.u || c.z + c.depth > face.v ? 'beyond' : null
}

/** A cutout on the face as it is built: from the min corner, a rectangle clipped to the face. */
function builtShape(board: Board, raw: BoardCutout): BoardCutout {
  const face = boardFace(board)
  const c = faceCutout(board, raw)
  if (c.shape === 'circle') return c
  const x0 = Math.max(0, c.x), z0 = Math.max(0, c.z)
  const x1 = Math.min(face.u, c.x + c.width), z1 = Math.min(face.v, c.z + c.depth)
  return { ...c, x: x0, z: z0, width: x1 - x0, depth: z1 - z0 }
}

/** Two built cutouts overlap or touch (closer than TOUCH_MM). */
export function cutoutsTouch(a: BoardCutout, b: BoardCutout): boolean {
  const round = (c: BoardCutout): boolean => c.shape === 'circle'
  if (round(a) && round(b)) {
    const ra = a.width / 2, rb = b.width / 2
    return Math.hypot(a.x + ra - (b.x + rb), a.z + ra - (b.z + rb)) < ra + rb + TOUCH_MM
  }
  if (round(a) || round(b)) {
    const [c, r] = round(a) ? [a, b] : [b, a]
    const rad = c.width / 2, cx = c.x + rad, cz = c.z + rad
    const nx = Math.min(Math.max(cx, r.x), r.x + r.width), nz = Math.min(Math.max(cz, r.z), r.z + r.depth)
    return Math.hypot(cx - nx, cz - nz) < rad + TOUCH_MM
  }
  return a.x < b.x + b.width + TOUCH_MM && b.x < a.x + a.width + TOUCH_MM && a.z < b.z + b.depth + TOUCH_MM && b.z < a.z + a.depth + TOUCH_MM
}

/** The problem of each of the board's cutouts, in list order: its own, or that it overlaps or
 *  touches an earlier one that is built (`other`: that one's number). */
export function cutoutProblems(board: Board): { problem: CutoutProblem | null; other?: number }[] {
  const built: { n: number; c: BoardCutout }[] = []
  return (board.cutouts ?? []).map((raw, i) => {
    const own = cutoutProblem(board, raw)
    if (notBuilt(own)) return { problem: own }
    const c = builtShape(board, raw)
    const hit = built.find((b) => cutoutsTouch(b.c, c))
    if (hit) return { problem: 'overlaps', other: hit.n }
    built.push({ n: i + 1, c })
    return { problem: own }
  })
}

/** The cutouts that can be built, on the face from its min corner, with their number in the
 *  board's list (1, 2 …, kept when one in between cannot be built). Single source for mesh,
 *  DXF, collisions, statics, lists and drawings. */
export function numberedCutouts(board: Board): { n: number; cut: BoardCutout }[] {
  const problems = cutoutProblems(board)
  return (board.cutouts ?? []).flatMap((raw, i) => (notBuilt(problems[i].problem) ? [] : [{ n: i + 1, cut: builtShape(board, raw) }]))
}

/** The cutouts that can be built, clipped to the face, measured from its min corner. */
export function clampCutouts(board: Board): BoardCutout[] {
  return numberedCutouts(board).map((e) => e.cut)
}

/** A clamped rectangle that reaches the edge of the face is a notch (Ausklinkung), not a hole. */
export function isNotch(board: Board, c: BoardCutout): boolean {
  if (c.shape === 'circle') return false
  const face = boardFace(board)
  return c.x <= 0 || c.z <= 0 || c.x + c.width >= face.u || c.z + c.depth >= face.v
}

/**
 * Outline of a width × depth rectangle minus edge notches, counter-clockwise in the
 * (x, z) plane, collinear points merged.
 * ponytail: traces one loop; notches that split the board or meet only at a corner
 * point are not handled (no real board needs that).
 */
export function notchedOutline(width: number, depth: number, notches: BoardCutout[]): [number, number][] {
  const xs = [...new Set([0, width, ...notches.flatMap((c) => [c.x, c.x + c.width])])].sort((a, b) => a - b)
  const zs = [...new Set([0, depth, ...notches.flatMap((c) => [c.z, c.z + c.depth])])].sort((a, b) => a - b)
  const solid = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= zs.length - 1) return false
    const cx = (xs[i] + xs[i + 1]) / 2
    const cz = (zs[j] + zs[j + 1]) / 2
    return !notches.some((c) => cx > c.x && cx < c.x + c.width && cz > c.z && cz < c.z + c.depth)
  }
  // boundary edges of the solid grid cells, each mapped start → end
  const next = new Map<string, [number, number]>()
  const key = ([x, z]: [number, number]): string => `${x},${z}`
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      if (!solid(i, j)) continue
      const [x0, x1, z0, z1] = [xs[i], xs[i + 1], zs[j], zs[j + 1]]
      if (!solid(i, j - 1)) next.set(key([x0, z0]), [x1, z0])
      if (!solid(i + 1, j)) next.set(key([x1, z0]), [x1, z1])
      if (!solid(i, j + 1)) next.set(key([x1, z1]), [x0, z1])
      if (!solid(i - 1, j)) next.set(key([x0, z1]), [x0, z0])
    }
  }
  const start = next.values().next().value
  if (!start) return []
  const loop: [number, number][] = []
  for (let p = start; loop.length <= next.size; ) {
    loop.push(p)
    const q = next.get(key(p))
    if (!q || key(q) === key(start)) break
    p = q
  }
  return loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length]
    const b = loop[(i + 1) % loop.length]
    return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]))
  })
}


// ── Drawer box ────────────────────────────────────────────────────────────────

/** Drawer sides, front and back */
export const DRAWER_WALL_MM = 16
/** Drawer bottom: 16 mm, set in between the four walls (glued and screwed, no groove) */
export const DRAWER_BOTTOM_MM = 16

export interface DrawerPart {
  key: 'sideLeft' | 'sideRight' | 'front' | 'back' | 'bottom'
  width: number
  height: number
  depth: number
  position: Vec3
  grainDirection: GrainDirection
}

/**
 * Parts of a drawer box with the outer size width × height × depth (mm) and its
 * min corner at `origin`: the sides run the full depth, back (low z, wall side) and
 * front (high z, towards the front view like every project) sit between them, the
 * bottom between all four walls, flush with their lower edges.
 * The parts touch but never overlap. Null when the box is too small for its walls.
 */
export function drawerBoxParts(width: number, height: number, depth: number, origin: Vec3): DrawerPart[] | null {
  const t = DRAWER_WALL_MM
  const innerWidth = width - 2 * t
  const innerDepth = depth - 2 * t
  if (!(innerWidth >= 1 && innerDepth >= 1 && height >= DRAWER_BOTTOM_MM + 1)) return null
  const at = (x: number, y: number, z: number): Vec3 => ({ x: origin.x + x, y: origin.y + y, z: origin.z + z })
  return [
    { key: 'sideLeft', width: t, height, depth, position: at(0, 0, 0), grainDirection: 'depth' },
    { key: 'sideRight', width: t, height, depth, position: at(width - t, 0, 0), grainDirection: 'depth' },
    { key: 'front', width: innerWidth, height, depth: t, position: at(t, 0, depth - t), grainDirection: 'width' },
    { key: 'back', width: innerWidth, height, depth: t, position: at(t, 0, 0), grainDirection: 'width' },
    { key: 'bottom', width: innerWidth, height: DRAWER_BOTTOM_MM, depth: innerDepth, position: at(t, 0, t), grainDirection: 'width' }
  ]
}
