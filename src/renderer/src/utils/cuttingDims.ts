import { boardFace, type BoardAxis } from './boardFace'
import type { Board } from '../types/furniture'

/** Grain relative to the cut length: along it ("längs") or across it ("quer"). */
export type GrainRelation = 'along' | 'across'

export interface CuttingDims {
  /** Longer face side */
  length: number
  /** Shorter face side */
  width: number
  /** Smallest dimension (boardFace) */
  thickness: number
  lengthAxis: BoardAxis
  widthAxis: BoardAxis
  /** null: no grain set, or set along the thickness (meaningless for a cut part) */
  grain: GrainRelation | null
}

/**
 * A part as the saw sees it: length × width × thickness. The thickness is the
 * smallest dimension and the face the other two (utils/boardFace), so a side
 * panel 18 × 720 × 300 is 720 × 300 × 18 whichever way it stands in the model.
 */
export function cuttingDims(b: Pick<Board, 'width' | 'height' | 'depth' | 'grainDirection'>): CuttingDims {
  const f = boardFace(b)
  const uIsLength = f.u >= f.v
  const lengthAxis = uIsLength ? f.uAxis : f.vAxis
  const widthAxis = uIsLength ? f.vAxis : f.uAxis
  const grain: GrainRelation | null =
    b.grainDirection === lengthAxis ? 'along' : b.grainDirection === widthAxis ? 'across' : null
  return {
    length: Math.max(f.u, f.v),
    width: Math.min(f.u, f.v),
    thickness: f.thickness,
    lengthAxis,
    widthAxis,
    grain
  }
}
