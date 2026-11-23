import type { Board, BoardCutout } from '../types/furniture'
import { boardFace, type BoardAxis } from './boardFace'
import { dimDirection } from './projection'
import { clampCutouts, faceCutout, isNotch } from './geometry'

/**
 * Where a cutout sits — in ONE reference system, the room: x from the left wall, y from
 * the floor, z from the back wall (as the app has always counted). A cutout is stored on
 * the board's face (types BoardCutout, utils/boardFace) so it travels with the board;
 * everything said about it — the names of the edges it is measured from, its extent in
 * the room — is read from the room through the board's position and rotation, here and
 * nowhere else.
 */
export type RoomAxis = 'x' | 'y' | 'z'
/** The room's names for the two ends of each axis */
export type EdgeName = 'left' | 'right' | 'bottom' | 'top' | 'back' | 'front'
const ROOM_ENDS: Record<RoomAxis, [EdgeName, EdgeName]> = { x: ['left', 'right'], y: ['bottom', 'top'], z: ['back', 'front'] }

export interface FaceAxisInRoom {
  /** The board dimension the face axis runs along */
  dim: BoardAxis
  /** Its length on the face (mm) */
  length: number
  /** The room axis it runs along (boards turned in 90° steps) */
  room: RoomAxis
  /** The room's name for the face's edge at 0 and at `length` */
  minEdge: EdgeName
  maxEdge: EdgeName
}

function roomAxisOf(board: Board, dim: BoardAxis): { room: RoomAxis; sign: 1 | -1 } {
  const d = dimDirection(board, dim)
  const comps: [RoomAxis, number][] = [['x', d.x], ['y', d.y], ['z', d.z]]
  const [room, v] = comps.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a))
  return { room, sign: v < 0 ? -1 : 1 }
}

/** The two face axes of a board (u, v) in the room: which way they run, how their edges are called. */
export function faceAxesInRoom(board: Board): { u: FaceAxisInRoom; v: FaceAxisInRoom } {
  const face = boardFace(board)
  const axis = (dim: BoardAxis, length: number): FaceAxisInRoom => {
    const { room, sign } = roomAxisOf(board, dim)
    const [lo, hi] = ROOM_ENDS[room]
    return { dim, length, room, minEdge: sign > 0 ? lo : hi, maxEdge: sign > 0 ? hi : lo }
  }
  return { u: axis(face.uAxis, face.u), v: axis(face.vAxis, face.v) }
}

/** A cutout's extent in the room along each axis (mm), through the board's thickness. */
export function cutoutInRoom(board: Board, c: BoardCutout): Record<RoomAxis, [number, number]> {
  const face = boardFace(board)
  const half = { width: board.width / 2, height: board.height / 2, depth: board.depth / 2 }
  const centre = { x: board.position.x + half.width, y: board.position.y + half.height, z: board.position.z + half.depth }
  // the cutout's box in the board's own frame (centred like the mesh)
  const local: Record<BoardAxis, [number, number]> = { width: [-half.width, half.width], height: [-half.height, half.height], depth: [-half.depth, half.depth] }
  local[face.uAxis] = [c.x - face.u / 2, c.x + c.width - face.u / 2]
  local[face.vAxis] = [c.z - face.v / 2, c.z + c.depth - face.v / 2]
  const out: Record<RoomAxis, [number, number]> = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] }
  const dirs = { width: dimDirection(board, 'width'), height: dimDirection(board, 'height'), depth: dimDirection(board, 'depth') }
  for (const a of local.width) for (const b of local.height) for (const d of local.depth) {
    for (const r of ['x', 'y', 'z'] as RoomAxis[]) {
      const p = centre[r] + a * dirs.width[r] + b * dirs.height[r] + d * dirs.depth[r]
      out[r] = [Math.min(out[r][0], p), Math.max(out[r][1], p)]
    }
  }
  return out
}

/** True when the box lies inside one of the board's cutouts (a round hole counts as its square). */
export function insideCutout(board: Board, box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }): boolean {
  // only boards turned in 90° steps: otherwise the room box around a cutout is too generous
  const r = board.rotation
  if ([r.x, r.y, r.z].some((a) => Math.abs(a % 90) > 1e-6)) return false
  const { u, v } = faceAxesInRoom(board)
  const range = (r: RoomAxis): [number, number] => (r === 'x' ? [box.minX, box.maxX] : r === 'y' ? [box.minY, box.maxY] : [box.minZ, box.maxZ])
  return clampCutouts(board).some((c) => {
    const room = cutoutInRoom(board, c)
    return [u.room, v.room].every((r) => range(r)[0] >= room[r][0] - 0.01 && range(r)[1] <= room[r][1] + 0.01)
  })
}

/** How a cutout is placed for people: its distance from one named edge along each face axis. */
export interface EdgePlacement {
  uFrom: 'min' | 'max'
  uDist: number
  vFrom: 'min' | 'max'
  vDist: number
}

/** The placement as people read it, for a cutout on the face (faceCutout / clampCutouts):
 *  from its own reference edges (Bezugskanten), else from the nearer edge along each axis
 *  (a notch: 0 from its edge). A round hole is placed by its centre, as it is drilled. */
export function placementOf(board: Board, c: BoardCutout): EdgePlacement {
  const face = boardFace(board)
  const round = (n: number): number => Math.round(n * 10) / 10
  const r = c.shape === 'circle' ? c.width / 2 : 0
  const uMax = face.u - c.x - c.width, vMax = face.v - c.z - c.depth
  const uFrom = c.uFrom ?? (uMax < c.x ? 'max' : 'min')
  const vFrom = c.vFrom ?? (vMax < c.z ? 'max' : 'min')
  return { uFrom, uDist: round((uFrom === 'min' ? c.x : uMax) + r), vFrom, vDist: round((vFrom === 'min' ? c.z : vMax) + r) }
}

/** A stored cutout placed by distances from named edges (a round hole: to its centre): what
 *  BoardCutout keeps, so the place holds from those edges when the board changes size. */
export function storedPlacement(c: Pick<BoardCutout, 'shape' | 'width'>, p: EdgePlacement): Pick<BoardCutout, 'x' | 'z' | 'uFrom' | 'vFrom'> {
  const r = c.shape === 'circle' ? c.width / 2 : 0
  return { x: p.uDist - r, z: p.vDist - r, uFrom: p.uFrom, vFrom: p.vFrom }
}

/** The same place seen from the other edge along one axis (the cutout does not move). */
export function switchEdge(board: Board, raw: BoardCutout, axis: 'u' | 'v'): EdgePlacement {
  const c = faceCutout(board, raw)
  const p = placementOf(board, c)
  const face = boardFace(board)
  const r = c.shape === 'circle' ? c.width / 2 : 0
  if (axis === 'u') {
    const uFrom = p.uFrom === 'min' ? 'max' : 'min'
    return { ...p, uFrom, uDist: Math.round(((uFrom === 'min' ? c.x : face.u - c.x - c.width) + r) * 10) / 10 }
  }
  const vFrom = p.vFrom === 'min' ? 'max' : 'min'
  return { ...p, vFrom, vDist: Math.round(((vFrom === 'min' ? c.z : face.v - c.z - c.depth) + r) * 10) / 10 }
}

/** A cutout on the face (from its min corner, with the reference edges to keep) as stored. */
export function storedFromFace(board: Board, c: BoardCutout): BoardCutout {
  return { ...c, ...storedPlacement(c, placementOf(board, c)) }
}

/** What the workshop calls it: a round hole, a notch at the edge, or a hole inside. */
export type CutoutKind = 'round' | 'notch' | 'hole'
export function cutoutKind(board: Board, c: BoardCutout): CutoutKind {
  return c.shape === 'circle' ? 'round' : isNotch(board, c) ? 'notch' : 'hole'
}

/** The board's cutouts as the workshop lists them (kind and size in mm), in face order. */
export function cutoutList(board: Board): { kind: CutoutKind; width: number; depth: number }[] {
  return clampCutouts(board).map((c) => ({ kind: cutoutKind(board, c), width: c.width, depth: c.depth }))
}
