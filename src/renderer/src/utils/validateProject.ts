import type {
  Project, Assembly, Board, BoardCutout, Joint, JointType, Fastener, FastenerType, HeadType, FastenerMaterial,
  AttachedHardware, Vec3, GrainDirection, Material, MaterialCategory, CustomHardwareItem, PlacedLoad, AssemblyStep
} from '../types/furniture'
import { cleanSteps } from './assemblySteps'
import { sanitizeParents } from './assemblyTree'
import { isBoardRole } from './boardRole'
import { cleanShortName, isPartNo, numberParts } from './partLabel'
import { isParamName } from './formulaEval'

/** Largest accepted size or |position| in mm (100 m). Beyond it the boring and nesting loops blow up. */
export const MAX_MM = 100_000
/** Largest accepted piece count for attached hardware and fasteners. */
export const MAX_QUANTITY = 1_000
/** Largest accepted payload per board in kg (load simulation). */
export const MAX_LOAD_KG = 1_000
/** Most loads placed on one board (load simulation). */
export const MAX_LOADS_PER_BOARD = 50
/** A placed load may reach this far past the face edge (rounding of a resized board), mm. */
const LOAD_EDGE_TOLERANCE_MM = 0.5

const JOINT_TYPES: readonly JointType[] = ['butt', 'miter', 'dado', 'rabbet', 'dowel', 'biscuit', 'screw', 'pocket_screw', 'dovetail', 'lap', 'glued']
const FASTENER_TYPES: readonly FastenerType[] = ['wood_screw', 'confirmat', 'dowel_pin', 'biscuit', 'pocket_screw', 'angle_bracket', 'joist_hanger', 'nail']
const HEAD_TYPES: readonly HeadType[] = ['countersunk', 'pan', 'hex']
const FASTENER_MATERIALS: readonly FastenerMaterial[] = ['steel', 'stainless', 'brass']
const GRAIN_DIRECTIONS: readonly GrainDirection[] = ['width', 'height', 'depth']
const MATERIAL_CATEGORIES: readonly MaterialCategory[] = ['solid_wood', 'panel', 'stone', 'glass', 'metal']
/** Colours end up in style={{ background }}; hex only, so no url(…) or other CSS gets through. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
/** C0/C1 control characters and Unicode line separators: a newline in a name would inject DXF entities. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g

/**
 * Trust-boundary check for project data coming from disk or IndexedDB.
 * Required geometry must be sane or we throw (with a reason); optional
 * collections are sanitised so nothing non-array / non-finite / oversized
 * reaches the render path. Names are single-line strings. Unknown fields are
 * passed through on purpose (forward compatibility). Joints may reference
 * boards in any assembly, so they are validated in a second pass against the
 * project-wide board ids.
 * ponytail: hand-rolled shape check; swap for zod if it grows.
 */
export function validateProject(raw: unknown): Project {
  if (!isRecord(raw)) throw new Error('root is not an object')
  if (!Array.isArray(raw.assemblies)) throw new Error('"assemblies" missing')
  const parsed = raw.assemblies.map((a, i) => validateAssembly(a, `assemblies[${i}]`))
  const boardIds = new Set(parsed.flatMap(({ assembly }) => assembly.boards.map((b) => b.id)))
  // every part gets its number (older files: 1, 2, 3 … per assembly in list order)
  const assemblies = numberParts(sanitizeParents(parsed.map(({ assembly, rawJoints }) => ({
    ...assembly,
    joints: rawJoints.flatMap((j) => validateJoint(j, boardIds))
  }))))
  return {
    ...raw,
    id: str(raw.id, crypto.randomUUID()),
    name: cleanName(raw.name, 'Projekt'),
    displayUnit: raw.displayUnit === 'cm' || raw.displayUnit === 'm' ? raw.displayUnit : 'mm',
    language: raw.language === 'en' ? 'en' : 'de',
    createdAt: str(raw.createdAt, new Date().toISOString()),
    updatedAt: str(raw.updatedAt, new Date().toISOString()),
    assemblies,
    assemblySteps: Array.isArray(raw.assemblySteps) ? validateSteps(raw.assemblySteps, boardIds) : undefined,
    parameters: numberRecord(raw.parameters, isParamName),
    materialPrices: numberRecord(raw.materialPrices),
    customMaterials: Array.isArray(raw.customMaterials) ? raw.customMaterials.flatMap(validateMaterial) : undefined,
    customHardware: Array.isArray(raw.customHardware) ? raw.customHardware.flatMap(validateHardwareItem) : undefined,
    laborHours: optNum(raw.laborHours),
    laborRate: optNum(raw.laborRate),
    overheadPct: optNum(raw.overheadPct)
  }
}

function validateAssembly(a: unknown, path: string): { assembly: Assembly; rawJoints: unknown[] } {
  if (!isRecord(a)) throw new Error(`${path} is not an object`)
  if (!Array.isArray(a.boards)) throw new Error(`${path}.boards missing`)
  const boards = a.boards.map((b, i) => validateBoard(b, `${path}.boards[${i}]`))
  return {
    assembly: {
      ...a,
      id: str(a.id, crypto.randomUUID()),
      name: cleanName(a.name, 'Baugruppe'),
      visible: a.visible !== false,
      shortName: cleanShortName(a.shortName) || undefined,
      boards,
      joints: []
    },
    rawJoints: Array.isArray(a.joints) ? a.joints : []
  }
}

/** Validates one board; throws with `path` in the message. Also used for AI-imported boards. */
export function validateBoard(b: unknown, path: string): Board {
  if (!isRecord(b)) throw new Error(`${path} is not an object`)
  for (const dim of ['width', 'height', 'depth'] as const) {
    if (!isDimension(b[dim])) throw new Error(`${path}.${dim} must be a positive number up to ${MAX_MM} mm`)
  }
  if (!isVec3(b.position) || !isBoundedVec3(b.position)) throw new Error(`${path}.position must be finite and within ±${MAX_MM} mm`)
  return {
    ...b,
    id: str(b.id, crypto.randomUUID()),
    name: cleanName(b.name, 'Brett'),
    width: b.width as number,
    height: b.height as number,
    depth: b.depth as number,
    position: b.position,
    rotation: isVec3(b.rotation) ? b.rotation : { x: 0, y: 0, z: 0 },
    materialId: str(b.materialId, 'spanplatte'),
    color: color(b.color, '#D2B48C'),
    grainDirection: GRAIN_DIRECTIONS.includes(b.grainDirection as GrainDirection) ? (b.grainDirection as GrainDirection) : undefined,
    role: isBoardRole(b.role) ? b.role : undefined,
    partNo: isPartNo(b.partNo) ? b.partNo : undefined,
    edgeBanding: isRecord(b.edgeBanding) ? (b.edgeBanding as Board['edgeBanding']) : undefined,
    cutouts: Array.isArray(b.cutouts) ? b.cutouts.flatMap(validateCutout) : undefined,
    hardware: Array.isArray(b.hardware) ? b.hardware.filter(isHardware) : undefined,
    loadKg: isLoadKg(b.loadKg) ? b.loadKg : undefined,
    weightKg: isLoadKg(b.weightKg) ? b.weightKg : undefined,
    loads: Array.isArray(b.loads)
      ? b.loads.flatMap((l) => validatePlacedLoad(l, b.width as number, b.depth as number)).slice(0, MAX_LOADS_PER_BOARD)
      : undefined,
    widthFormula: optStr(b.widthFormula),
    heightFormula: optStr(b.heightFormula),
    depthFormula: optStr(b.depthFormula)
  }
}

/**
 * Assembly steps: unusable entries are dropped, ids made unique, titles single-line;
 * a board must exist and is kept only in the first step that lists it.
 */
function validateSteps(raw: unknown[], boardIds: Set<string>): AssemblyStep[] {
  const ids = new Set<string>()
  const steps = raw.flatMap((s, i): AssemblyStep[] => {
    if (!isRecord(s)) return []
    let id = str(s.id, crypto.randomUUID())
    if (ids.has(id)) id = crypto.randomUUID()
    ids.add(id)
    return [{
      ...s,
      id,
      title: cleanName(s.title, `Schritt ${i + 1}`),
      note: optStr(s.note) || undefined,
      boardIds: Array.isArray(s.boardIds) ? s.boardIds.filter((b): b is string => typeof b === 'string') : []
    }]
  })
  return cleanSteps(steps, boardIds)
}

/** Joints with unknown boards or no usable position are dropped rather than repaired. */
function validateJoint(j: unknown, boardIds: Set<string>): Joint[] {
  if (!isRecord(j) || typeof j.boardA !== 'string' || typeof j.boardB !== 'string') return []
  if (!boardIds.has(j.boardA) || !boardIds.has(j.boardB) || !isVec3(j.position)) return []
  return [{
    ...j,
    id: str(j.id, crypto.randomUUID()),
    type: JOINT_TYPES.includes(j.type as JointType) ? (j.type as JointType) : 'butt',
    boardA: j.boardA,
    boardB: j.boardB,
    position: j.position,
    fasteners: Array.isArray(j.fasteners) ? j.fasteners.flatMap(validateFastener) : [],
    note: optStr(j.note)
  }]
}

function validateFastener(f: unknown): Fastener[] {
  if (!isRecord(f) || !FASTENER_TYPES.includes(f.type as FastenerType)) return []
  if (!isBounded(f.diameter) || !isBounded(f.length) || !isQuantity(f.quantity)) return []
  return [{
    id: str(f.id, crypto.randomUUID()),
    type: f.type as FastenerType,
    diameter: f.diameter,
    length: f.length,
    quantity: f.quantity,
    headType: HEAD_TYPES.includes(f.headType as HeadType) ? (f.headType as HeadType) : 'countersunk',
    material: FASTENER_MATERIALS.includes(f.material as FastenerMaterial) ? (f.material as FastenerMaterial) : 'steel'
  }]
}

function validateCutout(c: unknown): BoardCutout[] {
  if (!isRecord(c) || !isBounded(c.x) || !isBounded(c.z) || !isBounded(c.width) || !isBounded(c.depth)) return []
  return [{ id: str(c.id, crypto.randomUUID()), x: c.x, z: c.z, width: c.width, depth: c.depth }]
}

/**
 * A load placed on the face of a board `width` × `depth`: finite numbers, 0 … MAX_LOAD_KG,
 * a patch with a size, inside the face. Anything else is dropped, not repaired.
 */
function validatePlacedLoad(l: unknown, width: number, depth: number): PlacedLoad[] {
  if (!isRecord(l) || !isBounded(l.x) || !isBounded(l.z) || !isLoadKg(l.kg) || !isDimension(l.w) || !isDimension(l.d)) return []
  const tol = LOAD_EDGE_TOLERANCE_MM
  if (l.x < -tol || l.z < -tol || l.x + l.w > width + tol || l.z + l.d > depth + tol) return []
  return [{ id: str(l.id, crypto.randomUUID()), x: l.x, z: l.z, kg: l.kg, w: l.w, d: l.d }]
}

/** Custom materials need an id; every other field is typed (defaults as in the Materials panel). */
function validateMaterial(m: unknown): Material[] {
  if (!isRecord(m) || typeof m.id !== 'string') return []
  const de = cleanName(m.name, m.id)
  const thickness = Array.isArray(m.defaultThickness) ? m.defaultThickness.filter(isDimension) : []
  return [{
    ...m,
    id: m.id,
    name: de,
    nameEn: cleanName(m.nameEn, de),
    category: MATERIAL_CATEGORIES.includes(m.category as MaterialCategory) ? (m.category as MaterialCategory) : 'panel',
    density: isPositive(m.density) ? m.density : 750,
    eModul: isPositive(m.eModul) ? m.eModul : 10000,
    bendingStrength: isPositive(m.bendingStrength) ? m.bendingStrength : 80,
    compressiveStrength: isPositive(m.compressiveStrength) ? m.compressiveStrength : undefined,
    defaultThickness: thickness.length ? thickness : [18],
    color: color(m.color, '#C8A882'),
    grain: m.grain === true
  }]
}

function validateHardwareItem(h: unknown): CustomHardwareItem[] {
  if (!isRecord(h) || typeof h.id !== 'string') return []
  const de = cleanName(h.name, h.id)
  return [{
    ...h,
    id: h.id,
    name: de,
    nameEn: cleanName(h.nameEn, de),
    category: str(h.category, 'hinges'),
    drillingDiameter: isDimension(h.drillingDiameter) ? h.drillingDiameter : undefined,
    unitPrice: isFiniteNum(h.unitPrice) && h.unitPrice >= 0 ? h.unitPrice : 0,
    manufacturer: cleanName(h.manufacturer, '') || undefined
  }]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v: unknown): v is number => isFiniteNum(v) && v > 0
const isBounded = (v: unknown): v is number => isFiniteNum(v) && Math.abs(v) <= MAX_MM
/** A usable board size in mm: positive and at most MAX_MM. */
export const isDimension = (v: unknown): v is number => isPositive(v) && v <= MAX_MM
const isQuantity = (v: unknown): v is number => isFiniteNum(v) && v >= 0 && v <= MAX_QUANTITY
/** A usable per-board payload in kg: 0 … MAX_LOAD_KG. */
export const isLoadKg = (v: unknown): v is number => isFiniteNum(v) && v >= 0 && v <= MAX_LOAD_KG
const isVec3 = (v: unknown): v is Vec3 => isRecord(v) && ['x', 'y', 'z'].every((k) => isFiniteNum(v[k]))
const isBoundedVec3 = (v: Vec3): boolean => isBounded(v.x) && isBounded(v.y) && isBounded(v.z)
const isHardware = (h: unknown): h is AttachedHardware => isRecord(h) && typeof h.hardwareId === 'string' && isQuantity(h.quantity)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback)
/** A single-line display name: control characters become one space; empty or non-string → fallback. */
export const cleanName = (v: unknown, fallback: string): string =>
  (typeof v === 'string' && v.replace(CONTROL_CHARS, ' ').trim()) || fallback
const color = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX_COLOR.test(v) ? v : fallback)
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const optNum = (v: unknown): number | undefined => (isFiniteNum(v) ? v : undefined)
const numberRecord = (v: unknown, keyOk: (k: string) => boolean = () => true): Record<string, number> | undefined =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).filter(([k, n]) => keyOk(k) && isFiniteNum(n))) as Record<string, number> : undefined
