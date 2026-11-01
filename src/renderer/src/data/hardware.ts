import type { AttachedHardware } from '../types/furniture'

export type HardwareCategory = 'hinges' | 'slides' | 'shelfPins' | 'handles' | 'camLocks'

export interface HardwareItem {
  id: string
  category: HardwareCategory
  name: string
  nameEn: string
  manufacturer: string
  /** Diameter of cup/mounting hole in mm */
  drillingDiameter?: number
  /** Cup depth for hinges (mm) */
  cupDepth?: number
  /** Opening angle for hinges (degrees) */
  openingAngle?: number
  /** Total length in mm */
  length?: number
  /** Width in mm */
  width?: number
  /** Load capacity in kg */
  loadCapacityKg?: number
  /** Extension type: full / partial */
  extensionType?: 'full' | 'partial'
  /** Typical unit price EUR */
  unitPrice: number
}

export const hardwareItems: HardwareItem[] = [
  // Topfscharniere
  {
    id: 'blum-clip-top-107',
    category: 'hinges',
    name: 'Blum CLIP top 107°',
    nameEn: 'Blum CLIP top 107°',
    manufacturer: 'Blum',
    drillingDiameter: 35,
    cupDepth: 12.5,
    openingAngle: 107,
    unitPrice: 3.20
  },
  {
    id: 'blum-clip-top-110',
    category: 'hinges',
    name: 'Blum CLIP top 110°',
    nameEn: 'Blum CLIP top 110°',
    manufacturer: 'Blum',
    drillingDiameter: 35,
    cupDepth: 12.5,
    openingAngle: 110,
    unitPrice: 3.50
  },
  {
    id: 'hettich-sensys-110',
    category: 'hinges',
    name: 'Hettich Sensys 110°',
    nameEn: 'Hettich Sensys 110°',
    manufacturer: 'Hettich',
    drillingDiameter: 35,
    cupDepth: 11,
    openingAngle: 110,
    unitPrice: 4.80
  },
  {
    id: 'grass-tiomos-110',
    category: 'hinges',
    name: 'Grass Tiomos 110°',
    nameEn: 'Grass Tiomos 110°',
    manufacturer: 'Grass',
    drillingDiameter: 35,
    cupDepth: 11.5,
    openingAngle: 110,
    unitPrice: 4.20
  },
  // Schubladensysteme
  {
    id: 'blum-tandem-450',
    category: 'slides',
    name: 'Blum TANDEM 450mm',
    nameEn: 'Blum TANDEM 450mm',
    manufacturer: 'Blum',
    length: 450,
    loadCapacityKg: 30,
    extensionType: 'full',
    unitPrice: 18.50
  },
  {
    id: 'blum-tandem-500',
    category: 'slides',
    name: 'Blum TANDEM 500mm',
    nameEn: 'Blum TANDEM 500mm',
    manufacturer: 'Blum',
    length: 500,
    loadCapacityKg: 30,
    extensionType: 'full',
    unitPrice: 19.80
  },
  {
    id: 'grass-nova-pro-500',
    category: 'slides',
    name: 'Grass Nova Pro 500mm',
    nameEn: 'Grass Nova Pro 500mm',
    manufacturer: 'Grass',
    length: 500,
    loadCapacityKg: 40,
    extensionType: 'full',
    unitPrice: 22.00
  },
  {
    id: 'hettich-arcitech-500',
    category: 'slides',
    name: 'Hettich ArciTech 500mm',
    nameEn: 'Hettich ArciTech 500mm',
    manufacturer: 'Hettich',
    length: 500,
    loadCapacityKg: 50,
    extensionType: 'full',
    unitPrice: 25.00
  },
  // Regalbodenträger
  {
    id: 'shelf-pin-5mm',
    category: 'shelfPins',
    name: 'Regalbodenträger 5mm',
    nameEn: 'Shelf Pin 5mm',
    manufacturer: 'Generic',
    drillingDiameter: 5,
    loadCapacityKg: 20,
    unitPrice: 0.15
  },
  {
    id: 'shelf-pin-5mm-chrome',
    category: 'shelfPins',
    name: 'Regalbodenträger 5mm verchromt',
    nameEn: 'Shelf Pin 5mm Chrome',
    manufacturer: 'Generic',
    drillingDiameter: 5,
    loadCapacityKg: 25,
    unitPrice: 0.25
  },
  // Griffe
  {
    id: 'griff-bar-128',
    category: 'handles',
    name: 'Bügelgriff 128mm Lochab.',
    nameEn: 'Bar Handle 128mm CC',
    manufacturer: 'Generic',
    length: 160,
    width: 12,
    drillingDiameter: 4,
    unitPrice: 2.80
  },
  {
    id: 'griff-bar-160',
    category: 'handles',
    name: 'Bügelgriff 160mm Lochab.',
    nameEn: 'Bar Handle 160mm CC',
    manufacturer: 'Generic',
    length: 192,
    width: 12,
    drillingDiameter: 4,
    unitPrice: 3.20
  },
  {
    id: 'griff-blende',
    category: 'handles',
    name: 'Griffblende 450mm',
    nameEn: 'Recessed Handle 450mm',
    manufacturer: 'Generic',
    length: 450,
    width: 30,
    unitPrice: 6.50
  },
  // Exzenterverbinder (Cam locks)
  {
    id: 'rafix-20',
    category: 'camLocks',
    name: 'Rafix 20 Exzenterverbinder',
    nameEn: 'Rafix 20 Cam Lock',
    manufacturer: 'Hettich',
    drillingDiameter: 20,
    unitPrice: 1.20
  },
  {
    id: 'minifix-15',
    category: 'camLocks',
    name: 'Minifix 15 Exzenterverbinder',
    nameEn: 'Minifix 15 Cam Lock',
    manufacturer: 'Blum',
    drillingDiameter: 15,
    unitPrice: 0.95
  }
]

export function getHardwareByCategory(cat: HardwareCategory): HardwareItem[] {
  return hardwareItems.filter((h) => h.category === cat)
}

// ── Hinge layout (shared by the hinge calculator and the boring list) ──────

/** Cup centre from the door edge: Ø35 cup + 3–6 mm boring distance gives
 *  21.5–23.5 mm; 22 mm is the usual default (Blum, Hettich, Grass). */
export const HINGE_CUP_EDGE_MM = 22
/** More hinges than this on one door is a data error, not a layout. */
export const MAX_HINGES_PER_DOOR = 10

/** Cup centre distance from the door's top and bottom edge. */
export function hingeEdgeMarginMm(doorHeightMm: number): number {
  return Math.min(doorHeightMm / 2, Math.max(50, Math.min(100, doorHeightMm * 0.15)))
}

/** Cup centre positions along the door height (mm from one end), evenly spread
 *  between the two edge margins; the count is clamped to 0…MAX_HINGES_PER_DOOR. */
export function hingePositionsMm(doorHeightMm: number, count: number): number[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.min(MAX_HINGES_PER_DOOR, Math.floor(count))) : 0
  if (n === 0 || !(doorHeightMm > 0)) return []
  if (n === 1) return [Math.round(doorHeightMm / 2)]
  const margin = hingeEdgeMarginMm(doorHeightMm)
  const step = (doorHeightMm - 2 * margin) / (n - 1)
  return Array.from({ length: n }, (_, i) => Math.round(margin + i * step))
}

/** The board's hardware with every hinge replaced by `quantity` × `hardwareId`: one hinge
 *  type per door, so switching systems in the calculator never doubles the cups. */
export function withHinges(list: AttachedHardware[] | undefined, hardwareId: string, quantity: number): AttachedHardware[] {
  const hinge = (id: string): boolean => hardwareItems.some((h) => h.id === id && h.category === 'hinges')
  const n = Number.isFinite(quantity) ? Math.max(1, Math.min(MAX_HINGES_PER_DOOR, Math.round(quantity))) : 1
  return [...(list ?? []).filter((h) => !hinge(h.hardwareId)), { hardwareId, quantity: n }]
}
