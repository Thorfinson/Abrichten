import type { Board, Vec3 } from '../types/furniture'
import { worldAligned } from './projection'

export type SnapAxis = 'x' | 'y' | 'z'

/** World-axis box: min/max corner in mm. */
export interface SnapBox {
  min: Vec3
  max: Vec3
}

/** Screen distance (px) within which a dragged board snaps to another board's face. */
export const FACE_SNAP_PX = 8

/** The board's world-aligned bounding box (rotated boards: the box around them). */
export function boardBox(board: Board): SnapBox {
  const w = worldAligned(board)
  return {
    min: { ...w.position },
    max: { x: w.position.x + w.width, y: w.position.y + w.height, z: w.position.z + w.depth }
  }
}

export interface FaceSnap {
  /** Correction to add to the moving box per axis (0 where nothing snapped) */
  offset: Vec3
  /** Axes that snapped, each with the world plane the faces meet in */
  planes: Partial<Record<SnapAxis, number>>
}

/**
 * Face snapping between boxes, each drag axis on its own: the moving box's faces
 * are compared with every other box's faces — touching (min↔max, max↔min) and
 * flush (min↔min, max↔max) — and the closest pair within `threshold` mm wins.
 */
export function snapBox(moving: SnapBox, others: SnapBox[], axes: SnapAxis[], threshold: number): FaceSnap {
  const offset: Vec3 = { x: 0, y: 0, z: 0 }
  const planes: FaceSnap['planes'] = {}
  for (const axis of axes) {
    let best: { d: number; plane: number } | null = null
    const own = [moving.min[axis], moving.max[axis]]
    for (const o of others) {
      for (const target of [o.min[axis], o.max[axis]]) {
        for (const face of own) {
          const d = target - face
          if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, plane: target }
        }
      }
    }
    if (best) {
      offset[axis] = best.d
      planes[axis] = best.plane
    }
  }
  return { offset, planes }
}

export interface BoardSnap {
  /** The moved board's position after face snapping (unchanged on axes that did not snap) */
  position: Vec3
  /** Axes that snapped to another board's face */
  snapped: SnapAxis[]
  /** Where to show the snap indicator: the board centre moved onto the snapped planes; null when nothing snapped */
  indicator: Vec3 | null
}

/**
 * Snap `board` (already at its proposed position) to the faces of `others` along
 * the drag `axes`. Works on world-aligned boxes, so rotated boards snap by their
 * bounding box; the returned position is the board's own position shifted by the
 * same correction.
 */
export function snapBoardToBoards(board: Board, others: Board[], axes: SnapAxis[], threshold: number): BoardSnap {
  const box = boardBox(board)
  const { offset, planes } = snapBox(box, others.map(boardBox), axes, threshold)
  const snapped = axes.filter((a) => planes[a] !== undefined)
  const position = {
    x: board.position.x + offset.x,
    y: board.position.y + offset.y,
    z: board.position.z + offset.z
  }
  if (snapped.length === 0) return { position, snapped, indicator: null }
  const centre = (a: SnapAxis): number => (box.min[a] + box.max[a]) / 2 + offset[a]
  const at = (a: SnapAxis): number => planes[a] ?? centre(a)
  return { position, snapped, indicator: { x: at('x'), y: at('y'), z: at('z') } }
}
