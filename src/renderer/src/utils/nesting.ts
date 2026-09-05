import { escapeHtml } from './textSafety'
import type { Board } from '../types/furniture'
import { getMaterialById } from '../data/materials'

export interface NestingRect {
  boardId: string
  name: string
  w: number  // mm (face width)
  h: number  // mm (face height)
  grainLocked?: boolean  // when true, rotation not allowed (grain direction is set)
}

export interface PlacedRect {
  boardId: string
  name: string
  x: number
  y: number
  w: number
  h: number
  rotated: boolean
}

export interface NestingSheet {
  width: number
  height: number
  placed: PlacedRect[]
}

export interface NestingGroup {
  materialId: string
  materialName: string
  thickness: number       // mm
  sheets: NestingSheet[]
  unplacedCount: number
  efficiency: number
  wastePercent: number
}

export interface NestingResult {
  groups: NestingGroup[]
  totalSheets: number
  overallEfficiency: number
}

interface FreeRect {
  x: number; y: number; w: number; h: number
}

/** Guillotine cut packer — best-fit by smallest free rectangle */
function packSheet(
  rects: NestingRect[],
  sheetW: number,
  sheetH: number,
  kerf: number
): { placed: PlacedRect[]; unplaced: NestingRect[] } {
  const placed: PlacedRect[] = []
  const unplaced: NestingRect[] = []
  let free: FreeRect[] = [{ x: 0, y: 0, w: sheetW, h: sheetH }]

  for (const rect of rects) {
    let best: { fi: number; rotated: boolean; score: number } | null = null

    for (let fi = 0; fi < free.length; fi++) {
      const fr = free[fi]
      if (rect.w + kerf <= fr.w && rect.h + kerf <= fr.h) {
        const score = fr.w * fr.h - rect.w * rect.h
        if (best === null || score < best.score) best = { fi, rotated: false, score }
      }
      if (!rect.grainLocked && rect.h + kerf <= fr.w && rect.w + kerf <= fr.h) {
        const score = fr.w * fr.h - rect.h * rect.w
        if (best === null || score < best.score) best = { fi, rotated: true, score }
      }
    }

    if (best === null) { unplaced.push(rect); continue }

    const { fi, rotated } = best
    const fr = free[fi]
    const pw = rotated ? rect.h : rect.w
    const ph = rotated ? rect.w : rect.h

    placed.push({ boardId: rect.boardId, name: rect.name, x: fr.x, y: fr.y, w: pw, h: ph, rotated })

    const newFree: FreeRect[] = []
    for (let i = 0; i < free.length; i++) {
      if (i === fi) {
        if (fr.w - pw - kerf > 0) newFree.push({ x: fr.x + pw + kerf, y: fr.y, w: fr.w - pw - kerf, h: ph })
        if (fr.h - ph - kerf > 0) newFree.push({ x: fr.x, y: fr.y + ph + kerf, w: fr.w, h: fr.h - ph - kerf })
      } else {
        newFree.push(free[i])
      }
    }
    free = newFree
  }
  return { placed, unplaced }
}

/**
 * Determine the two "face" dimensions of a board (the large flat face).
 * For a flat panel, depth (thickness) is the smallest dimension.
 * Returns { faceW, faceH, thickness }.
 */
function boardFace(b: Board): { faceW: number; faceH: number; thickness: number } {
  const dims = [b.width, b.height, b.depth].sort((a, z) => a - z)
  // dims[0] = smallest = thickness, dims[1] and dims[2] = face
  return { faceW: dims[2], faceH: dims[1], thickness: dims[0] }
}

/**
 * Pack a group of boards that share the same material + thickness.
 */
function packGroup(
  rects: NestingRect[],
  sheetW: number,
  sheetH: number,
  kerf: number
): { sheets: NestingSheet[]; unplacedCount: number; efficiency: number; wastePercent: number } {
  let remaining = [...rects].sort((a, b) => b.w * b.h - a.w * a.h)
  const sheets: NestingSheet[] = []
  let unplacedCount = 0

  while (remaining.length > 0) {
    const { placed, unplaced } = packSheet(remaining, sheetW, sheetH, kerf)
    if (placed.length === 0) { unplacedCount += remaining.length; break }
    sheets.push({ width: sheetW, height: sheetH, placed })
    remaining = unplaced
  }

  const totalBoardArea = rects.reduce((s, r) => s + r.w * r.h, 0)
  const totalSheetArea = sheets.length * sheetW * sheetH
  const efficiency = totalSheetArea > 0 ? Math.min(1, totalBoardArea / totalSheetArea) : 0

  return { sheets, unplacedCount, efficiency, wastePercent: Math.max(0, 100 - efficiency * 100) }
}

/**
 * Main entry point — groups boards by materialId+thickness, runs nesting per group.
 * @param allowRotation When true, boards may be rotated 90° even if they have a grain direction set.
 */
export function nestBoards(
  boards: Board[],
  sheetW: number,
  sheetH: number,
  kerf: number,
  allowRotation = false
): NestingResult {
  // Group boards: key = "materialId::thickness"
  const groupMap = new Map<string, { materialId: string; thickness: number; rects: NestingRect[] }>()

  for (const b of boards) {
    const { faceW, faceH, thickness } = boardFace(b)
    // Round thickness to nearest 0.5mm for grouping tolerance
    const thickKey = Math.round(thickness * 2) / 2
    const key = `${b.materialId}::${thickKey}`
    if (!groupMap.has(key)) {
      groupMap.set(key, { materialId: b.materialId, thickness: thickKey, rects: [] })
    }
    groupMap.get(key)!.rects.push({
      boardId: b.id,
      name: b.name,
      w: faceW,
      h: faceH,
      // allowRotation overrides grain locking
      grainLocked: !allowRotation && (b.grainDirection !== undefined && b.grainDirection !== null)
    })
  }

  const groups: NestingGroup[] = []
  let totalSheets = 0
  let totalBoardArea = 0
  let totalSheetArea = 0

  for (const [, g] of groupMap) {
    const mat = getMaterialById(g.materialId)
    const materialName = mat?.name ?? g.materialId
    const { sheets, unplacedCount, efficiency, wastePercent } = packGroup(g.rects, sheetW, sheetH, kerf)

    groups.push({ materialId: g.materialId, materialName, thickness: g.thickness, sheets, unplacedCount, efficiency, wastePercent })
    totalSheets += sheets.length
    totalBoardArea += g.rects.reduce((s, r) => s + r.w * r.h, 0)
    totalSheetArea += sheets.length * sheetW * sheetH
  }

  const overallEfficiency = totalSheetArea > 0 ? Math.min(1, totalBoardArea / totalSheetArea) : 0

  return { groups, totalSheets, overallEfficiency }
}

export function nestingToSvg(sheet: NestingSheet, scale = 0.15): string {
  const W = sheet.width * scale
  const H = sheet.height * scale
  const rects = sheet.placed.map((p) => {
    const x = p.x * scale, y = p.y * scale
    const w = p.w * scale, h = p.h * scale
    const label = escapeHtml(p.name.slice(0, 18)) // rendered via innerHTML in NestingPanel
    const rotMark = p.rotated ? ' ↺' : ''
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#dbeafe" stroke="#2563eb" stroke-width="0.5"/>
<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2).toFixed(1)}" font-size="6" text-anchor="middle" dominant-baseline="middle" fill="#1e40af">${label}${rotMark}</text>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">
<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="#f8f9fa" stroke="#666" stroke-width="1"/>
${rects}
</svg>`
}
