import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Project, Assembly, AssemblyStep, Board, BoardRole, Joint, Unit, Vec3, Material, CustomHardwareItem } from '../types/furniture'
import { validateProject, isDimension, cleanName, MAX_QUANTITY } from '../utils/validateProject'
import { isBoardRole } from '../utils/boardRole'
import { cleanSteps } from '../utils/assemblySteps'
import { subtreeIds } from '../utils/assemblyTree'
import { cleanShortName, defaultShortName, numberParts, renumberParts, shortNameOf } from '../utils/partLabel'
import { evalFormula, isParamName, formulaParams, renameFormulaParam } from '../utils/formulaEval'
import { designChanged, isDesignLocked, tellDesignLocked } from './designLock'
import { assemblyCounts } from '../utils/activeParts'
import { cleanBridgesMm } from '../data/hardware'
import { describeLoadChanges, type LoadChange } from '../utils/loadChanges'

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function now(): string {
  return new Date().toISOString()
}

/** Drop joints referencing any of the given boards (joints may span assemblies). */
function pruneJoints(a: Assembly, ids: Set<string>): Assembly {
  return a.joints.some((j) => ids.has(j.boardA) || ids.has(j.boardB))
    ? { ...a, joints: a.joints.filter((j) => !ids.has(j.boardA) && !ids.has(j.boardB)) }
    : a
}

/** Remove boards from an assembly together with any joint that referenced them. */
function withoutBoards(a: Assembly, ids: Set<string>): Assembly {
  return pruneJoints({ ...a, boards: a.boards.filter((b) => !ids.has(b.id)) }, ids)
}

// No-op guard: these helpers hand back the very same objects when nothing changes,
// so an action can return the unchanged state and no undo step is recorded.

/** The state with new assemblies, or the same state when the list is unchanged. */
function withAssemblies(s: ProjectState, assemblies: Assembly[]): ProjectState | Pick<ProjectState, 'project'> {
  return assemblies === s.project.assemblies ? s : { project: { ...s.project, updatedAt: now(), assemblies } }
}

/** `fn` applied to the assembly with `id`; the same list when it is missing or unchanged. */
function mapAssembly(list: Assembly[], id: string, fn: (a: Assembly) => Assembly): Assembly[] {
  const i = list.findIndex((a) => a.id === id)
  if (i < 0) return list
  const next = fn(list[i])
  return next === list[i] ? list : list.map((a, k) => (k === i ? next : a))
}

/** `fn` applied to every board (or only those in `ids`); the same assembly when none changed. */
function mapBoards(a: Assembly, fn: (b: Board) => Board, ids?: Set<string>): Assembly {
  const boards = a.boards.map((b) => (!ids || ids.has(b.id) ? fn(b) : b))
  return boards.every((b, i) => b === a.boards[i]) ? a : { ...a, boards }
}

/** `fn` applied to every board in the project; the same list when none changed. */
function mapAllBoards(list: Assembly[], fn: (b: Board) => Board): Assembly[] {
  const next = list.map((a) => mapBoards(a, fn))
  return next.every((a, i) => a === list[i]) ? list : next
}

/** The board with `updates` merged in, or the same board when every field already has that value. */
function patch(b: Board, updates: Partial<Board>): Board {
  return Object.entries(updates).every(([k, v]) => b[k as keyof Board] === v) ? b : { ...b, ...updates }
}

/** The state with these boards taken out of the assembly steps (a removed board leaves its step). */
function withoutStepBoards<T extends Pick<ProjectState, 'project'>>(next: T, ids: Set<string>): T {
  const steps = next.project.assemblySteps
  if (!steps?.some((st) => st.boardIds.some((id) => ids.has(id)))) return next
  const assemblySteps = steps.map((st) => (st.boardIds.some((id) => ids.has(id)) ? { ...st, boardIds: st.boardIds.filter((id) => !ids.has(id)) } : st))
  return { ...next, project: { ...next.project, assemblySteps } }
}

/** The state with new assembly steps, or the same state when the list is unchanged. */
function withSteps(s: ProjectState, assemblySteps: AssemblyStep[]): ProjectState | Pick<ProjectState, 'project'> {
  return assemblySteps === (s.project.assemblySteps ?? EMPTY_STEPS) ? s : { project: { ...s.project, updatedAt: now(), assemblySteps } }
}
const EMPTY_STEPS: AssemblyStep[] = []

/** `fn` applied to the step with `id`; the same list when it is missing or unchanged. */
function mapStep(list: AssemblyStep[], id: string, fn: (st: AssemblyStep) => AssemblyStep): AssemblyStep[] {
  const i = list.findIndex((st) => st.id === id)
  if (i < 0) return list
  const next = fn(list[i])
  return next === list[i] ? list : list.map((st, k) => (k === i ? next : st))
}

const allBoardIds = (p: Project): Set<string> => new Set(p.assemblies.flatMap((a) => a.boards.map((b) => b.id)))

const FORMULA_FIELDS = [['width', 'widthFormula'], ['height', 'heightFormula'], ['depth', 'depthFormula']] as const

/** Formula dimensions re-evaluated with `params`; a formula that gives no usable size keeps the current number. */
function evaluateFormulas(b: Board, params: Record<string, number>): Board {
  const updates: Partial<Board> = {}
  for (const [dim, key] of FORMULA_FIELDS) {
    const f = b[key]
    const v = f ? evalFormula(f, params) : null
    const mm = v === null ? null : Math.round(v * 10) / 10   // same rounding as the dimension input
    if (mm !== null && isDimension(mm)) updates[dim] = mm
  }
  return patch(b, updates)
}

/** `fn` applied to each formula string of the board; the same board when none changed. */
function mapFormulas(b: Board, fn: (formula: string) => string | undefined): Board {
  const updates: Partial<Board> = {}
  for (const [, key] of FORMULA_FIELDS) {
    const f = b[key]
    if (f) updates[key] = fn(f)
  }
  return patch(b, updates)
}

/** Joint with `updates` merged in, or the same joint when every field already has that value. */
function patchJoint(j: Joint, updates: Partial<Omit<Joint, 'id'>>): Joint {
  const same = Object.entries(updates).every(([k, v]) => JSON.stringify(j[k as keyof Joint]) === JSON.stringify(v))
  return same ? j : { ...j, ...updates }
}

interface ProjectState {
  project: Project
  /** The project as last loaded or saved; `project !== savedProject` means unsaved changes.
   *  Undo restores the very same object, so undoing back to it counts as clean. */
  savedProject: Project | null
  /** Marks the project as saved (after a successful file save): the given one, else the
   *  current one. Not an undo step. */
  markSaved: (project?: Project) => void

  // Project
  setProjectName: (name: string) => void
  setDisplayUnit: (unit: Unit) => void
  setLanguage: (lang: 'de' | 'en') => void
  /** Loads a project; returns what the validator changed in it (utils/loadChanges), empty when nothing */
  loadProject: (project: unknown) => LoadChange[]
  resetProject: () => void

  // Assembly
  addAssembly: (name: string, parentId?: string) => string
  /** Removes the assembly with everything nested below it. */
  removeAssembly: (id: string) => void
  renameAssembly: (id: string, name: string) => void
  /** Short word for the part labels ("Herd" → "Herd 2"); '' goes back to the first word of the name.
   *  False (and nothing changes) when another assembly with parts already uses it. */
  setAssemblyShortName: (id: string, shortName: string) => boolean
  /** Every assembly's parts numbered 1, 2, 3 … in list order, without gaps (one undo step) */
  renumberParts: () => void
  /** Places an assembly before/after a sibling or inside a group (targetId null + inside = top level). */
  moveAssembly: (id: string, targetId: string | null, where: AssemblyDrop) => void
  /** Visibility and X-ray apply to the whole subtree. */
  toggleAssemblyVisibility: (id: string) => void

  // Board (single)
  addBoard: (assemblyId: string, board: Omit<Board, 'id'>) => string
  updateBoard: (assemblyId: string, boardId: string, updates: Partial<Board>) => void
  removeBoard: (assemblyId: string, boardId: string) => void
  duplicateBoard: (assemblyId: string, boardId: string) => string | null

  // Board (batch)
  removeBoards: (assemblyId: string, boardIds: string[]) => void
  duplicateBoards: (assemblyId: string, boardIds: string[]) => string[]
  nudgeBoards: (assemblyId: string, boardIds: string[], delta: Vec3) => void
  /** Part role of the given boards in one undo step; undefined clears it. Unknown roles are refused. */
  setBoardsRole: (assemblyId: string, boardIds: string[], role: BoardRole | undefined) => void

  // Board (move between assemblies)
  moveBoardToAssembly: (fromAssemblyId: string, boardId: string, toAssemblyId: string) => void
  moveBoardsToAssembly: (fromAssemblyId: string, boardIds: string[], toAssemblyId: string) => void

  // Joint
  addJoint: (assemblyId: string, joint: Omit<Joint, 'id'>) => string
  /** One undo step; no-op when every patched field already has that value. */
  updateJoint: (assemblyId: string, jointId: string, updates: Partial<Omit<Joint, 'id'>>) => void
  removeJoint: (assemblyId: string, jointId: string) => void

  // Board batch (atomic)
  addBoardsBatch: (assemblyId: string, boards: Omit<Board, 'id'>[]) => string[]

  // Parameters (each change re-evaluates every board formula in the same undo step)
  setParameter: (name: string, value: number) => void
  /** Formulas that used the parameter are cleared; the boards keep their current size. */
  removeParameter: (name: string) => void
  /** Refused when `newName` already exists or is not a valid identifier. */
  renameParameter: (oldName: string, newName: string) => void

  // Material prices
  setMaterialPrice: (materialId: string, pricePerSqm: number) => void

  // Custom materials
  addCustomMaterial: (mat: Omit<Material, 'id'>) => string
  removeCustomMaterial: (id: string) => void
  updateCustomMaterial: (id: string, updates: Partial<Material>) => void

  // Custom hardware
  addCustomHardware: (item: Omit<CustomHardwareItem, 'id'>) => string
  removeCustomHardware: (id: string) => void
  /** Changes a project hardware item (e.g. the gap it bridges, bridgesMm: undefined removes it) */
  updateCustomHardware: (id: string, updates: Partial<Omit<CustomHardwareItem, 'id'>>) => void
  /** Sets the gap a catalogue hardware item bridges in this project (undefined removes it) */
  setHardwareBridges: (hardwareId: string, range: [number, number] | undefined) => void

  // Labor & overhead
  setLaborDetails: (hours: number, rate: number, overheadPct: number) => void

  // Hardware on boards
  addHardwareToBoard: (assemblyId: string, boardId: string, hardwareId: string, quantity: number) => void

  // Assembly steps (Montage): one undo step each, no-op when nothing changes
  /** Replaces all steps (e.g. by the suggested order); unknown and repeated boards are dropped. */
  setAssemblySteps: (steps: AssemblyStep[]) => void
  /** A new, empty step at `atIndex` (default: the end); returns its id. */
  addAssemblyStep: (title: string, atIndex?: number) => string
  /** Title (single line, never empty) and note (empty = none). */
  updateAssemblyStep: (id: string, updates: Partial<Pick<AssemblyStep, 'title' | 'note'>>) => void
  /** Its boards become unplanned. */
  removeAssemblyStep: (id: string) => void
  moveAssemblyStep: (id: string, toIndex: number) => void
  /** Puts the boards into the step, out of any other; null = not planned. Unknown boards are ignored. */
  assignBoardsToStep: (boardIds: string[], stepId: string | null) => void
}

export type AssemblyDrop = 'before' | 'after' | 'inside'

function createEmptyProject(): Project {
  return {
    id: uid(),
    name: 'Neues Projekt',
    assemblies: [],
    displayUnit: 'mm',
    language: 'de',
    createdAt: now(),
    updatedAt: now()
  }
}

// Test/debug helper: expose store on window so Playwright (and devtools) can
// inspect/manipulate state without going through the React tree.
declare global {
  interface Window { __projectStore?: unknown }
}

/** True when the project differs from the last loaded or saved one. */
export const isProjectDirty = (s: Pick<ProjectState, 'project' | 'savedProject'>): boolean => s.project !== s.savedProject

const initialProject = createEmptyProject()

export const useProjectStore = create<ProjectState>()(
  temporal(
    (rawSet, get) => {
      // Every change goes through here. In the assembly workspace only the assembly plan
      // may change (store/designLock.ts): any other change is refused, whichever button,
      // key, panel or AI answer asked for it, and the user is told where it belongs.
      // Loading or starting a project (`load`) is not a change of the design.
      // Every change that touches the parts numbers new ones (Board.partNo): the next
      // free number of their assembly, in the same set — so in the same undo step.
      // (No action replaces the whole state, so `set` takes partial updates only.)
      // `refused` tells an action that returns a new id that nothing was made (the id
      // would point at nothing): it then returns '', null, [] or false instead.
      let refused = false
      const set = (partial: Partial<ProjectState> | ((s: ProjectState) => Partial<ProjectState>), load = false): void => rawSet((s) => {
        refused = false
        const next = typeof partial === 'function' ? partial(s) : partial
        if (!load && next.project && next.project !== s.project && isDesignLocked() && designChanged(s.project, next.project)) {
          refused = true
          tellDesignLocked('change')
          return s
        }
        const assemblies = next.project?.assemblies
        if (!next.project || !assemblies || assemblies === s.project.assemblies) return next
        const numbered = numberParts(assemblies)
        return numbered === assemblies ? next : { ...next, project: { ...next.project, assemblies: numbered } }
      })
      return ({
      project: initialProject,
      savedProject: initialProject,

      markSaved: (project) => set((s) => {
        const saved = project ?? s.project
        return s.savedProject === saved ? s : { savedProject: saved }
      }),

      setProjectName: (name) =>
        set((s) => (s.project.name === name ? s : { project: { ...s.project, name, updatedAt: now() } })),

      setDisplayUnit: (unit) =>
        set((s) => (s.project.displayUnit === unit ? s : { project: { ...s.project, displayUnit: unit, updatedAt: now() } })),

      setLanguage: (lang) =>
        set((s) => (s.project.language === lang ? s : { project: { ...s.project, language: lang, updatedAt: now() } })),

      // a fresh project starts a fresh history: undo must not bring back the previous one
      loadProject: (project) => {
        const loaded = validateProject(project)
        const changes = describeLoadChanges(project, loaded)
        // what loading changed is not what the file says: then it is not "saved" (finding 23.11.2026, review data 11)
        // a separate copy, not null: the project shows as unsaved, and "discard" on closing still has a
        // version to keep instead of deleting the auto-save (review 24.11.)
        set({ project: loaded, savedProject: changes.length ? structuredClone(loaded) : loaded }, true)
        useProjectStore.temporal.getState().clear()
        return changes
      },

      resetProject: () => {
        const fresh = createEmptyProject()
        set({ project: fresh, savedProject: fresh }, true)
        useProjectStore.temporal.getState().clear()
      },

      addAssembly: (name, parentId) => {
        const id = uid()
        set((s) => {
          // a subgroup takes the parent's tick (counts or not); an unknown parent means top level
          const parent = parentId ? s.project.assemblies.find((a) => a.id === parentId) : undefined
          const added: Assembly = parent
            ? { id, name, parentId: parent.id, visible: parent.visible, boards: [], joints: [] }
            : { id, name, visible: true, boards: [], joints: [] }
          return { project: { ...s.project, updatedAt: now(), assemblies: [...s.project.assemblies, added] } }
        })
        return refused ? '' : id
      },

      removeAssembly: (id) =>
        set((s) => {
          if (!s.project.assemblies.some((a) => a.id === id)) return s
          const gone = subtreeIds(s.project.assemblies, id)
          const goneBoards = new Set(s.project.assemblies.filter((a) => gone.has(a.id)).flatMap((a) => a.boards.map((b) => b.id)))
          return withoutStepBoards({
            project: {
              ...s.project,
              updatedAt: now(),
              assemblies: s.project.assemblies.filter((a) => !gone.has(a.id)).map((a) => pruneJoints(a, goneBoards))
            }
          }, goneBoards)
        }),

      // Renaming keeps the part labels: an assembly with parts and no short word of its own
      // keeps the word it had from its old name ("Herdfach 2" stays, not "Kochfeld 2").
      renameAssembly: (id, name) =>
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, id, (a) => {
          if (a.name === name) return a
          const keep = a.boards.length > 0 && !cleanShortName(a.shortName) && defaultShortName(name) !== defaultShortName(a.name)
          return keep ? { ...a, name, shortName: defaultShortName(a.name) } : { ...a, name }
        }))),

      setAssemblyShortName: (id, shortName) => {
        const list = get().project.assemblies
        const target = list.find((a) => a.id === id)
        if (!target) return false
        const cleaned = cleanShortName(shortName) || undefined
        const word = shortNameOf({ name: target.name, shortName: cleaned }).toLocaleLowerCase('de')
        // two assemblies with the same word would give two parts the same label
        if (list.some((a) => a.id !== id && a.boards.length > 0 && shortNameOf(a).toLocaleLowerCase('de') === word)) return false
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, id, (a) =>
          (a.shortName === cleaned ? a : { ...a, shortName: cleaned }))))
        return !refused
      },

      renumberParts: () =>
        set((s) => withAssemblies(s, renumberParts(s.project.assemblies))),

      moveAssembly: (id, targetId, where) => {
        const list = get().project.assemblies
        const moving = list.find((a) => a.id === id)
        const target = targetId === null ? undefined : list.find((a) => a.id === targetId)
        if (!moving || (targetId !== null && !target)) return
        if (target && subtreeIds(list, id).has(target.id)) return   // not into itself or its own subgroups
        const parentId = where === 'inside' ? target?.id : target?.parentId
        if (where === 'inside' && parentId === moving.parentId) return   // already in there: keep its place
        const rest = list.filter((a) => a.id !== id)
        const at = where === 'inside' || !target ? rest.length : rest.indexOf(target) + (where === 'after' ? 1 : 0)
        if (parentId === moving.parentId && at === list.indexOf(moving)) return   // same place, no undo step
        // the moved subtree takes the new parent's tick
        const parent = parentId ? list.find((a) => a.id === parentId) : undefined
        const subtree = subtreeIds(list, id)
        const inherit = (a: Assembly): Assembly =>
          parent && subtree.has(a.id) ? { ...a, visible: parent.visible } : a
        const placed = [...rest.slice(0, at), { ...moving, parentId }, ...rest.slice(at)].map(inherit)
        set((s) => ({ project: { ...s.project, updatedAt: now(), assemblies: placed } }))
      },

      toggleAssemblyVisibility: (id) =>
        set((s) => {
          const self = s.project.assemblies.find((a) => a.id === id)
          if (!self) return s
          const ids = subtreeIds(s.project.assemblies, id)
          // all of it counts: switch it all off; otherwise (none or some): switch it all on
          const value = !s.project.assemblies.filter((a) => ids.has(a.id)).every(assemblyCounts)
          return {
            project: {
              ...s.project,
              updatedAt: now(),
              assemblies: s.project.assemblies.map((a) => (ids.has(a.id) ? { ...a, visible: value } : a))
            }
          }
        }),

      addBoard: (assemblyId, board) => {
        const id = uid()
        // a new part never brings a number: it gets the next free one of its assembly
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) => ({ ...a, boards: [...a.boards, { ...board, id, partNo: undefined }] }))))
        return refused ? '' : id
      },

      updateBoard: (assemblyId, boardId, updates) =>
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) =>
          mapBoards(a, (b) => patch(b, updates), new Set([boardId]))))),

      removeBoard: (assemblyId, boardId) => get().removeBoards(assemblyId, [boardId]),

      duplicateBoard: (assemblyId, boardId) => {
        const assembly = get().project.assemblies.find((a) => a.id === assemblyId)
        const board = assembly?.boards.find((b) => b.id === boardId)
        if (!board) return null

        const newId = uid()
        const duplicate: Board = {
          ...board,
          id: newId,
          partNo: undefined,
          name: board.name + ' (Kopie)',
          position: {
            x: board.position.x + 20,
            y: board.position.y + 20,
            z: board.position.z
          }
        }

        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? { ...a, boards: [...a.boards, duplicate] }
                : a
            )
          }
        }))
        return refused ? null : newId
      },

      // Batch operations (single set() for atomic undo/redo)

      removeBoards: (assemblyId, boardIds) =>
        set((s) => {
          // only boards that really are in this assembly go, and only their joints with them
          const from = s.project.assemblies.find((a) => a.id === assemblyId)
          const removed = new Set(from?.boards.filter((b) => boardIds.includes(b.id)).map((b) => b.id))
          if (removed.size === 0) return s
          return withoutStepBoards(withAssemblies(s, s.project.assemblies.map((a) =>
            a.id === assemblyId ? withoutBoards(a, removed) : pruneJoints(a, removed)
          )), removed)
        }),

      duplicateBoards: (assemblyId, boardIds) => {
        const assembly = get().project.assemblies.find((a) => a.id === assemblyId)
        if (!assembly) return []

        const originals = assembly.boards.filter((b) => boardIds.includes(b.id))
        if (originals.length === 0) return []

        const duplicates: Board[] = originals.map((b) => ({
          ...b,
          id: uid(),
          partNo: undefined,
          name: b.name + ' (Kopie)',
          position: {
            x: b.position.x + 20,
            y: b.position.y + 20,
            z: b.position.z
          }
        }))

        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? { ...a, boards: [...a.boards, ...duplicates] }
                : a
            )
          }
        }))

        return refused ? [] : duplicates.map((d) => d.id)
      },

      nudgeBoards: (assemblyId, boardIds, delta) => {
        if (!delta.x && !delta.y && !delta.z) return
        const idSet = new Set(boardIds)
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) => mapBoards(a, (b) => ({
          ...b,
          position: {
            x: b.position.x + delta.x,
            y: b.position.y + delta.y,
            z: b.position.z + delta.z
          }
        }), idSet))))
      },

      setBoardsRole: (assemblyId, boardIds, role) => {
        // the file validator would drop an unknown role on the next load
        if (role !== undefined && !isBoardRole(role)) return
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) =>
          mapBoards(a, (b) => patch(b, { role }), new Set(boardIds)))))
      },

      moveBoardToAssembly: (fromAssemblyId, boardId, toAssemblyId) =>
        get().moveBoardsToAssembly(fromAssemblyId, [boardId], toAssemblyId),

      moveBoardsToAssembly: (fromAssemblyId, boardIds, toAssemblyId) => {
        if (fromAssemblyId === toAssemblyId || boardIds.length === 0) return
        const fromAssembly = get().project.assemblies.find((a) => a.id === fromAssemblyId)
        // an unknown target would swallow the boards
        if (!fromAssembly || !get().project.assemblies.some((a) => a.id === toAssemblyId)) return
        const idSet = new Set(boardIds)
        // in the new assembly the parts take its next numbers ("Herd 7" becomes "Eck 6")
        const moving = fromAssembly.boards.filter((b) => idSet.has(b.id)).map((b) => ({ ...b, partNo: undefined }))
        if (moving.length === 0) return
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) => {
              if (a.id === fromAssemblyId) {
                return { ...a, boards: a.boards.filter((b) => !idSet.has(b.id)) }
              }
              if (a.id === toAssemblyId) {
                return { ...a, boards: [...a.boards, ...moving] }
              }
              return a
            })
          }
        }))
      },

      addJoint: (assemblyId, joint) => {
        const id = uid()
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) => ({ ...a, joints: [...a.joints, { ...joint, id }] }))))
        return refused ? '' : id
      },

      updateJoint: (assemblyId, jointId, updates) =>
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) => {
          const joints = a.joints.map((j) => (j.id === jointId ? patchJoint(j, updates) : j))
          return joints.every((j, i) => j === a.joints[i]) ? a : { ...a, joints }
        }))),

      removeJoint: (assemblyId, jointId) =>
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) =>
          a.joints.some((j) => j.id === jointId) ? { ...a, joints: a.joints.filter((j) => j.id !== jointId) } : a))),

      addBoardsBatch: (assemblyId, boards) => {
        const ids = boards.map(() => uid())
        const newBoards: Board[] = boards.map((b, i) => ({ ...b, id: ids[i], partNo: undefined }))
        if (newBoards.length === 0) return ids
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) => ({ ...a, boards: [...a.boards, ...newBoards] }))))
        return refused ? [] : ids
      },

      setParameter: (name, value) =>
        set((s) => {
          if (!isParamName(name) || !Number.isFinite(value)) return s   // formulas could not reference it
          const parameters = { ...(s.project.parameters ?? {}), [name]: value }
          const assemblies = mapAllBoards(s.project.assemblies, (b) => evaluateFormulas(b, parameters))
          if (s.project.parameters?.[name] === value && assemblies === s.project.assemblies) return s
          return { project: { ...s.project, updatedAt: now(), parameters, assemblies } }
        }),

      removeParameter: (name) =>
        set((s) => {
          const params = s.project.parameters ?? {}
          if (!Object.hasOwn(params, name)) return s
          const parameters = Object.fromEntries(Object.entries(params).filter(([k]) => k !== name))
          // a formula must not point at a parameter that is gone: drop the link, keep the size
          const assemblies = mapAllBoards(s.project.assemblies, (b) =>
            mapFormulas(b, (f) => (formulaParams(f).includes(name) ? undefined : f)))
          return { project: { ...s.project, updatedAt: now(), parameters, assemblies } }
        }),

      renameParameter: (oldName, newName) =>
        set((s) => {
          const params = s.project.parameters ?? {}
          // renaming onto an existing name would overwrite its value and merge the two in every formula
          if (!Object.hasOwn(params, oldName) || Object.hasOwn(params, newName) || !isParamName(newName)) return s
          const parameters = Object.fromEntries(Object.entries(params).map(([k, v]) => [k === oldName ? newName : k, v]))
          const assemblies = mapAllBoards(s.project.assemblies, (b) =>
            evaluateFormulas(mapFormulas(b, (f) => renameFormulaParam(f, oldName, newName)), parameters))
          return { project: { ...s.project, updatedAt: now(), parameters, assemblies } }
        }),

      setMaterialPrice: (materialId, pricePerSqm) =>
        set((s) => (s.project.materialPrices?.[materialId] === pricePerSqm ? s : {
          project: {
            ...s.project,
            updatedAt: now(),
            materialPrices: { ...(s.project.materialPrices ?? {}), [materialId]: pricePerSqm }
          }
        })),

      addCustomMaterial: (mat) => {
        const id = uid()
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            customMaterials: [...(s.project.customMaterials ?? []), { ...mat, id }]
          }
        }))
        return refused ? '' : id
      },

      removeCustomMaterial: (id) =>
        set((s) => (!s.project.customMaterials?.some((m) => m.id === id) ? s : {
          project: {
            ...s.project,
            updatedAt: now(),
            customMaterials: (s.project.customMaterials ?? []).filter((m) => m.id !== id)
          }
        })),

      updateCustomMaterial: (id, updates) =>
        set((s) => (!s.project.customMaterials?.some((m) => m.id === id) ? s : {
          project: {
            ...s.project,
            updatedAt: now(),
            customMaterials: (s.project.customMaterials ?? []).map((m) =>
              m.id === id ? { ...m, ...updates } : m
            )
          }
        })),

      addCustomHardware: (item) => {
        const id = uid()
        const { bridgesMm, ...rest } = item
        const range = cleanBridgesMm(bridgesMm)
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            customHardware: [...(s.project.customHardware ?? []), { ...rest, ...(range ? { bridgesMm: range } : {}), id }]
          }
        }))
        return refused ? '' : id
      },

      updateCustomHardware: (id, updates) =>
        set((s) => (!s.project.customHardware?.some((h) => h.id === id) ? s : {
          project: {
            ...s.project,
            updatedAt: now(),
            customHardware: (s.project.customHardware ?? []).map((h) => {
              if (h.id !== id) return h
              const { bridgesMm, ...rest } = { ...h, ...updates, id: h.id }
              // undefined removes the range; an unusable one keeps what was stored
              const range = 'bridgesMm' in updates && updates.bridgesMm !== undefined && !cleanBridgesMm(updates.bridgesMm) ? h.bridgesMm : cleanBridgesMm(bridgesMm)
              return { ...rest, ...(range ? { bridgesMm: range } : {}) }
            })
          }
        })),

      setHardwareBridges: (hardwareId, range) =>
        set((s) => {
          const clean = cleanBridgesMm(range)
          if (range !== undefined && !clean) return s   // an unusable range changes nothing
          const now0 = s.project.hardwareBridges?.[hardwareId]
          if (clean ? now0?.[0] === clean[0] && now0?.[1] === clean[1] : !now0) return s
          const { [hardwareId]: _old, ...rest } = s.project.hardwareBridges ?? {}
          const next = clean ? { ...rest, [hardwareId]: clean } : rest
          return { project: { ...s.project, updatedAt: now(), hardwareBridges: Object.keys(next).length ? next : undefined } }
        }),

      removeCustomHardware: (id) =>
        set((s) => (!s.project.customHardware?.some((h) => h.id === id) ? s : {
          project: {
            ...s.project,
            updatedAt: now(),
            customHardware: (s.project.customHardware ?? []).filter((h) => h.id !== id)
          }
        })),

      setLaborDetails: (hours, rate, overheadPct) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            laborHours: hours,
            laborRate: rate,
            overheadPct
          }
        })),

      addHardwareToBoard: (assemblyId, boardId, hardwareId, quantity) =>
        set((s) => withAssemblies(s, mapAssembly(s.project.assemblies, assemblyId, (a) => mapBoards(a, (b) => ({
          ...b,
          hardware: [
            ...(b.hardware ?? []).filter((h) => h.hardwareId !== hardwareId),
            // within the file validator's bounds, so the auto-save always loads again
            { hardwareId, quantity: Math.min(MAX_QUANTITY, Math.max(0, Math.round(quantity) || 0)) }
          ]
        }), new Set([boardId]))))),

      setAssemblySteps: (steps) =>
        set((s) => withSteps(s, cleanSteps(steps, allBoardIds(s.project)))),

      addAssemblyStep: (title, atIndex) => {
        const id = uid()
        set((s) => {
          const list = s.project.assemblySteps ?? []
          const at = atIndex === undefined ? list.length : Math.max(0, Math.min(list.length, Math.round(atIndex)))
          const step: AssemblyStep = { id, title: cleanName(title, `${list.length + 1}`), boardIds: [] }
          return withSteps(s, [...list.slice(0, at), step, ...list.slice(at)])
        })
        return id
      },

      updateAssemblyStep: (id, updates) =>
        set((s) => withSteps(s, mapStep(s.project.assemblySteps ?? EMPTY_STEPS, id, (st) => {
          const title = updates.title === undefined ? st.title : cleanName(updates.title, st.title)
          const note = updates.note === undefined ? st.note : updates.note.trim() ? updates.note : undefined
          return title === st.title && note === st.note ? st : { ...st, title, note }
        }))),

      removeAssemblyStep: (id) =>
        set((s) => {
          const list = s.project.assemblySteps ?? EMPTY_STEPS
          return list.some((st) => st.id === id) ? withSteps(s, list.filter((st) => st.id !== id)) : s
        }),

      moveAssemblyStep: (id, toIndex) =>
        set((s) => {
          const list = s.project.assemblySteps ?? EMPTY_STEPS
          const from = list.findIndex((st) => st.id === id)
          const to = Math.max(0, Math.min(list.length - 1, Math.round(toIndex)))
          if (from < 0 || from === to || !Number.isFinite(to)) return s
          const rest = list.filter((st) => st.id !== id)
          return withSteps(s, [...rest.slice(0, to), list[from], ...rest.slice(to)])
        }),

      assignBoardsToStep: (boardIds, stepId) =>
        set((s) => {
          const list = s.project.assemblySteps ?? EMPTY_STEPS
          if (stepId !== null && !list.some((st) => st.id === stepId)) return s
          const known = allBoardIds(s.project)
          const ids = [...new Set(boardIds.filter((id) => known.has(id)))]
          if (ids.length === 0) return s
          const moving = new Set(ids)
          const next = list.map((st) => {
            if (st.id === stepId) {
              const add = ids.filter((id) => !st.boardIds.includes(id))
              return add.length ? { ...st, boardIds: [...st.boardIds, ...add] } : st
            }
            return st.boardIds.some((id) => moving.has(id)) ? { ...st, boardIds: st.boardIds.filter((id) => !moving.has(id)) } : st
          })
          return next.every((st, i) => st === list[i]) ? s : withSteps(s, next)
        }),

    })},
    {
      partialize: (state) => {
        const { project } = state
        return { project } as ProjectState
      },
      // an action that leaves the project untouched records no undo step
      equality: (past, current) => past.project === current.project,
      limit: 200
    }
  )
)

if (typeof window !== 'undefined') {
  window.__projectStore = useProjectStore
}
