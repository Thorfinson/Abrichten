import type { Board, BoardCutout } from '../types/furniture'
import { numberedCutouts } from './geometry'
import { cutoutKind, faceAxesInRoom, placementOf } from './cutoutPlace'
import { faceDrawing } from './faceDrawing'

type T = (key: string) => string
const n = (v: number): string => String(Math.round(v * 10) / 10)

/**
 * A cutout as the workshop reads it, the same wherever it is written (cutting list,
 * shop drawing): kind, size and its place from its reference edges, named in the room —
 * "Ausklinkung Höhe 50 × Tiefe 70 · 0 von oben, 0 von hinten".
 */
export function describeCutout(board: Board, c: BoardCutout, t: T): string {
  const { u, v } = faceAxesInRoom(board)
  const p = placementOf(board, c)
  const size = c.shape === 'circle'
    ? `Ø ${n(c.width)}`
    : `${t(`cutout.size.${u.room}`)} ${n(c.width)} × ${t(`cutout.size.${v.room}`)} ${n(c.depth)}`
  const from = t('cutout.fromShort')
  const at = `${n(p.uDist)} ${from} ${t(`cutout.edge.${p.uFrom === 'min' ? u.minEdge : u.maxEdge}`)}, ${n(p.vDist)} ${from} ${t(`cutout.edge.${p.vFrom === 'min' ? v.minEdge : v.maxEdge}`)}`
  return `${t(`cutout.kind.${cutoutKind(board, c)}`)} ${size} · ${at}`
}

/** All cutouts of a board that can be built, described, with their number in the board's
 *  list (as the editor counts them); empty when it has none. */
export function describeCutouts(board: Board, t: T): { n: number; text: string }[] {
  return numberedCutouts(board).map(({ n, cut }) => ({ n, text: describeCutout(board, cut, t) }))
}

/** The names of the four sides of the part as drawn (utils/faceDrawing), in the room. */
export function faceSideNames(board: Board, t: T): { left: string; right: string; top: string; bottom: string } {
  const { sides } = faceDrawing(board)
  return { left: t(`cutout.edge.${sides.left}`), right: t(`cutout.edge.${sides.right}`), top: t(`cutout.edge.${sides.top}`), bottom: t(`cutout.edge.${sides.bottom}`) }
}
