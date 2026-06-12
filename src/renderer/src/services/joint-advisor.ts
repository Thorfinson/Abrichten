import type { Material, Board } from '../types/furniture'
import { findMatchingRules, type JointRecommendation } from '../data/joint-rules'
import { getMaterialById } from '../data/materials'

export interface JointAdvice {
  boardA: Board
  boardB: Board
  materialA: Material
  materialB: Material
  recommendations: JointRecommendation[]
}

/**
 * Get joint recommendations for connecting two boards.
 * Uses the thinner board's properties to drive the recommendation.
 */
export function getJointAdvice(boardA: Board, boardB: Board): JointAdvice | null {
  const materialA = getMaterialById(boardA.materialId)
  const materialB = getMaterialById(boardB.materialId)
  if (!materialA || !materialB) return null

  // Use the thinner of the two boards for rule matching
  const thinnerThickness = Math.min(boardA.depth, boardB.depth)

  // If one is stone, use stone rules
  if (materialA.category === 'stone' || materialB.category === 'stone') {
    const stoneRules = findMatchingRules('stone', thinnerThickness)
    const recs = stoneRules.flatMap(r => r.recommendations)
    return { boardA, boardB, materialA, materialB, recommendations: recs }
  }

  // Otherwise use the relevant material category
  const category = materialA.category === 'panel' || materialB.category === 'panel'
    ? 'panel'
    : 'solid_wood'

  const rules = findMatchingRules(category, thinnerThickness)
  const recommendations = rules
    .flatMap(r => r.recommendations)
    .sort((a, b) => a.priority - b.priority)

  // Deduplicate by joint type
  const seen = new Set<string>()
  const unique = recommendations.filter(r => {
    if (seen.has(r.jointType)) return false
    seen.add(r.jointType)
    return true
  })

  return { boardA, boardB, materialA, materialB, recommendations: unique }
}

/**
 * Estimate number of fasteners needed for a joint edge of given length.
 */
export function estimateFastenerCount(edgeLengthMm: number, spacingMm: number): number {
  if (spacingMm <= 0) return 0
  return Math.max(2, Math.ceil(edgeLengthMm / spacingMm) + 1)
}
