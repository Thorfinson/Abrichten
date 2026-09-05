import type { MeasurementPoint } from '../types/measurement'
import type { Board, BoardCutout, Vec3 } from '../types/furniture'

// ── Joint geometry ────────────────────────────────────────────────────────────

/** Return the 6 face-center points of a board's AABB */
function boardFaceCenters(board: Board): Vec3[] {
  const cx = board.position.x + board.width / 2
  const cy = board.position.y + board.height / 2
  const cz = board.position.z + board.depth / 2
  const hw = board.width / 2
  const hh = board.height / 2
  const hd = board.depth / 2
  return [
    { x: cx - hw, y: cy, z: cz },
    { x: cx + hw, y: cy, z: cz },
    { x: cx, y: cy - hh, z: cz },
    { x: cx, y: cy + hh, z: cz },
    { x: cx, y: cy, z: cz - hd },
    { x: cx, y: cy, z: cz + hd },
  ]
}

function vec3Dist(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Compute a joint position between two boards:
 * midpoint of the closest pair of opposing face centers.
 */
export function computeJointPosition(boardA: Board, boardB: Board): Vec3 {
  const facesA = boardFaceCenters(boardA)
  const facesB = boardFaceCenters(boardB)
  let minDist = Infinity
  let bestA = facesA[0]
  let bestB = facesB[0]
  for (const fa of facesA) {
    for (const fb of facesB) {
      const d = vec3Dist(fa, fb)
      if (d < minDist) { minDist = d; bestA = fa; bestB = fb }
    }
  }
  return { x: (bestA.x + bestB.x) / 2, y: (bestA.y + bestB.y) / 2, z: (bestA.z + bestB.z) / 2 }
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
