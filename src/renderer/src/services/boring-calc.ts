import { hardwareItems } from '../data/hardware'
import type { Board } from '../types/furniture'

export interface InferredBore {
  x: number       // mm from left edge of board face
  y: number       // mm from bottom of board face
  diameter: number // mm
  depth: number    // mm
  side: 'left' | 'right' | 'top' | 'bottom' | 'face'
  source: string  // hardware name
}

/**
 * Infer bore positions from attached hardware on a board.
 * Returns holes in the board-face coordinate system (looking at the front face).
 * Board face = width × height, origin at bottom-left.
 */
export function inferBoringFromHardware(board: Board): InferredBore[] {
  const bores: InferredBore[] = []
  if (!board.hardware?.length) return bores

  for (const attached of board.hardware) {
    const hw = hardwareItems.find((h) => h.id === attached.hardwareId)
    if (!hw) continue

    const qty = attached.quantity

    if (hw.category === 'hinges' && hw.drillingDiameter) {
      // Cup bore at 35mm from hinge edge, evenly distributed along board height
      const cupDia = hw.drillingDiameter   // typically 35mm
      const cupDepth = hw.cupDepth ?? 13   // typically 12.5–13mm
      const inset = 35                     // standard hinge cup inset from edge

      // Y positions: spread qty hinges with at least 50mm from ends
      const margin = Math.max(50, Math.min(100, board.height * 0.08))
      const yPositions: number[] = []
      if (qty === 1) {
        yPositions.push(board.height / 2)
      } else {
        const spacing = (board.height - 2 * margin) / (qty - 1)
        for (let i = 0; i < qty; i++) {
          yPositions.push(margin + i * spacing)
        }
      }

      // Generate left-side cup bores (adjust x for door swing side)
      for (const y of yPositions) {
        bores.push({
          x: inset,
          y,
          diameter: cupDia,
          depth: cupDepth,
          side: 'face',
          source: hw.nameEn
        })
      }
    } else if (hw.category === 'slides') {
      // Drawer slide mounting holes: 4 holes per slide (front pair + rear pair)
      // Standard Blum-style: holes at 37mm from front/back, 10mm from bottom edge
      const holeDia = 5  // standard shelf pin / screw hole
      const holeDepth = 12
      const yFront = 10
      const yRear = board.height - 10
      const xTop = board.width / 2 - 16
      const xBot = board.width / 2 + 16

      // One pair at front, one pair at rear
      bores.push(
        { x: xTop, y: yFront, diameter: holeDia, depth: holeDepth, side: 'face', source: hw.nameEn },
        { x: xBot, y: yFront, diameter: holeDia, depth: holeDepth, side: 'face', source: hw.nameEn },
        { x: xTop, y: yRear,  diameter: holeDia, depth: holeDepth, side: 'face', source: hw.nameEn },
        { x: xBot, y: yRear,  diameter: holeDia, depth: holeDepth, side: 'face', source: hw.nameEn }
      )
    }
  }

  return bores
}
