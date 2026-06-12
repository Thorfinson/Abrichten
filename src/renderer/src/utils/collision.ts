import type { Board } from '../types/furniture'
import { boardCorners3D, projectAABB, type Rect2D } from './projection'

export interface CollisionPair {
  boardIdA: string
  boardIdB: string
  overlapRect: Rect2D
}

export interface AABB3D {
  minX: number; maxX: number
  minY: number; maxY: number
  minZ: number; maxZ: number
}

type Vec3 = { x: number; y: number; z: number }

// ---------------------------------------------------------------------------
// Oriented Bounding Box (OBB)
// ---------------------------------------------------------------------------

interface OBB {
  center: Vec3
  halfExtents: Vec3                      // half-widths along each local axis
  axes: [Vec3, Vec3, Vec3]               // local X/Y/Z axes in world space
}

/**
 * Build an OBB from a board.
 * Derives the local world-space axes from the rotated corner differences so
 * no separate rotation-matrix export is needed.
 */
function boardToOBB(board: Board): OBB {
  const hw = board.width / 2
  const hh = board.height / 2
  const hd = board.depth / 2

  const corners = boardCorners3D(board)
  const c0 = corners[0]

  // corners[1] - corners[0] = rotated local-X scaled by 2*hw → divide to normalise
  // corners[3] - corners[0] = rotated local-Y scaled by 2*hh
  // corners[4] - corners[0] = rotated local-Z scaled by 2*hd
  const axisX: Vec3 = {
    x: (corners[1].x - c0.x) / (2 * hw),
    y: (corners[1].y - c0.y) / (2 * hw),
    z: (corners[1].z - c0.z) / (2 * hw)
  }
  const axisY: Vec3 = {
    x: (corners[3].x - c0.x) / (2 * hh),
    y: (corners[3].y - c0.y) / (2 * hh),
    z: (corners[3].z - c0.z) / (2 * hh)
  }
  const axisZ: Vec3 = {
    x: (corners[4].x - c0.x) / (2 * hd),
    y: (corners[4].y - c0.y) / (2 * hd),
    z: (corners[4].z - c0.z) / (2 * hd)
  }

  return {
    center: {
      x: board.position.x + hw,
      y: board.position.y + hh,
      z: board.position.z + hd
    },
    halfExtents: { x: hw, y: hh, z: hd },
    axes: [axisX, axisY, axisZ]
  }
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }
}

/** Project an OBB's support radius onto a (unit) axis. */
function obbSupportRadius(obb: OBB, axis: Vec3): number {
  return (
    obb.halfExtents.x * Math.abs(dot3(obb.axes[0], axis)) +
    obb.halfExtents.y * Math.abs(dot3(obb.axes[1], axis)) +
    obb.halfExtents.z * Math.abs(dot3(obb.axes[2], axis))
  )
}

/**
 * Separating Axis Theorem (SAT) OBB–OBB overlap test.
 * Tests 15 potential separating axes:
 *   – 3 face normals of A
 *   – 3 face normals of B
 *   – 9 cross-products of edge pairs (A.xi × B.xj)
 * Returns true when the boxes overlap, false when a separating axis exists.
 */
function satOBBOverlap(a: OBB, b: OBB): boolean {
  const d: Vec3 = {
    x: b.center.x - a.center.x,
    y: b.center.y - a.center.y,
    z: b.center.z - a.center.z
  }

  const axes: Vec3[] = [
    a.axes[0], a.axes[1], a.axes[2],
    b.axes[0], b.axes[1], b.axes[2],
    cross3(a.axes[0], b.axes[0]),
    cross3(a.axes[0], b.axes[1]),
    cross3(a.axes[0], b.axes[2]),
    cross3(a.axes[1], b.axes[0]),
    cross3(a.axes[1], b.axes[1]),
    cross3(a.axes[1], b.axes[2]),
    cross3(a.axes[2], b.axes[0]),
    cross3(a.axes[2], b.axes[1]),
    cross3(a.axes[2], b.axes[2])
  ]

  for (const axis of axes) {
    const lenSq = axis.x * axis.x + axis.y * axis.y + axis.z * axis.z
    if (lenSq < 1e-10) continue // degenerate cross-product (parallel edges) — skip

    const len = Math.sqrt(lenSq)
    const norm: Vec3 = { x: axis.x / len, y: axis.y / len, z: axis.z / len }

    const dist = Math.abs(dot3(d, norm))
    const rA = obbSupportRadius(a, norm)
    const rB = obbSupportRadius(b, norm)

    if (dist > rA + rB) return false // separating axis found
  }

  return true // no separating axis — boxes overlap
}

// ---------------------------------------------------------------------------
// AABB helpers (kept for broad-phase and visual display)
// ---------------------------------------------------------------------------

/**
 * Compute the 3D axis-aligned bounding box from a board's rotated corners.
 * Exported so CollisionOverlay3D can reuse it for the visual overlap box.
 */
export function board3DAABB(board: Board): AABB3D {
  const corners = boardCorners3D(board)
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const c of corners) {
    if (c.x < minX) minX = c.x
    if (c.x > maxX) maxX = c.x
    if (c.y < minY) minY = c.y
    if (c.y > maxY) maxY = c.y
    if (c.z < minZ) minZ = c.z
    if (c.z > maxZ) maxZ = c.z
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

/**
 * Test if two axis-aligned 2D rectangles overlap.
 * Returns the intersection rectangle or null.
 */
export function rectsOverlap(a: Rect2D, b: Rect2D): Rect2D | null {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height

  const overlapX = Math.max(a.x, b.x)
  const overlapY = Math.max(a.y, b.y)
  const overlapX2 = Math.min(ax2, bx2)
  const overlapY2 = Math.min(ay2, by2)

  if (overlapX >= overlapX2 || overlapY >= overlapY2) return null

  return {
    x: overlapX,
    y: overlapY,
    width: overlapX2 - overlapX,
    height: overlapY2 - overlapY,
    rotation: 0
  }
}

// ---------------------------------------------------------------------------
// Collision detection (shared algorithm)
// ---------------------------------------------------------------------------

type PlaneGetter = (p: Vec3) => number

/** Pre-computed per-board data for the detection loop. */
interface BoardEntry {
  board: Board
  aabb: AABB3D
  obb: OBB
}

/**
 * Build sorted board entries for sweep-and-prune.
 * Sorted by AABB minX so the inner loop can break early.
 */
function buildSorted(boards: Board[]): BoardEntry[] {
  return boards
    .map((board) => ({
      board,
      aabb: board3DAABB(board),
      obb: boardToOBB(board)
    }))
    .sort((a, b) => a.aabb.minX - b.aabb.minX)
}

/**
 * Detect all colliding board pairs using sweep-and-prune + SAT OBB.
 *
 * Algorithm:
 *   1. Sort boards by AABB minX — O(n log n).
 *   2. For each board i, advance j only while j.minX < i.maxX (sweep prune on X).
 *   3. Quick Y/Z AABB reject for remaining candidates.
 *   4. SAT narrow phase on Oriented Bounding Boxes — eliminates rotation false positives.
 *
 * Complexity: O(n log n + k) average, O(n²) worst case (all overlapping in X).
 *
 * @param boards  Boards with their pre-projected 2D rect (rect unused internally now)
 * @param getU    Maps a 3D point to the view's horizontal screen coordinate
 * @param getV    Maps a 3D point to the view's vertical screen coordinate
 */
export function detectCollisions(
  boards: { board: Board; rect: Rect2D }[],
  getU: PlaneGetter,
  getV: PlaneGetter
): CollisionPair[] {
  if (boards.length < 2) return []

  const sorted = buildSorted(boards.map((b) => b.board))
  const collisions: CollisionPair[] = []

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]

      // Sweep-and-prune: once b starts past a on X, no further overlaps possible
      if (b.aabb.minX >= a.aabb.maxX) break

      // AABB pre-filter on Y and Z
      if (b.aabb.minY >= a.aabb.maxY || b.aabb.maxY <= a.aabb.minY) continue
      if (b.aabb.minZ >= a.aabb.maxZ || b.aabb.maxZ <= a.aabb.minZ) continue

      // SAT narrow phase — accurate for rotated boards
      if (!satOBBOverlap(a.obb, b.obb)) continue

      // 2D overlap rect for visual display
      const rectA = projectAABB(a.board, getU, getV)
      const rectB = projectAABB(b.board, getU, getV)
      const overlap = rectsOverlap(rectA, rectB)
      if (overlap) {
        collisions.push({ boardIdA: a.board.id, boardIdB: b.board.id, overlapRect: overlap })
      }
    }
  }

  return collisions
}

/**
 * Detect 3D collisions and return AABB overlap volumes for visual rendering.
 * Used by CollisionOverlay3D — replaces its private duplicated implementation.
 *
 * Same sweep-and-prune + SAT algorithm as detectCollisions().
 */
export function detectCollisions3D(
  boards: Board[]
): { boardIdA: string; boardIdB: string; overlapAABB: AABB3D }[] {
  if (boards.length < 2) return []

  const sorted = buildSorted(boards)
  const results: { boardIdA: string; boardIdB: string; overlapAABB: AABB3D }[] = []

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]

      if (b.aabb.minX >= a.aabb.maxX) break

      if (b.aabb.minY >= a.aabb.maxY || b.aabb.maxY <= a.aabb.minY) continue
      if (b.aabb.minZ >= a.aabb.maxZ || b.aabb.maxZ <= a.aabb.minZ) continue

      if (!satOBBOverlap(a.obb, b.obb)) continue

      // AABB intersection as visual overlap box approximation
      results.push({
        boardIdA: a.board.id,
        boardIdB: b.board.id,
        overlapAABB: {
          minX: Math.max(a.aabb.minX, b.aabb.minX),
          maxX: Math.min(a.aabb.maxX, b.aabb.maxX),
          minY: Math.max(a.aabb.minY, b.aabb.minY),
          maxY: Math.min(a.aabb.maxY, b.aabb.maxY),
          minZ: Math.max(a.aabb.minZ, b.aabb.minZ),
          maxZ: Math.min(a.aabb.maxZ, b.aabb.maxZ)
        }
      })
    }
  }

  return results
}
