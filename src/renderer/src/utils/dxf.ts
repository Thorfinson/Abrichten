import type { Board } from '../types/furniture'
import { clampCutouts } from './geometry'

/**
 * Generates a DXF file (R12/AC1009) with proper machining layers.
 *
 * Layers:
 *   OUTLINE   – board outer profile (router/saw cut line)
 *   CUTOUT    – through-thickness openings, e.g. cooktop/sink (cut line)
 *   EDGEBAND  – edges with edge banding (cyan, informational)
 *   GRAIN     – grain direction indicator (not cut)
 *   TEXT      – part labels (not cut)
 *
 * Boards are laid out in a row separated by a 50 mm gap.
 */
export function exportDxf(boards: Board[]): string {
  const lines: string[] = []

  // ── HEADER ──────────────────────────────────────────────────────────────
  lines.push(
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1009',
    '0', 'ENDSEC'
  )

  // ── TABLES (layer definitions) ──────────────────────────────────────────
  lines.push('0', 'SECTION', '2', 'TABLES')
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '5')

  const layerDef = (name: string, color: number) => [
    '0', 'LAYER',
    '2', name,
    '70', '0',
    '62', String(color),
    '6', 'CONTINUOUS'
  ]
  // ACI colors: 7=white/black, 4=cyan, 2=yellow, 1=red, 3=green
  lines.push(...layerDef('OUTLINE',  7))
  lines.push(...layerDef('CUTOUT',   3))
  lines.push(...layerDef('EDGEBAND', 4))
  lines.push(...layerDef('GRAIN',    2))
  lines.push(...layerDef('TEXT',     1))
  lines.push('0', 'ENDTAB')
  lines.push('0', 'ENDSEC')

  // ── ENTITIES ────────────────────────────────────────────────────────────
  lines.push('0', 'SECTION', '2', 'ENTITIES')

  const GAP = 50
  let offsetX = 0

  for (const board of boards) {
    const w = board.width
    const d = board.depth
    const x0 = offsetX
    const y0 = 0

    // ── Board outline (OUTLINE layer) ─────────────────────────────────────
    lines.push('0', 'POLYLINE', '8', 'OUTLINE', '66', '1', '70', '1')
    const corners: [number, number][] = [
      [x0,     y0],
      [x0 + w, y0],
      [x0 + w, y0 + d],
      [x0,     y0 + d]
    ]
    for (const [cx, cy] of corners) {
      lines.push('0', 'VERTEX', '8', 'OUTLINE')
      lines.push('10', cx.toFixed(3), '20', cy.toFixed(3), '30', '0.0')
    }
    lines.push('0', 'SEQEND')

    // ── Cutouts (CUTOUT layer) — through-thickness openings ──────────────
    for (const c of clampCutouts(board)) {
      lines.push('0', 'POLYLINE', '8', 'CUTOUT', '66', '1', '70', '1')
      const cc: [number, number][] = [
        [x0 + c.x,           y0 + c.z],
        [x0 + c.x + c.width, y0 + c.z],
        [x0 + c.x + c.width, y0 + c.z + c.depth],
        [x0 + c.x,           y0 + c.z + c.depth]
      ]
      for (const [cx, cy] of cc) {
        lines.push('0', 'VERTEX', '8', 'CUTOUT')
        lines.push('10', cx.toFixed(3), '20', cy.toFixed(3), '30', '0.0')
      }
      lines.push('0', 'SEQEND')
    }

    // ── Edge banding marks (EDGEBAND layer) ───────────────────────────────
    const eb = board.edgeBanding ?? {}
    const ebEdges: Array<[boolean | undefined, number, number, number, number]> = [
      [eb.e1, x0,     y0,     x0 + w, y0    ],
      [eb.e2, x0,     y0 + d, x0 + w, y0 + d],
      [eb.e3, x0,     y0,     x0,     y0 + d],
      [eb.e4, x0 + w, y0,     x0 + w, y0 + d]
    ]
    for (const [has, x1, y1, x2, y2] of ebEdges) {
      if (!has) continue
      lines.push('0', 'LINE', '8', 'EDGEBAND')
      lines.push('10', x1.toFixed(3), '20', y1.toFixed(3), '30', '0.0')
      lines.push('11', x2.toFixed(3), '21', y2.toFixed(3), '31', '0.0')
    }

    // ── Grain direction arrow (GRAIN layer) ───────────────────────────────
    if (board.grainDirection) {
      const cx = x0 + w / 2
      const cy = y0 + d / 2
      const len = Math.min(w, d) * 0.3
      let x1 = cx, y1 = cy, x2 = cx, y2 = cy
      if (board.grainDirection === 'width')  { x1 = cx - len; x2 = cx + len }
      if (board.grainDirection === 'depth')  { y1 = cy - len; y2 = cy + len }
      if (board.grainDirection === 'height') {
        x1 = cx - len * 0.7; y1 = cy - len * 0.7
        x2 = cx + len * 0.7; y2 = cy + len * 0.7
      }
      lines.push('0', 'LINE', '8', 'GRAIN')
      lines.push('10', x1.toFixed(3), '20', y1.toFixed(3), '30', '0.0')
      lines.push('11', x2.toFixed(3), '21', y2.toFixed(3), '31', '0.0')
    }

    // ── Part label (TEXT layer, no cut) ───────────────────────────────────
    lines.push('0', 'TEXT', '8', 'TEXT')
    lines.push('10', (x0 + 4).toFixed(3), '20', (y0 + 4).toFixed(3), '30', '0.0')
    lines.push('40', '8')
    lines.push('1', `${board.name}  ${w}x${d}x${board.height}mm`)

    offsetX += w + GAP
  }

  lines.push('0', 'ENDSEC')
  lines.push('0', 'EOF')

  return lines.join('\n')
}
