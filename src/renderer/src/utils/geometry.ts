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

/** Cutouts clipped to the board's width/depth plane; slivers under 1 mm are dropped.
 *  Single source of truth for mesh, DXF and any other consumer. */
export function clampCutouts(board: Board): BoardCutout[] {
  return (board.cutouts ?? []).flatMap((c) => {
    const x0 = Math.max(0, c.x)
    const z0 = Math.max(0, c.z)
    const x1 = Math.min(board.width, c.x + c.width)
    const z1 = Math.min(board.depth, c.z + c.depth)
    return x1 - x0 >= 1 && z1 - z0 >= 1
      ? [{ ...c, x: x0, z: z0, width: x1 - x0, depth: z1 - z0 }]
      : []
  })
}

/** A clamped cutout that reaches the board edge is a notch (Ausklinkung), not a hole. */
export function isNotch(board: Board, c: BoardCutout): boolean {
  return c.x <= 0 || c.z <= 0 || c.x + c.width >= board.width || c.z + c.depth >= board.depth
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

/** True when the box lies inside one of the board's cutouts (unrotated boards only). */
export function insideCutout(board: Board, box: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  const r = board.rotation
  if (r.x !== 0 || r.y !== 0 || r.z !== 0) return false   // ponytail: rotated boards keep the plain box test
  const x0 = box.minX - board.position.x
  const x1 = box.maxX - board.position.x
  const z0 = box.minZ - board.position.z
  const z1 = box.maxZ - board.position.z
  return clampCutouts(board).some((c) => x0 >= c.x && x1 <= c.x + c.width && z0 >= c.z && z1 <= c.z + c.depth)
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
