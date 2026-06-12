import type { Board } from '../types/furniture'
import { getMaterialById, materials } from '../data/materials'

interface SketchBoard {
  name: string
  width: number
  height: number
  depth: number
  positionX?: number
  positionY?: number
  positionZ?: number
  rotationX?: number
  rotationY?: number
  rotationZ?: number
  material?: string
}

interface SketchResult {
  type: string
  name: string
  boards: SketchBoard[]
}

/**
 * Parse VLM JSON response into Board objects.
 */
export function parseSketchResponse(response: string): { name: string; boards: Omit<Board, 'id'>[] } {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = response.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  // Try to find JSON object in the response
  const objStart = jsonStr.indexOf('{')
  const objEnd = jsonStr.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    jsonStr = jsonStr.slice(objStart, objEnd + 1)
  }

  const parsed: SketchResult = JSON.parse(jsonStr)

  if (!parsed.boards || !Array.isArray(parsed.boards)) {
    throw new Error('No boards found in VLM response')
  }

  const boards: Omit<Board, 'id'>[] = parsed.boards.map((sb) => {
    // Find matching material or default to spanplatte
    const materialId = findMaterialId(sb.material || 'spanplatte')
    const mat = getMaterialById(materialId) || materials[0]

    return {
      name: sb.name || 'Brett',
      width: clamp(sb.width || 600, 10, 10000),
      height: clamp(sb.height || 400, 10, 10000),
      depth: clamp(sb.depth || 18, 3, 10000),
      position: {
        x: sb.positionX || 0,
        y: sb.positionY || 0,
        z: sb.positionZ || 0
      },
      rotation: {
        x: sb.rotationX || 0,
        y: sb.rotationY || 0,
        z: sb.rotationZ || 0
      },
      materialId: mat.id,
      color: mat.color
    }
  })

  return { name: parsed.name || parsed.type || 'Import', boards }
}

function findMaterialId(input: string): string {
  const lower = input.toLowerCase()
  const mappings: Record<string, string> = {
    spanplatte: 'spanplatte',
    chipboard: 'spanplatte',
    mdf: 'mdf',
    buche: 'buche',
    beech: 'buche',
    eiche: 'eiche',
    oak: 'eiche',
    fichte: 'fichte',
    spruce: 'fichte',
    birke: 'birke',
    birch: 'birke',
    kiefer: 'kiefer',
    pine: 'kiefer',
    multiplex: 'multiplex-birke',
    plywood: 'multiplex-birke',
    schiefer: 'schiefer',
    slate: 'schiefer',
    granit: 'granit',
    granite: 'granit'
  }
  for (const [key, id] of Object.entries(mappings)) {
    if (lower.includes(key)) return id
  }
  return 'spanplatte'
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
