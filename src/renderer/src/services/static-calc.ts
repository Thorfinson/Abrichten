import type { Material, MaterialCategory } from '../types/furniture'

export type StaticRating = 'ok' | 'warning' | 'critical'

export interface StaticResult {
  deflectionMm: number
  allowableDeflectionMm: number
  minThicknessMm: number       // with 20% safety
  currentThicknessMm: number
  safetyFactor: number
  rating: StaticRating
  isStone: boolean
  stoneNeedsSupport: boolean
}

/**
 * Calculate shelf/board deflection and minimum thickness.
 *
 * Uses simple beam theory: single point load at center, both ends supported.
 *   δ = (F × L³) / (48 × E × I)
 *   I = (b × h³) / 12
 *
 * Safety margin: 20% added to minimum thickness calculation.
 */
export function calculateStatic(
  spanMm: number,
  widthMm: number,
  thicknessMm: number,
  loadKg: number,
  material: Material
): StaticResult {
  const isStone = material.category === 'stone'

  // Stone special case: must be fully supported
  if (isStone) {
    return {
      deflectionMm: 0,
      allowableDeflectionMm: 0,
      minThicknessMm: thicknessMm,
      currentThicknessMm: thicknessMm,
      safetyFactor: 1,
      rating: spanMm > widthMm * 0.5 ? 'critical' : 'ok',
      isStone: true,
      stoneNeedsSupport: spanMm > 300 // if span > 300mm, needs continuous support
    }
  }

  const F = loadKg * 9.81 // N
  const L = spanMm
  const b = widthMm
  const h = thicknessMm
  const E = material.eModul

  // Moment of inertia
  const I = (b * Math.pow(h, 3)) / 12

  // Deflection at center
  const deflection = (F * Math.pow(L, 3)) / (48 * E * I)

  // Allowable deflection: L/300
  const allowableDeflection = L / 300

  // Minimum thickness with 20% safety
  // h_min = cbrt((F × L³ × 1.2) / (48 × E × b × δ_zul))
  const deltaAllowed = L / 300
  const hMin = Math.pow(
    (F * Math.pow(L, 3) * 1.2) / (48 * E * b * deltaAllowed),
    1 / 3
  )

  // Safety factor
  const safetyFactor = allowableDeflection > 0 ? allowableDeflection / deflection : Infinity

  // Rating
  let rating: StaticRating = 'ok'
  if (deflection > L / 200) {
    rating = 'critical'
  } else if (deflection > L / 300) {
    rating = 'warning'
  }

  return {
    deflectionMm: Math.round(deflection * 100) / 100,
    allowableDeflectionMm: Math.round(allowableDeflection * 100) / 100,
    minThicknessMm: Math.ceil(hMin),
    currentThicknessMm: thicknessMm,
    safetyFactor: Math.round(safetyFactor * 100) / 100,
    rating,
    isStone: false,
    stoneNeedsSupport: false
  }
}
