import type {
  Assembly, AssemblyStep, Board, BoardRole, FastenerType, HeadType, Joint, JointType, Project
} from '../types/furniture'
import { activeAssemblies, activeJoints } from './activeParts'
import { assemblyPath } from './assemblyTree'
import { boardFace } from './boardFace'
import { cuttingDims } from './cuttingDims'
import { worldAligned } from './projection'

/**
 * Assembly instruction (Montage): ordered steps, each installing some boards.
 * Only the boards are stored per step; everything else is derived here, so it
 * can never go stale — a joint belongs to the step in which the second of its
 * two boards is installed (that is when it can be made), and the fasteners of a
 * step are those of its joints. Like every list, only visible assemblies count.
 */

const NO_STEPS = new Map<string, number>()
const indexCache = new WeakMap<AssemblyStep[], Map<string, number>>()

/** Step index of every planned board (a board counts in its first step); cached per steps array. */
export function stepIndexOf(steps: AssemblyStep[] | undefined): Map<string, number> {
  if (!steps || steps.length === 0) return NO_STEPS
  let index = indexCache.get(steps)
  if (!index) {
    index = new Map()
    steps.forEach((s, i) => { for (const id of s.boardIds) if (!index!.has(id)) index!.set(id, i) })
    indexCache.set(steps, index)
  }
  return index
}

/** How a board shows in the step view: as usual (no steps), installed earlier, installed now, or not yet. */
export type StepState = 'normal' | 'earlier' | 'current' | 'hidden'

/** The state of a board while step `current` is shown (current < 0: no step view). Unplanned boards are hidden. */
export function boardStepState(steps: AssemblyStep[] | undefined, current: number, boardId: string): StepState {
  if (!steps || steps.length === 0 || current < 0) return 'normal'
  const i = stepIndexOf(steps).get(boardId)
  if (i === undefined || i > current) return 'hidden'
  return i === current ? 'current' : 'earlier'
}

/**
 * Steps checked against the project's boards: unknown ids go, and a board stays only
 * in the first step that lists it. The same array when nothing had to change.
 */
export function cleanSteps(steps: AssemblyStep[], boardIds: ReadonlySet<string>): AssemblyStep[] {
  const seen = new Set<string>()
  let changed = false
  const out = steps.map((s) => {
    const ids = s.boardIds.filter((id) => {
      const ok = boardIds.has(id) && !seen.has(id)
      seen.add(id)
      return ok
    })
    if (ids.length === s.boardIds.length) return s
    changed = true
    return { ...s, boardIds: ids }
  })
  return changed ? out : steps
}

export interface PlacedBoard {
  board: Board
  assemblyId: string
}

export interface PlannedStep {
  step: AssemblyStep
  index: number
  /** Boards of the step in visible assemblies, in the step's order */
  boards: PlacedBoard[]
  /** Joints made in this step: the later of their two boards is installed here */
  joints: Joint[]
}

export interface AssemblyPlan {
  steps: PlannedStep[]
  /** Boards in visible assemblies that are in no step */
  unplanned: PlacedBoard[]
  /** Joints with a board that is in no step */
  unplannedJoints: Joint[]
}

/** The steps with what each one installs and joins (visible assemblies only). */
export function planAssembly(project: Project): AssemblyPlan {
  const steps = project.assemblySteps ?? []
  const placed = new Map<string, PlacedBoard>()
  for (const a of treeOrder(activeAssemblies(project))) for (const b of a.boards) placed.set(b.id, { board: b, assemblyId: a.id })
  const index = stepIndexOf(steps)
  const planned: PlannedStep[] = steps.map((step, i) => ({
    step,
    index: i,
    boards: step.boardIds.flatMap((id) => {
      const p = placed.get(id)
      return p && index.get(id) === i ? [p] : []
    }),
    joints: []
  }))
  const unplannedJoints: Joint[] = []
  for (const { joint } of activeJoints(project)) {
    const a = index.get(joint.boardA)
    const b = index.get(joint.boardB)
    if (a === undefined || b === undefined) unplannedJoints.push(joint)
    else planned[Math.max(a, b)].joints.push(joint)
  }
  return {
    steps: planned,
    unplanned: [...placed.values()].filter((p) => !index.has(p.board.id)),
    unplannedJoints
  }
}

export type FastenerLine =
  | { kind: 'fastener'; type: FastenerType; diameter: number; length: number; headType: HeadType; qty: number; note?: string }
  /** A joint without fasteners (glued, a groove …), counted by joint type */
  | { kind: 'joint'; jointType: JointType; qty: number; note?: string }

/**
 * Fasteners of the joints, summed by type, size and head — per joint note too with
 * `withNotes` ("26 × wood screw 4 × 40, pre-drilled"). Joints without fasteners
 * count by joint type. Sorted: fasteners by type and size, then the joints.
 */
export function fastenerLines(joints: Joint[], withNotes = true): FastenerLine[] {
  const lines = new Map<string, FastenerLine>()
  for (const j of joints) {
    const note = (withNotes && j.note?.trim()) || undefined
    const fasteners = j.fasteners.filter((f) => f.quantity > 0)
    if (fasteners.length === 0) {
      const key = `j|${j.type}|${note ?? ''}`
      const prev = lines.get(key)
      lines.set(key, prev ? { ...prev, qty: prev.qty + 1 } : { kind: 'joint', jointType: j.type, qty: 1, note })
      continue
    }
    for (const f of fasteners) {
      const key = `f|${f.type}|${f.diameter}|${f.length}|${f.headType}|${note ?? ''}`
      const prev = lines.get(key)
      lines.set(key, prev
        ? { ...prev, qty: prev.qty + f.quantity }
        : { kind: 'fastener', type: f.type, diameter: f.diameter, length: f.length, headType: f.headType, qty: f.quantity, note })
    }
  }
  const rank = (l: FastenerLine): string => l.kind === 'fastener'
    ? `0|${l.type}|${String(l.diameter).padStart(8, '0')}|${String(l.length).padStart(8, '0')}|${l.headType}|${l.note ?? ''}`
    : `1|${l.jointType}|${l.note ?? ''}`
  return [...lines.values()].sort((a, b) => rank(a).localeCompare(rank(b)))
}

export interface PartLine {
  name: string
  materialId: string
  role?: BoardRole
  /** Cut size: longer face side, shorter face side, thickness (utils/cuttingDims) */
  length: number
  width: number
  thickness: number
  qty: number
  boardIds: string[]
}

/** Boards summed by name, material, role and cut size, in first-seen order. */
export function partLines(boards: Board[]): PartLine[] {
  const lines = new Map<string, PartLine>()
  for (const b of boards) {
    const d = cuttingDims(b)
    const key = `${b.name}|${b.materialId}|${b.role ?? ''}|${d.length}|${d.width}|${d.thickness}`
    const prev = lines.get(key)
    if (prev) { prev.qty++; prev.boardIds.push(b.id) }
    else lines.set(key, { name: b.name, materialId: b.materialId, role: b.role, length: d.length, width: d.width, thickness: d.thickness, qty: 1, boardIds: [b.id] })
  }
  return [...lines.values()]
}

/** Assemblies depth-first in tree order (siblings in array order), as the assembly drawer lists them. */
export function treeOrder(assemblies: Assembly[]): Assembly[] {
  const ids = new Set(assemblies.map((a) => a.id))
  const children = new Map<string | undefined, Assembly[]>()
  for (const a of assemblies) {
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : undefined
    children.set(parent, [...(children.get(parent) ?? []), a])
  }
  const out: Assembly[] = []
  const seen = new Set<string>()
  const visit = (parent: string | undefined): void => {
    for (const a of children.get(parent) ?? []) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      out.push(a)
      visit(a.id)
    }
  }
  visit(undefined)
  return [...out, ...assemblies.filter((a) => !seen.has(a.id))]   // a cycle would be cut off: keep those too
}

/** What a suggested step is about; the caller turns it into a title in the UI language. */
export type SuggestedStepKind =
  | 'back' | 'substructure' | 'carcass' | 'endPanels' | 'worktop' | 'appliance' | 'drawer' | 'fronts' | 'plinth' | 'other'

/**
 * A first order of steps from the part roles, the way a kitchen goes up. A back panel
 * is always fixed to something already built: with a substructure (frame construction)
 * it is substructure, back panels, then the carcass of each assembly (in tree order);
 * without one, the carcasses first and the back panels onto them. Then end panels and
 * covers, worktop, appliances, drawer boxes, fronts, plinth. A visible part facing forward
 * (thin along the depth) counts as a front, any other as an end panel or cover.
 * Parts without a role follow at the end, one step per assembly. Empty steps are left out.
 */
export function suggestSteps(
  project: Project,
  title: (kind: SuggestedStepKind, assemblyPath?: string) => string,
  newId: () => string = () => crypto.randomUUID()
): AssemblyStep[] {
  const assemblies = treeOrder(activeAssemblies(project))
  const single = new Map<SuggestedStepKind, string[]>()
  const perAssembly = { carcass: new Map<string, string[]>(), other: new Map<string, string[]>() }
  const add = (map: Map<string, string[]>, key: string, id: string): void => { map.set(key, [...(map.get(key) ?? []), id]) }
  for (const a of assemblies) {
    for (const b of a.boards) {
      const kind = kindOf(b)
      if (kind === 'carcass' || kind === 'other') add(perAssembly[kind], a.id, b.id)
      else add(single as Map<string, string[]>, kind, b.id)
    }
  }
  const step = (kind: SuggestedStepKind, boardIds: string[], path?: string): AssemblyStep =>
    ({ id: newId(), title: title(kind, path), boardIds })
  const singles = (kinds: SuggestedStepKind[]): AssemblyStep[] =>
    kinds.flatMap((k) => (single.get(k)?.length ? [step(k, single.get(k)!)] : []))
  const grouped = (kind: 'carcass' | 'other'): AssemblyStep[] =>
    [...perAssembly[kind]].map(([id, boardIds]) => step(kind, boardIds, assemblyPath(project.assemblies, id)))
  const frame = (single.get('substructure')?.length ?? 0) > 0
  return [
    ...(frame
      ? [...singles(['substructure', 'back']), ...grouped('carcass')]
      : [...grouped('carcass'), ...singles(['back'])]),
    ...singles(['endPanels', 'worktop', 'appliance', 'drawer', 'fronts', 'plinth']),
    ...grouped('other')
  ]
}

function kindOf(b: Board): SuggestedStepKind {
  switch (b.role) {
    case 'back': case 'substructure': case 'carcass': case 'worktop': case 'appliance': case 'drawer': case 'plinth':
      return b.role
    case 'visible':
      return boardFace(worldAligned(b)).thicknessAxis === 'depth' ? 'fronts' : 'endPanels'
    default:
      return 'other'
  }
}
