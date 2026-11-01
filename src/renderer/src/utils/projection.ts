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
  // Three.js Euler order 'XYZ' (R = Rx * Ry * Rz), identical to <mesh rotation={[x,y,z]}>
  // in Board3D. The previous Rz*Ry*Rx composition disagreed for multi-axis rotations,
  // so collision / dimension overlays drifted from what was rendered.
  return (x: number, y: number, z: number) => ({
    x: (cosY * cosZ) * x - (cosY * sinZ) * y + sinY * z,
    y: (cosX * sinZ + sinX * cosZ * sinY) * x + (cosX * cosZ - sinX * sinZ * sinY) * y - (sinX * cosY) * z,
    z: (sinX * sinZ - cosX * cosZ * sinY) * x + (sinX * cosZ + cosX * sinZ * sinY) * y + (cosX * cosY) * z
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
type PosAxis = 'x' | 'y' | 'z'
type Vec3 = { x: number; y: number; z: number }

/** World axis that a board dimension spans before rotation (position + dims/2 is the centre). */
const DIM_AXIS: Record<BoardDim, PosAxis> = { width: 'x', height: 'y', depth: 'z' }

/** Rotation noise such as cos(90°) = 6e-17 is snapped to the exact value. */
const snapUnit = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v)

/** World-space unit vector of a board dimension's local axis. */
export function dimDirection(board: Board, dim: BoardDim): Vec3 {
  const local = { x: 0, y: 0, z: 0 }
  local[DIM_AXIS[dim]] = 1
  const r = makeRotator(board.rotation.x, board.rotation.y, board.rotation.z)(local.x, local.y, local.z)
  return { x: snapUnit(r.x), y: snapUnit(r.y), z: snapUnit(r.z) }
}

const WORLD_DIM: Record<PosAxis, BoardDim> = { x: 'width', y: 'height', z: 'depth' }

/**
 * The board's rotated bounding box as an unrotated board (same id, material, …), so
 * world-axis rules such as the static check see a turned shelf as lying and a turned
 * panel as standing. Exact for multiples of 90°, the bounding box otherwise; the grain
 * direction turns with the board.
 */
export function worldAligned(board: Board): Board {
  const { x, y, z } = board.rotation
  if (!x && !y && !z) return board
  const corners = boardCorners3D(board)
  const low = (k: PosAxis): number => Math.min(...corners.map((c) => c[k]))
  const size = (k: PosAxis): number => Math.max(...corners.map((c) => c[k])) - low(k)
  let grainDirection = board.grainDirection
  if (grainDirection) {
    const d = dimDirection(board, grainDirection)
    grainDirection = WORLD_DIM[(['x', 'y', 'z'] as const).reduce((a, k) => (Math.abs(d[k]) > Math.abs(d[a]) ? k : a))]
  }
  return {
    ...board,
    position: { x: low('x'), y: low('y'), z: low('z') },
    width: size('x'),
    height: size('y'),
    depth: size('z'),
    rotation: { x: 0, y: 0, z: 0 },
    grainDirection
  }
}

/** World centre of the board face on the `sign` side of dimension `dim` (rotated boards too). */
export function faceCentre(board: Board, dim: BoardDim, sign: 1 | -1): Vec3 {
  const d = dimDirection(board, dim)
  const k = (sign * board[dim]) / 2
  return {
    x: board.position.x + board.width / 2 + d.x * k,
    y: board.position.y + board.height / 2 + d.y * k,
    z: board.position.z + board.depth / 2 + d.z * k
  }
}

/**
 * New position when the face on the `sign` side of `dim` is moved so that the board
 * gets `newDim`, while the opposite face stays put — for rotated boards too.
 *
 * `position` is the world-axis min corner of the unrotated box, so the centre is
 * position + dims/2 and the board rotates about it. Changing one dimension by Δ
 * moves the centre by Δ/2 along that dimension's rotated direction. The position
 * is not rounded: rounding would shift the anchored face of a rotated board.
 */
export function resizeFromFace(board: Board, dim: BoardDim, sign: 1 | -1, newDim: number): Vec3 {
  const grow = newDim - board[dim]
  const d = dimDirection(board, dim)
  const shift = (axis: PosAxis): number => (sign * d[axis] - (DIM_AXIS[dim] === axis ? 1 : 0)) * (grow / 2)
  return {
    x: board.position.x + shift('x'),
    y: board.position.y + shift('y'),
    z: board.position.z + shift('z')
  }
}
