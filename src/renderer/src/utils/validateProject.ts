import type {
  Project, Assembly, Board, BoardCutout, Joint, JointType, Fastener, FastenerType, HeadType, FastenerMaterial,
  AttachedHardware, Vec3, GrainDirection
} from '../types/furniture'

const JOINT_TYPES: readonly JointType[] = ['butt', 'miter', 'dado', 'rabbet', 'dowel', 'biscuit', 'screw', 'pocket_screw', 'dovetail', 'lap', 'glued']
const FASTENER_TYPES: readonly FastenerType[] = ['wood_screw', 'confirmat', 'dowel_pin', 'biscuit', 'pocket_screw', 'angle_bracket', 'joist_hanger', 'nail']
const HEAD_TYPES: readonly HeadType[] = ['countersunk', 'pan', 'hex']
const FASTENER_MATERIALS: readonly FastenerMaterial[] = ['steel', 'stainless', 'brass']
const GRAIN_DIRECTIONS: readonly GrainDirection[] = ['width', 'height', 'depth']

/**
 * Trust-boundary check for project data coming from disk or IndexedDB.
 * Required geometry must be sane or we throw (with a reason); optional
 * collections are sanitised so nothing non-array / non-finite reaches the
 * render path. Joints may reference boards in any assembly, so they are
 * validated in a second pass against the project-wide board ids.
 * ponytail: hand-rolled shape check; swap for zod if it grows.
 */
export function validateProject(raw: unknown): Project {
  if (!isRecord(raw)) throw new Error('root is not an object')
  if (!Array.isArray(raw.assemblies)) throw new Error('"assemblies" missing')
  const parsed = raw.assemblies.map((a, i) => validateAssembly(a, `assemblies[${i}]`))
  const boardIds = new Set(parsed.flatMap(({ assembly }) => assembly.boards.map((b) => b.id)))
  const assemblies = parsed.map(({ assembly, rawJoints }) => ({
    ...assembly,
    joints: rawJoints.flatMap((j) => validateJoint(j, boardIds))
  }))
  return {
    ...raw,
    id: str(raw.id, crypto.randomUUID()),
    name: str(raw.name, 'Projekt'),
    displayUnit: raw.displayUnit === 'cm' || raw.displayUnit === 'm' ? raw.displayUnit : 'mm',
    language: raw.language === 'en' ? 'en' : 'de',
    createdAt: str(raw.createdAt, new Date().toISOString()),
    updatedAt: str(raw.updatedAt, new Date().toISOString()),
    assemblies,
    parameters: numberRecord(raw.parameters),
    materialPrices: numberRecord(raw.materialPrices),
    customMaterials: recordArray(raw.customMaterials) as Project['customMaterials'],
    customHardware: recordArray(raw.customHardware) as Project['customHardware'],
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
      name: str(a.name, 'Baugruppe'),
      visible: a.visible !== false,
      boards,
      joints: []
    },
    rawJoints: Array.isArray(a.joints) ? a.joints : []
  }
}

function validateBoard(b: unknown, path: string): Board {
  if (!isRecord(b)) throw new Error(`${path} is not an object`)
  for (const dim of ['width', 'height', 'depth'] as const) {
    if (!isPositive(b[dim])) throw new Error(`${path}.${dim} must be a positive number`)
  }
  if (!isVec3(b.position)) throw new Error(`${path}.position invalid`)
  return {
    ...b,
    id: str(b.id, crypto.randomUUID()),
    name: str(b.name, 'Brett'),
    width: b.width as number,
    height: b.height as number,
    depth: b.depth as number,
    position: b.position,
    rotation: isVec3(b.rotation) ? b.rotation : { x: 0, y: 0, z: 0 },
    materialId: str(b.materialId, 'spanplatte'),
    color: str(b.color, '#D2B48C'),
    grainDirection: GRAIN_DIRECTIONS.includes(b.grainDirection as GrainDirection) ? (b.grainDirection as GrainDirection) : undefined,
    edgeBanding: isRecord(b.edgeBanding) ? (b.edgeBanding as Board['edgeBanding']) : undefined,
    cutouts: Array.isArray(b.cutouts) ? b.cutouts.flatMap(validateCutout) : undefined,
    hardware: Array.isArray(b.hardware) ? b.hardware.filter(isHardware) : undefined,
    widthFormula: optStr(b.widthFormula),
    heightFormula: optStr(b.heightFormula),
    depthFormula: optStr(b.depthFormula)
  }
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
  if (!isFiniteNum(f.diameter) || !isFiniteNum(f.length) || !isFiniteNum(f.quantity)) return []
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
  if (!isRecord(c) || !isFiniteNum(c.x) || !isFiniteNum(c.z) || !isFiniteNum(c.width) || !isFiniteNum(c.depth)) return []
  return [{ id: str(c.id, crypto.randomUUID()), x: c.x, z: c.z, width: c.width, depth: c.depth }]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v: unknown): v is number => isFiniteNum(v) && v > 0
const isVec3 = (v: unknown): v is Vec3 => isRecord(v) && ['x', 'y', 'z'].every((k) => isFiniteNum(v[k]))
const isHardware = (h: unknown): h is AttachedHardware => isRecord(h) && typeof h.hardwareId === 'string' && isFiniteNum(h.quantity)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback)
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const optNum = (v: unknown): number | undefined => (isFiniteNum(v) ? v : undefined)
const numberRecord = (v: unknown): Record<string, number> | undefined =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => isFiniteNum(n))) as Record<string, number> : undefined
const recordArray = (v: unknown): Record<string, unknown>[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => isRecord(x) && typeof x.id === 'string') : undefined
