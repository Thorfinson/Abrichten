import type { Board } from '../types/furniture'

export interface Rect2D {
  x: number
  y: number
  width: number
  height: number
  /** In-plane rotation in degrees for visual display */
  rotation: number
}

/**
 * 3D rotation matrix from Euler XYZ (degrees).
 * Returns a function that rotates a 3D point.
 */
function makeRotator(rx: number, ry: number, rz: number) {
  const ax = (rx * Math.PI) / 180
  const ay = (ry * Math.PI) / 180
  const az = (rz * Math.PI) / 180
  const cosX = Math.cos(ax), sinX = Math.sin(ax)
  const cosY = Math.cos(ay), sinY = Math.sin(ay)
  const cosZ = Math.cos(az), sinZ = Math.sin(az)
  // Combined XYZ rotation matrix
  return (x: number, y: number, z: number) => ({
    x: (cosY * cosZ) * x + (sinX * sinY * cosZ - cosX * sinZ) * y + (cosX * sinY * cosZ + sinX * sinZ) * z,
    y: (cosY * sinZ) * x + (sinX * sinY * sinZ + cosX * cosZ) * y + (cosX * sinY * sinZ - sinX * cosZ) * z,
    z: (-sinY) * x + (sinX * cosY) * y + (cosX * cosY) * z
  })
}

/**
 * Get the 8 corners of a board in world space (after full 3D rotation around center).
 */
export function boardCorners3D(board: Board): { x: number; y: number; z: number }[] {
  const hw = board.width / 2
  const hh = board.height / 2
  const hd = board.depth / 2
  const cx = board.position.x + hw
  const cy = board.position.y + hh
  const cz = board.position.z + hd
  const rot = makeRotator(board.rotation.x, board.rotation.y, board.rotation.z)

  const local = [
    { x: -hw, y: -hh, z: -hd },
    { x:  hw, y: -hh, z: -hd },
    { x:  hw, y:  hh, z: -hd },
    { x: -hw, y:  hh, z: -hd },
    { x: -hw, y: -hh, z:  hd },
    { x:  hw, y: -hh, z:  hd },
    { x:  hw, y:  hh, z:  hd },
    { x: -hw, y:  hh, z:  hd }
  ]

  return local.map((p) => {
    const r = rot(p.x, p.y, p.z)
    return { x: cx + r.x, y: cy + r.y, z: cz + r.z }
  })
}

/**
 * Project board corners to a 2D plane and compute AABB.
 * Used for collision detection (no in-plane rotation, pure bounding box).
 */
export function projectAABB(
  board: Board,
  getU: (p: { x: number; y: number; z: number }) => number,
  getV: (p: { x: number; y: number; z: number }) => number
): Rect2D {
  const corners = boardCorners3D(board)

  let minU = Infinity, maxU = -Infinity
  let minV = Infinity, maxV = -Infinity
  for (const c of corners) {
    const u = getU(c)
    const v = getV(c)
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }

  return { x: minU, y: minV, width: maxU - minU, height: maxV - minV, rotation: 0 }
}

export type BoardDim = 'width' | 'height' | 'depth'
export type PosAxis = 'x' | 'y' | 'z'

export interface DimensionMapping {
  /** Board dimension that maps to screen horizontal */
  horizontal: BoardDim
  /** Board dimension that maps to screen vertical */
  vertical: BoardDim
  /** World position axis for screen horizontal (for anchor offset) */
  horizontalPosAxis: PosAxis
  /** World position axis for screen vertical (for anchor offset) */
  verticalPosAxis: PosAxis
}

/**
 * Determine which board dimension (width/height/depth) maps to the
 * horizontal and vertical screen axes in a given projection.
 *
 * Uses a perturbation test: slightly increases each dimension and checks
 * which AABB axis grows the most.
 */
function computeDimensionMapping(
  board: Board,
  getU: (p: { x: number; y: number; z: number }) => number,
  getV: (p: { x: number; y: number; z: number }) => number,
  horizontalPosAxis: PosAxis,
  verticalPosAxis: PosAxis
): DimensionMapping {
  const dims: BoardDim[] = ['width', 'height', 'depth']
  const DELTA = 1 // 1mm perturbation

  // Get base full AABB (all rotations applied)
  const base = projectAABB(board, getU, getV)

  let bestH: BoardDim = 'width'
  let bestHDelta = 0
  let bestV: BoardDim = 'height'
  let bestVDelta = 0

  for (const dim of dims) {
    const testBoard = {
      ...board,
      [dim]: board[dim] + DELTA
    }
    const test = projectAABB(testBoard, getU, getV)
    const dw = test.width - base.width
    const dh = test.height - base.height

    if (dw > bestHDelta) {
      bestHDelta = dw
      bestH = dim
    }
    if (dh > bestVDelta) {
      bestVDelta = dh
      bestV = dim
    }
  }

  return { horizontal: bestH, vertical: bestV, horizontalPosAxis, verticalPosAxis }
}

export function dimensionMappingFront(board: Board): DimensionMapping {
  return computeDimensionMapping(board, (p) => p.x, (p) => p.y, 'x', 'y')
}

export function dimensionMappingSide(board: Board): DimensionMapping {
  return computeDimensionMapping(board, (p) => p.z, (p) => p.y, 'z', 'y')
}

export function dimensionMappingTop(board: Board): DimensionMapping {
  return computeDimensionMapping(board, (p) => p.x, (p) => p.z, 'x', 'z')
}

export type ResizeEdge = 'left' | 'right' | 'top' | 'bottom'

export interface ResizeResult {
  dim: BoardDim
  newDimValue: number
  position: { x: number; y: number; z: number }
}

/**
 * Compute the board update (dimension + position) for a resize operation.
 * Anchors the opposite edge: dragging 'left' keeps the right edge fixed, etc.
 *
 * Works by comparing the AABB before and after the dimension change
 * and adjusting the position so that the anchor edge doesn't move.
 */
export function computeResizeUpdate(
  board: Board,
  edge: ResizeEdge,
  deltaMm: number,
  dimMap: DimensionMapping,
  getU: (p: { x: number; y: number; z: number }) => number,
  getV: (p: { x: number; y: number; z: number }) => number
): ResizeResult {
  const isHorizontal = edge === 'left' || edge === 'right'
  const dim = isHorizontal ? dimMap.horizontal : dimMap.vertical
  const newDimValue = Math.max(3, Math.round(board[dim] + deltaMm))

  // Compute AABB before change
  const aabbBefore = projectAABB(board, getU, getV)

  // Build modified board with new dimension (same position)
  const modifiedBoard = { ...board, [dim]: newDimValue }
  const aabbAfter = projectAABB(modifiedBoard, getU, getV)

  // Determine which AABB edge to anchor
  // left: anchor right edge (maxU), right: anchor left edge (minU)
  // top: anchor bottom edge (minV), bottom: anchor top edge (maxV)
  let posOffset = { x: 0, y: 0, z: 0 }

  if (edge === 'left') {
    // Keep right edge (maxU) fixed: shift by difference in maxU
    const shift = aabbAfter.x + aabbAfter.width - (aabbBefore.x + aabbBefore.width)
    posOffset[dimMap.horizontalPosAxis] = -shift
  } else if (edge === 'right') {
    // Keep left edge (minU) fixed: shift by difference in minU
    const shift = aabbAfter.x - aabbBefore.x
    posOffset[dimMap.horizontalPosAxis] = -shift
  } else if (edge === 'top') {
    // Keep bottom edge (minV) fixed: shift by difference in minV
    const shift = aabbAfter.y - aabbBefore.y
    posOffset[dimMap.verticalPosAxis] = -shift
  } else {
    // bottom: Keep top edge (maxV) fixed: shift by difference in maxV
    const shift = aabbAfter.y + aabbAfter.height - (aabbBefore.y + aabbBefore.height)
    posOffset[dimMap.verticalPosAxis] = -shift
  }

  return {
    dim,
    newDimValue,
    position: {
      x: Math.round(board.position.x + posOffset.x),
      y: Math.round(board.position.y + posOffset.y),
      z: Math.round(board.position.z + posOffset.z)
    }
  }
}
