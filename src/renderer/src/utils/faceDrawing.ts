import type { Board, BoardCutout } from '../types/furniture'
import { boardFace } from './boardFace'
import { faceAxesInRoom, type EdgeName, type RoomAxis } from './cutoutPlace'

/**
 * How a board's face is laid on the drawing sheet, so the drawing agrees with the part as
 * it stands (the "Passer" between drawing and part): a standing part is drawn standing —
 * up is up; a lying part as seen from above, with its back (the wall side) at the top.
 * One rule for every part drawing (shop drawings); x runs right, y runs down on the sheet.
 */
export interface FaceDrawing {
  /** Drawn width and height (mm) */
  width: number
  height: number
  /** A rectangle given on the face (u, v from the min corner, size along u and v) on the sheet */
  rect: (u: number, v: number, du: number, dv: number) => { x: number; y: number; w: number; h: number }
  /** Which sheet direction a face axis runs: u or v → 'x' (across) or 'y' (up and down) */
  sheetAxis: { u: 'x' | 'y'; v: 'x' | 'y' }
  /** The room's names of the four sheet sides */
  sides: { left: EdgeName; right: EdgeName; top: EdgeName; bottom: EdgeName }
}

const ROOM_MIN: Record<RoomAxis, EdgeName> = { x: 'left', y: 'bottom', z: 'back' }
const ROOM_MAX: Record<RoomAxis, EdgeName> = { x: 'right', y: 'top', z: 'front' }

export function faceDrawing(board: Board): FaceDrawing {
  const face = boardFace(board)
  const { u, v } = faceAxesInRoom(board)
  // which face axis runs across the sheet and which up and down: a standing part with the
  // height up the sheet, a lying part with the room's x across and the back at the top. The
  // direction comes from the room too, so a part turned over is still drawn up the right way.
  const lying = u.room !== 'y' && v.room !== 'y'
  const across = lying ? (u.room === 'x' ? 'u' : 'v') : (u.room === 'y' ? 'v' : 'u')
  const A = across === 'u' ? u : v, B = across === 'u' ? v : u
  const lenA = across === 'u' ? face.u : face.v, lenB = across === 'u' ? face.v : face.u
  const fwdA = A.minEdge === ROOM_MIN[A.room], fwdB = B.minEdge === ROOM_MIN[B.room]
  return {
    width: lenA, height: lenB,
    rect: (pu, pv, du, dv) => {
      const [a, da, b, db] = across === 'u' ? [pu, du, pv, dv] : [pv, dv, pu, du]
      const x = fwdA ? a : lenA - a - da
      // standing: up is +y (top of the sheet = far end); lying: the back (min z) at the top
      const y = lying ? (fwdB ? b : lenB - b - db) : (fwdB ? lenB - b - db : b)
      return { x, y, w: da, h: db }
    },
    sheetAxis: { u: across === 'u' ? 'x' : 'y', v: across === 'v' ? 'x' : 'y' },
    sides: {
      left: ROOM_MIN[A.room], right: ROOM_MAX[A.room],
      top: lying ? ROOM_MIN[B.room] : ROOM_MAX[B.room], bottom: lying ? ROOM_MAX[B.room] : ROOM_MIN[B.room]
    }
  }
}

/** The four edges of the face for edge banding: E1/E2 run along u (at v = 0 and v = V),
 *  E3/E4 along v (at u = 0 and u = U) — as segments on the face (u, v, du, dv). */
export const EDGE_KEYS = ['e1', 'e2', 'e3', 'e4'] as const
export type EdgeKey = (typeof EDGE_KEYS)[number]
export function edgeSegment(board: Board, k: EdgeKey): [number, number, number, number] {
  const { u: U, v: V } = boardFace(board)
  return k === 'e1' ? [0, 0, U, 0] : k === 'e2' ? [0, V, U, 0] : k === 'e3' ? [0, 0, 0, V] : [U, 0, 0, V]
}

/** The sheet side each edge E1–E4 is drawn on, so every picture of the part (the shop
 *  drawing, the edge banding picker) shows it in the same place. */
export type SheetSide = 'top' | 'bottom' | 'left' | 'right'
export function edgeSides(board: Board): Record<EdgeKey, SheetSide> {
  const d = faceDrawing(board)
  const side = (k: EdgeKey): SheetSide => {
    const r = d.rect(...edgeSegment(board, k))
    if (r.h === 0) return r.y <= d.height / 2 ? 'top' : 'bottom'
    return r.x <= d.width / 2 ? 'left' : 'right'
  }
  return { e1: side('e1'), e2: side('e2'), e3: side('e3'), e4: side('e4') }
}

/** A cutout on the sheet (mm, before scaling). */
export function cutoutOnSheet(d: FaceDrawing, c: BoardCutout): { x: number; y: number; w: number; h: number } {
  return d.rect(c.x, c.z, c.width, c.depth)
}
