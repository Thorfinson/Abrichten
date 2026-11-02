import type { Material } from '../types/furniture'
import { getMaterialById } from '../data/materials'

/**
 * Cut plan for bar stock (battens, rails, square timber): the parts of one material and
 * cross-section are packed onto stock lengths, longest first (first fit decreasing).
 * Bar stock is solid wood up to BAR_MAX_WIDTH_MM wide and at least BAR_MIN_THICKNESS_MM
 * thick; thinner solid wood is a board (a drawer front), cut from a panel.
 * ponytail: first fit decreasing, within a bar or so of the optimum for furniture cut
 * lists; an exact bin packing only pays off for long runs of one length.
 */
export const BAR_MAX_WIDTH_MM = 100
export const BAR_MIN_THICKNESS_MM = 20

export interface BarSettings {
  /** Length of one stock bar (mm) */
  stockMm: number
  /** Saw cut between two pieces (mm) */
  kerfMm: number
  /** Cut off at each end of a bar before use: split, not square (mm) */
  trimMm: number
}

export const DEFAULT_BAR_SETTINGS: BarSettings = { stockMm: 4000, kerfMm: 5, trimMm: 10 }

/** One part to cut, with its cutting dimensions (utils/cuttingDims). */
export interface BarPart {
  name: string
  materialId: string
  length: number
  width: number
  thickness: number
}

export interface Bar {
  pieces: BarPart[]
  /** Left over after the last piece, from the trimmed end (mm) */
  restMm: number
}

export interface BarGroup {
  materialId: string
  width: number
  thickness: number
  /** All parts of this section, the ones longer than a bar included */
  count: number
  totalMm: number
  bars: Bar[]
  /** Longer than a bar after trimming: to be joined or bought as a longer bar */
  tooLong: BarPart[]
}

export function isBarStock(p: Pick<BarPart, 'width' | 'thickness'>, material: Material | undefined): boolean {
  return material?.category === 'solid_wood' && p.width <= BAR_MAX_WIDTH_MM && p.thickness >= BAR_MIN_THICKNESS_MM
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** The bar stock among `parts`, per material and section, packed onto bars of `settings.stockMm`. */
export function planBars(parts: BarPart[], settings: BarSettings, customMaterials?: Material[]): BarGroup[] {
  const usable = settings.stockMm - 2 * settings.trimMm
  const groups = new Map<string, BarPart[]>()
  for (const p of parts) {
    if (!isBarStock(p, getMaterialById(p.materialId, customMaterials))) continue
    const key = `${p.materialId}|${p.width}|${p.thickness}`
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  return [...groups.values()].map((list) => {
    const sorted = [...list].sort((a, b) => b.length - a.length || a.name.localeCompare(b.name))
    const bars: { pieces: BarPart[]; used: number }[] = []
    const tooLong: BarPart[] = []
    for (const p of sorted) {
      if (p.length > usable) { tooLong.push(p); continue }
      const bar = bars.find((b) => b.used + settings.kerfMm + p.length <= usable)
      if (bar) { bar.pieces.push(p); bar.used += settings.kerfMm + p.length } else bars.push({ pieces: [p], used: p.length })
    }
    return {
      materialId: list[0].materialId,
      width: list[0].width,
      thickness: list[0].thickness,
      count: list.length,
      totalMm: list.reduce((s, p) => s + p.length, 0),
      bars: bars.map((b) => ({ pieces: b.pieces, restMm: round1(usable - b.used) })),
      tooLong
    }
  }).sort((a, b) => a.materialId.localeCompare(b.materialId) || b.width - a.width || b.thickness - a.thickness)
}
