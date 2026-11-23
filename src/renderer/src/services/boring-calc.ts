import { hardwareItems, hingePositionsMm, HINGE_CUP_EDGE_MM } from '../data/hardware'
import { faceDrawing } from '../utils/faceDrawing'
import type { Board } from '../types/furniture'

/** 32 mm system: hole pitch, and the first hole line 37 mm from the front edge */
const SYSTEM_PITCH_MM = 32
const SYSTEM_EDGE_MM = 37

/** Holes are given on the part as it is drawn (utils/faceDrawing: standing parts upright,
 *  lying ones from above with the wall side on top): x from its left side, y from its
 *  bottom side — the same picture as the shop drawing. */
const sheetOf = (board: Board): { x: number; y: number } => {
  const d = faceDrawing(board)
  return { x: d.width, y: d.height }
}

export interface InferredBore {
  x: number       // mm from the left side of the part as drawn
  y: number       // mm from its bottom side
  diameter: number // mm
  depth: number    // mm
  side: 'left' | 'right' | 'top' | 'bottom' | 'face'
  source: string  // hardware name
}

/**
 * Infer bore positions from attached hardware on a board, on the part as drawn (sheetOf),
 * origin at its bottom-left.
 */
export function inferBoringFromHardware(board: Board): InferredBore[] {
  const bores: InferredBore[] = []
  if (!board.hardware?.length) return bores
  const face = sheetOf(board)

  for (const attached of board.hardware) {
    const hw = hardwareItems.find((h) => h.id === attached.hardwareId)
    if (!hw) continue

    if (hw.category === 'hinges' && hw.drillingDiameter) {
      // Cup bores at the shared edge distance, spread along the door height
      const cupDia = hw.drillingDiameter   // typically 35mm
      const cupDepth = hw.cupDepth ?? 13   // typically 12.5–13mm

      // Generate left-side cup bores (adjust x for door swing side)
      for (const y of hingePositionsMm(face.y, attached.quantity)) {
        bores.push({
          x: HINGE_CUP_EDGE_MM,
          y,
          diameter: cupDia,
          depth: cupDepth,
          side: 'face',
          source: hw.nameEn
        })
      }
    } else if (hw.category === 'slides') {
      // Runner screw holes in the 32 mm system: front hole 37 mm from the front edge
      // (x = 0, like the hinge cups), rear hole on the 32 mm grid as far back as the
      // runner reaches. The attachment does not store drawer heights, so one row per
      // runner, spread evenly from 37 mm above the bottom to 37 mm below the top.
      const holeDia = 5
      const holeDepth = 12
      const length = Math.min(hw.length ?? face.x, face.x)
      const xFront = SYSTEM_EDGE_MM
      const xRear = xFront + SYSTEM_PITCH_MM * Math.max(0, Math.floor((length - xFront - 10) / SYSTEM_PITCH_MM))
      const rows = Math.min(Math.max(1, Math.round(attached.quantity) || 1), 10)
      for (let i = 0; i < rows; i++) {
        const y = rows === 1 ? SYSTEM_EDGE_MM : SYSTEM_EDGE_MM + (i * (face.y - 2 * SYSTEM_EDGE_MM)) / (rows - 1)
        for (const x of xRear > xFront ? [xFront, xRear] : [xFront]) {
          bores.push({ x, y, diameter: holeDia, depth: holeDepth, side: 'face', source: hw.nameEn })
        }
      }
    }
  }

  return bores
}

export interface SystemBoringOptions {
  spacing: number      // mm between rows (32 mm system)
  startOffset: number  // mm from the bottom and top edge to the first/last hole
  sideInset: number    // mm from the front and back edge to the hole rows
  diameter: number
  depth: number
}

export interface SystemBore {
  side: 'left' | 'right'
  x: number  // mm from the left side of the part as drawn
  y: number  // mm from its bottom side
  diameter: number
  depth: number
}

/** Holes per row are capped: a 2.6 m panel on the 32 mm grid has about 80. */
const MAX_HOLES_PER_ROW = 1000
/** Spacings below this would drill holes into each other. */
const MIN_SPACING_MM = 1

/** Two rows of shelf-pin holes (32 mm system) on a standing panel's face. */
export function systemBoringRows(board: Board, opts: SystemBoringOptions): SystemBore[] {
  const face = sheetOf(board)
  const step = Number.isFinite(opts.spacing) ? Math.max(MIN_SPACING_MM, opts.spacing) : 32
  const holes: SystemBore[] = []
  const { diameter, depth } = opts
  for (let i = 0, y = opts.startOffset; y <= face.y - opts.startOffset && i < MAX_HOLES_PER_ROW; i++, y += step) {
    holes.push({ side: 'left',  x: opts.sideInset, y, diameter, depth })
    holes.push({ side: 'right', x: face.x - opts.sideInset, y, diameter, depth })
  }
  return holes
}
