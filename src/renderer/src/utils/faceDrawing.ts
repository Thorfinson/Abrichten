import type { Board, BoardCutout } from '../types/furniture'
import { boardFace } from './boardFace'
import { faceAxesInRoom, type EdgeName } from './cutoutPlace'

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

export function faceDrawing(board: Board): FaceDrawing {
  const face = boardFace(board)
  const { u, v } = faceAxesInRoom(board)
  const U = face.u, V = face.v
  // the height lies along u: draw it upright (u up the sheet, v across)
  if (u.room === 'y') {
    return {
      width: V, height: U,
      rect: (pu, pv, du, dv) => ({ x: pv, y: U - (pu + du), w: dv, h: du }),
      sheetAxis: { u: 'y', v: 'x' },
      sides: { left: v.minEdge, right: v.maxEdge, top: u.maxEdge, bottom: u.minEdge }
    }
  }
  // the height lies along v: upright, v up the sheet
  if (v.room === 'y') {
    return {
      width: U, height: V,
      rect: (pu, pv, du, dv) => ({ x: pu, y: V - (pv + dv), w: du, h: dv }),
      sheetAxis: { u: 'x', v: 'y' },
      sides: { left: u.minEdge, right: u.maxEdge, top: v.maxEdge, bottom: v.minEdge }
    }
  }
  // lying: seen from above, the back (min depth) at the top
  return {
    width: U, height: V,
    rect: (pu, pv, du, dv) => ({ x: pu, y: pv, w: du, h: dv }),
    sheetAxis: { u: 'x', v: 'y' },
    sides: { left: u.minEdge, right: u.maxEdge, top: v.minEdge, bottom: v.maxEdge }
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
