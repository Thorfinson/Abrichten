import type { Board } from '../types/furniture'

export type BoardAxis = 'width' | 'height' | 'depth'

type Dims = Pick<Board, 'width' | 'height' | 'depth'>

export interface BoardFace {
  /** Smallest dimension: the panel thickness */
  thicknessAxis: BoardAxis
  thickness: number
  /** First face axis; edge banding E1/E2 runs along it */
  uAxis: BoardAxis
  u: number
  /** Second face axis; edge banding E3/E4 runs along it */
  vAxis: BoardAxis
  v: number
}

const AXIS_ORDER: BoardAxis[] = ['width', 'height', 'depth']
// Equal smallest dimensions: prefer height (lying parts), then depth (backs, fronts)
const THICKNESS_PREFERENCE: BoardAxis[] = ['height', 'depth', 'width']

/**
 * The one rule for which dimension is the thickness: the smallest one. The face is
 * the other two in fixed axis order width, height, depth — lying parts get
 * width × depth, side panels height × depth, backs and fronts width × height.
 */
export function boardFace(b: Dims): BoardFace {
  let thicknessAxis = THICKNESS_PREFERENCE[0]
  for (const axis of THICKNESS_PREFERENCE) if (b[axis] < b[thicknessAxis]) thicknessAxis = axis
  const [uAxis, vAxis] = AXIS_ORDER.filter((axis) => axis !== thicknessAxis)
  return { thicknessAxis, thickness: b[thicknessAxis], uAxis, u: b[uAxis], vAxis, v: b[vAxis] }
}

/** Face area in m² (what is bought and cut). */
export function faceAreaSqm(b: Dims): number {
  const f = boardFace(b)
  return (f.u * f.v) / 1_000_000
}

/** Edge banding length in mm: E1/E2 along the first face axis, E3/E4 along the second. */
export function edgeBandingLengthMm(b: Dims & Pick<Board, 'edgeBanding'>): number {
  const eb = b.edgeBanding
  if (!eb) return 0
  const f = boardFace(b)
  return (eb.e1 ? f.u : 0) + (eb.e2 ? f.u : 0) + (eb.e3 ? f.v : 0) + (eb.e4 ? f.v : 0)
}

/**
 * The face as seen when drilling it: y runs along the height when the height lies
 * in the face (standing panels, doors), x along the other face axis.
 */
export function uprightFace(b: Dims): { x: number; y: number } {
  const f = boardFace(b)
  if (f.uAxis === 'height') return { x: f.v, y: f.u }
  return { x: f.u, y: f.v }
}
