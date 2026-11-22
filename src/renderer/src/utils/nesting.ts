import { escapeHtml } from './textSafety'
import type { Board, Material } from '../types/furniture'
import { getMaterialById } from '../data/materials'
import { boardFace } from './boardFace'

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
  /** false: the id is neither built in nor a project material (name = raw id) */
  materialKnown: boolean
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

/** Guillotine cut packer — best-fit by smallest free rectangle. The kerf is taken
 *  off the remainders after each cut, so it lies only between parts: a part may
 *  run up to the sheet edge. */
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
      if (rect.w <= fr.w && rect.h <= fr.h) {
        const score = fr.w * fr.h - rect.w * rect.h
        if (best === null || score < best.score) best = { fi, rotated: false, score }
      }
      if (!rect.grainLocked && rect.h <= fr.w && rect.w <= fr.h) {
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
 * Lay a board's face (boardFace) on the sheet. With a grain direction in the face
 * (and rotation not allowed), the grain-axis dimension goes along sheet X — the
 * sheet's grain — and the part is locked. Otherwise the longer side goes along X
 * and the packer may rotate it.
 */
function sheetRect(b: Board, allowRotation: boolean): { w: number; h: number; grainLocked: boolean } {
  const f = boardFace(b)
  if (!allowRotation && b.grainDirection === f.uAxis) return { w: f.u, h: f.v, grainLocked: true }
  if (!allowRotation && b.grainDirection === f.vAxis) return { w: f.v, h: f.u, grainLocked: true }
  return { w: Math.max(f.u, f.v), h: Math.min(f.u, f.v), grainLocked: false }
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

  const totalSheetArea = sheets.length * sheetW * sheetH
  const efficiency = totalSheetArea > 0 ? Math.min(1, placedArea(sheets) / totalSheetArea) : 0

  return { sheets, unplacedCount, efficiency, wastePercent: Math.max(0, 100 - efficiency * 100) }
}

/** Area of the parts actually placed on the sheets (unplaced parts use no sheet). */
function placedArea(sheets: NestingSheet[]): number {
  return sheets.reduce((s, sh) => s + sh.placed.reduce((t, p) => t + p.w * p.h, 0), 0)
}

/**
 * Main entry point — groups boards by materialId+thickness, runs nesting per group.
 * @param allowRotation When true, boards may be rotated 90° even if they have a grain direction set.
 * @param customMaterials Project materials, so their boards get a name.
 */
export function nestBoards(
  boards: Board[],
  sheetW: number,
  sheetH: number,
  kerf: number,
  allowRotation = false,
  customMaterials?: Material[]
): NestingResult {
  const safeKerf = Number.isFinite(kerf) ? Math.max(0, kerf) : 0
  // Group boards: key = "materialId::thickness"
  const groupMap = new Map<string, { materialId: string; thickness: number; rects: NestingRect[] }>()

  for (const b of boards) {
    const { thickness } = boardFace(b)
    // A material without grain (MDF, chipboard, …) may always turn; unknown materials stay locked
    const grainless = getMaterialById(b.materialId, customMaterials)?.grain === false
    const { w, h, grainLocked } = sheetRect(b, allowRotation || grainless)
    // Round thickness to nearest 0.5mm for grouping tolerance
    const thickKey = Math.round(thickness * 2) / 2
    const key = `${b.materialId}::${thickKey}`
    if (!groupMap.has(key)) {
      groupMap.set(key, { materialId: b.materialId, thickness: thickKey, rects: [] })
    }
    groupMap.get(key)!.rects.push({ boardId: b.id, name: b.name, w, h, grainLocked }) // part-name-ok: nestingToSvg adds the label
  }

  const groups: NestingGroup[] = []
  let totalSheets = 0
  let totalBoardArea = 0
  let totalSheetArea = 0

  for (const [, g] of groupMap) {
    const mat = getMaterialById(g.materialId, customMaterials)
    const materialName = mat?.name ?? g.materialId
    const { sheets, unplacedCount, efficiency, wastePercent } = packGroup(g.rects, sheetW, sheetH, safeKerf)

    groups.push({ materialId: g.materialId, materialName, materialKnown: !!mat, thickness: g.thickness, sheets, unplacedCount, efficiency, wastePercent })
    totalSheets += sheets.length
    totalBoardArea += placedArea(sheets)
    totalSheetArea += sheets.length * sheetW * sheetH
  }

  const overallEfficiency = totalSheetArea > 0 ? Math.min(1, totalBoardArea / totalSheetArea) : 0

  return { groups, totalSheets, overallEfficiency }
}

/** Average glyph width as a share of the font size (sans-serif), to fit text into a part */
const GLYPH = 0.6

/**
 * One sheet as SVG. Each part shows its label ("Herd 2", utils/partLabel) as large
 * as the part allows, and below it as much of its name as fits.
 * `labels`: part labels by board id; without one the name stands alone, as before.
 */
export function nestingToSvg(sheet: NestingSheet, scale = 0.15, labels?: Map<string, string>): string {
  const W = sheet.width * scale
  const H = sheet.height * scale
  const rects = sheet.placed.map((p) => {
    const x = p.x * scale, y = p.y * scale
    const w = p.w * scale, h = p.h * scale
    const cx = (x + w / 2).toFixed(1)
    const rotMark = p.rotated ? ' ↺' : ''
    const box = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#dbeafe" stroke="#2563eb" stroke-width="0.5"/>`
    const label = labels?.get(p.boardId)
    // rendered via innerHTML in NestingPanel: every text is escaped
    if (!label) {
      return `${box}
<text x="${cx}" y="${(y + h / 2).toFixed(1)}" font-size="6" text-anchor="middle" dominant-baseline="middle" fill="#1e40af">${escapeHtml(p.name.slice(0, 18))}${rotMark}</text>`
    }
    const labelText = label + rotMark
    const big = Math.max(3, Math.min(16, h * 0.45, (w * 0.9) / (labelText.length * GLYPH)))
    const small = Math.min(5, big * 0.6)
    const nameFits = h >= big + small * 2.2
    const nameChars = Math.floor((w * 0.92) / (small * GLYPH))
    const name = p.name.length > nameChars ? `${p.name.slice(0, Math.max(0, nameChars - 1))}…` : p.name
    const labelY = nameFits ? y + h / 2 - small * 0.6 : y + h / 2
    return `${box}
<text x="${cx}" y="${labelY.toFixed(1)}" font-size="${big.toFixed(1)}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#1e3a8a">${escapeHtml(labelText)}</text>${
  nameFits && nameChars >= 4 ? `
<text x="${cx}" y="${(labelY + big * 0.55 + small * 0.9).toFixed(1)}" font-size="${small.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#1e40af">${escapeHtml(name)}</text>` : ''}`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">
<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="#f8f9fa" stroke="#666" stroke-width="1"/>
${rects}
</svg>`
}
