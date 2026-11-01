import type { Board } from '../types/furniture'
import { getMaterialById, materials } from '../data/materials'
import { validateBoard, cleanName } from '../utils/validateProject'

interface SketchResult {
  type?: unknown
  name?: unknown
  boards?: unknown
}

export interface SketchParseResult {
  name: string
  boards: Omit<Board, 'id'>[]
  /** One line per board that was left out, e.g. 'boards[2] "Seite": positionX "links" is not a number'. */
  skipped: string[]
}

/** Board fields as the model sends them, with their default when missing. */
const NUMBER_FIELDS = {
  width: 600, height: 400, depth: 18,
  positionX: 0, positionY: 0, positionZ: 0,
  rotationX: 0, rotationY: 0, rotationZ: 0
} as const
type NumberField = keyof typeof NUMBER_FIELDS

const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000 }

/**
 * A model value as a finite number: 600, "600", "600mm", "60 cm", "0.6 m"
 * (rotations: "90", "90°"). Anything else, Infinity included, is null.
 */
function toNumber(v: unknown, field: NumberField): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const isRotation = field.startsWith('rotation')
  const m = (isRotation ? /^\s*(-?\d+(?:\.\d+)?)\s*(°|deg)?\s*$/i : /^\s*(-?\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*$/i).exec(v)
  if (!m) return null
  return parseFloat(m[1]) * (isRotation ? 1 : MM_PER_UNIT[(m[2] ?? 'mm').toLowerCase()])
}

/**
 * Parse VLM JSON response into Board objects.
 * Every board goes through the same validation as a project file (validateBoard),
 * so nothing the autosave could not load again reaches the store. Boards with a
 * value that is not a number are skipped and reported in `skipped`.
 */
export function parseSketchResponse(response: string): SketchParseResult {
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

  const parsed: SketchResult | null = JSON.parse(jsonStr)

  if (!parsed || !Array.isArray(parsed.boards)) {
    throw new Error('No boards found in VLM response')
  }

  const boards: Omit<Board, 'id'>[] = []
  const skipped: string[] = []
  parsed.boards.forEach((sb: unknown, i) => {
    const path = `boards[${i}]`
    try {
      boards.push(toBoard(sb, path))
    } catch (err) {
      const label = typeof sb === 'object' && sb !== null && 'name' in sb ? ` "${cleanName(sb.name, '?')}"` : ''
      const reason = err instanceof Error ? err.message.replace(`${path}.`, '') : String(err)
      skipped.push(`${path}${label}: ${reason}`)
    }
  })

  return { name: cleanName(parsed.name, cleanName(parsed.type, 'Import')), boards, skipped }
}

function toBoard(raw: unknown, path: string): Omit<Board, 'id'> {
  if (typeof raw !== 'object' || raw === null) throw new Error('not an object')
  const sb = raw as Record<string, unknown>
  const num = {} as Record<NumberField, number>
  for (const field of Object.keys(NUMBER_FIELDS) as NumberField[]) {
    const v = sb[field]
    const n = v === undefined || v === null ? NUMBER_FIELDS[field] : toNumber(v, field)
    if (n === null) throw new Error(`${field} ${typeof v === 'string' ? JSON.stringify(v) : String(v)} is not a number`)
    num[field] = n
  }

  // Find matching material or default to spanplatte
  const materialId = findMaterialId(typeof sb.material === 'string' ? sb.material : 'spanplatte')
  const mat = getMaterialById(materialId) || materials[0]

  // validateBoard enforces the size limits and cleans the name; it adds an id we do not want here
  const { id: _id, ...board } = validateBoard({
    name: sb.name,
    width: clamp(num.width, 10, 10000),
    height: clamp(num.height, 10, 10000),
    depth: clamp(num.depth, 3, 10000),
    position: { x: num.positionX, y: num.positionY, z: num.positionZ },
    rotation: { x: num.rotationX, y: num.rotationY, z: num.rotationZ },
    materialId: mat.id,
    color: mat.color
  }, path)
  return board
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
