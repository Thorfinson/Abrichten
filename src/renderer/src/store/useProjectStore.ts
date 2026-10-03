import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Project, Assembly, Board, Joint, Unit, Vec3, Material, CustomHardwareItem } from '../types/furniture'
import { validateProject } from '../utils/validateProject'
import { subtreeIds } from '../utils/assemblyTree'

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

interface ProjectState {
  project: Project

  // Project
  setProjectName: (name: string) => void
  setDisplayUnit: (unit: Unit) => void
  setLanguage: (lang: 'de' | 'en') => void
  loadProject: (project: unknown) => void
  resetProject: () => void

  // Assembly
  addAssembly: (name: string, parentId?: string) => string
  /** Removes the assembly with everything nested below it. */
  removeAssembly: (id: string) => void
  renameAssembly: (id: string, name: string) => void
  /** Places an assembly before/after a sibling or inside a group (targetId null + inside = top level). */
  moveAssembly: (id: string, targetId: string | null, where: AssemblyDrop) => void
  /** Visibility and X-ray apply to the whole subtree. */
  toggleAssemblyVisibility: (id: string) => void
  toggleAssemblyHighlight: (id: string) => void

  // Board (single)
  addBoard: (assemblyId: string, board: Omit<Board, 'id'>) => string
  updateBoard: (assemblyId: string, boardId: string, updates: Partial<Board>) => void
  removeBoard: (assemblyId: string, boardId: string) => void
  duplicateBoard: (assemblyId: string, boardId: string) => string | null

  // Board (batch)
  removeBoards: (assemblyId: string, boardIds: string[]) => void
  duplicateBoards: (assemblyId: string, boardIds: string[]) => string[]
  nudgeBoards: (assemblyId: string, boardIds: string[], delta: Vec3) => void

  // Board (move between assemblies)
  moveBoardToAssembly: (fromAssemblyId: string, boardId: string, toAssemblyId: string) => void
  moveBoardsToAssembly: (fromAssemblyId: string, boardIds: string[], toAssemblyId: string) => void

  // Joint
  addJoint: (assemblyId: string, joint: Omit<Joint, 'id'>) => string
  removeJoint: (assemblyId: string, jointId: string) => void

  // Board batch (atomic)
  addBoardsBatch: (assemblyId: string, boards: Omit<Board, 'id'>[]) => string[]

  // Parameters
  setParameter: (name: string, value: number) => void
  removeParameter: (name: string) => void
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

  // Labor & overhead
  setLaborDetails: (hours: number, rate: number, overheadPct: number) => void

  // Hardware on boards
  addHardwareToBoard: (assemblyId: string, boardId: string, hardwareId: string, quantity: number) => void
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

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set, get) => ({
      project: createEmptyProject(),

      setProjectName: (name) =>
        set((s) => ({ project: { ...s.project, name, updatedAt: now() } })),

      setDisplayUnit: (unit) =>
        set((s) => ({ project: { ...s.project, displayUnit: unit, updatedAt: now() } })),

      setLanguage: (lang) =>
        set((s) => ({ project: { ...s.project, language: lang, updatedAt: now() } })),

      loadProject: (project) =>
        set({ project: validateProject(project) }),

      resetProject: () =>
        set({ project: createEmptyProject() }),

      addAssembly: (name, parentId) => {
        const id = uid()
        set((s) => {
          // a subgroup takes the parent's eye and X-ray state; an unknown parent means top level
          const parent = parentId ? s.project.assemblies.find((a) => a.id === parentId) : undefined
          const added: Assembly = parent
            ? { id, name, parentId: parent.id, visible: parent.visible, highlight: parent.highlight, boards: [], joints: [] }
            : { id, name, visible: true, boards: [], joints: [] }
          return { project: { ...s.project, updatedAt: now(), assemblies: [...s.project.assemblies, added] } }
        })
        return id
      },

      removeAssembly: (id) =>
        set((s) => {
          const gone = subtreeIds(s.project.assemblies, id)
          const goneBoards = new Set(s.project.assemblies.filter((a) => gone.has(a.id)).flatMap((a) => a.boards.map((b) => b.id)))
          return {
            project: {
              ...s.project,
              updatedAt: now(),
              assemblies: s.project.assemblies.filter((a) => !gone.has(a.id)).map((a) => pruneJoints(a, goneBoards))
            }
          }
        }),

      renameAssembly: (id, name) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === id ? { ...a, name } : a
            )
          }
        })),

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
        // the moved subtree takes the new parent's eye and X-ray state
        const parent = parentId ? list.find((a) => a.id === parentId) : undefined
        const subtree = subtreeIds(list, id)
        const inherit = (a: Assembly): Assembly =>
          parent && subtree.has(a.id) ? { ...a, visible: parent.visible, highlight: parent.highlight } : a
        const placed = [...rest.slice(0, at), { ...moving, parentId }, ...rest.slice(at)].map(inherit)
        set((s) => ({ project: { ...s.project, updatedAt: now(), assemblies: placed } }))
      },

      toggleAssemblyVisibility: (id) =>
        set((s) => {
          const self = s.project.assemblies.find((a) => a.id === id)
          if (!self) return {}
          const ids = subtreeIds(s.project.assemblies, id)
          const value = !self.visible
          return {
            project: {
              ...s.project,
              updatedAt: now(),
              assemblies: s.project.assemblies.map((a) => (ids.has(a.id) ? { ...a, visible: value } : a))
            }
          }
        }),

      toggleAssemblyHighlight: (id) =>
        set((s) => {
          const self = s.project.assemblies.find((a) => a.id === id)
          if (!self) return {}
          const ids = subtreeIds(s.project.assemblies, id)
          const value = !self.highlight
          return {
            project: {
              ...s.project,
              updatedAt: now(),
              assemblies: s.project.assemblies.map((a) => (ids.has(a.id) ? { ...a, highlight: value } : a))
            }
          }
        }),

      addBoard: (assemblyId, board) => {
        const id = uid()
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? { ...a, boards: [...a.boards, { ...board, id }] }
                : a
            )
          }
        }))
        return id
      },

      updateBoard: (assemblyId, boardId, updates) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? {
                    ...a,
                    boards: a.boards.map((b) =>
                      b.id === boardId ? { ...b, ...updates } : b
                    )
                  }
                : a
            )
          }
        })),

      removeBoard: (assemblyId, boardId) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? withoutBoards(a, new Set([boardId]))
                : pruneJoints(a, new Set([boardId]))
            )
          }
        })),

      duplicateBoard: (assemblyId, boardId) => {
        const assembly = get().project.assemblies.find((a) => a.id === assemblyId)
        const board = assembly?.boards.find((b) => b.id === boardId)
        if (!board) return null

        const newId = uid()
        const duplicate: Board = {
          ...board,
          id: newId,
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
        return newId
      },

      // Batch operations (single set() for atomic undo/redo)

      removeBoards: (assemblyId, boardIds) => {
        const idSet = new Set(boardIds)
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? withoutBoards(a, idSet)
                : pruneJoints(a, idSet)
            )
          }
        }))
      },

      duplicateBoards: (assemblyId, boardIds) => {
        const assembly = get().project.assemblies.find((a) => a.id === assemblyId)
        if (!assembly) return []

        const originals = assembly.boards.filter((b) => boardIds.includes(b.id))
        if (originals.length === 0) return []

        const duplicates: Board[] = originals.map((b) => ({
          ...b,
          id: uid(),
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

        return duplicates.map((d) => d.id)
      },

      nudgeBoards: (assemblyId, boardIds, delta) => {
        const idSet = new Set(boardIds)
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? {
                    ...a,
                    boards: a.boards.map((b) =>
                      idSet.has(b.id)
                        ? {
                            ...b,
                            position: {
                              x: b.position.x + delta.x,
                              y: b.position.y + delta.y,
                              z: b.position.z + delta.z
                            }
                          }
                        : b
                    )
                  }
                : a
            )
          }
        }))
      },

      moveBoardToAssembly: (fromAssemblyId, boardId, toAssemblyId) => {
        if (fromAssemblyId === toAssemblyId) return
        const fromAssembly = get().project.assemblies.find((a) => a.id === fromAssemblyId)
        const board = fromAssembly?.boards.find((b) => b.id === boardId)
        if (!board) return
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) => {
              if (a.id === fromAssemblyId) {
                return { ...a, boards: a.boards.filter((b) => b.id !== boardId) }
              }
              if (a.id === toAssemblyId) {
                return { ...a, boards: [...a.boards, board] }
              }
              return a
            })
          }
        }))
      },

      moveBoardsToAssembly: (fromAssemblyId, boardIds, toAssemblyId) => {
        if (fromAssemblyId === toAssemblyId || boardIds.length === 0) return
        const fromAssembly = get().project.assemblies.find((a) => a.id === fromAssemblyId)
        if (!fromAssembly) return
        const idSet = new Set(boardIds)
        const moving = fromAssembly.boards.filter((b) => idSet.has(b.id))
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
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? { ...a, joints: [...a.joints, { ...joint, id }] }
                : a
            )
          }
        }))
        return id
      },

      removeJoint: (assemblyId, jointId) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? { ...a, joints: a.joints.filter((j) => j.id !== jointId) }
                : a
            )
          }
        })),

      addBoardsBatch: (assemblyId, boards) => {
        const ids = boards.map(() => uid())
        const newBoards: Board[] = boards.map((b, i) => ({ ...b, id: ids[i] }))
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === assemblyId
                ? { ...a, boards: [...a.boards, ...newBoards] }
                : a
            )
          }
        }))
        return ids
      },

      setParameter: (name, value) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            parameters: { ...(s.project.parameters ?? {}), [name]: value }
          }
        })),

      removeParameter: (name) =>
        set((s) => {
          const params = { ...(s.project.parameters ?? {}) }
          delete params[name]
          return { project: { ...s.project, updatedAt: now(), parameters: params } }
        }),

      renameParameter: (oldName, newName) =>
        set((s) => {
          const params = { ...(s.project.parameters ?? {}) }
          if (oldName === newName || !(oldName in params)) return {}
          params[newName] = params[oldName]
          delete params[oldName]
          // Also update formula strings in all boards
          const assemblies = s.project.assemblies.map((a) => ({
            ...a,
            boards: a.boards.map((b) => {
              const updates: Partial<Board> = {}
              const re = new RegExp(`\\b${oldName}\\b`, 'g')
              if (b.widthFormula) updates.widthFormula = b.widthFormula.replace(re, newName)
              if (b.heightFormula) updates.heightFormula = b.heightFormula.replace(re, newName)
              if (b.depthFormula) updates.depthFormula = b.depthFormula.replace(re, newName)
              return Object.keys(updates).length ? { ...b, ...updates } : b
            })
          }))
          return { project: { ...s.project, updatedAt: now(), parameters: params, assemblies } }
        }),

      setMaterialPrice: (materialId, pricePerSqm) =>
        set((s) => ({
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
        return id
      },

      removeCustomMaterial: (id) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            customMaterials: (s.project.customMaterials ?? []).filter((m) => m.id !== id)
          }
        })),

      updateCustomMaterial: (id, updates) =>
        set((s) => ({
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
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            customHardware: [...(s.project.customHardware ?? []), { ...item, id }]
          }
        }))
        return id
      },

      removeCustomHardware: (id) =>
        set((s) => ({
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
        set((s) => ({
          project: {
            ...s.project, updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id !== assemblyId ? a : {
                ...a, boards: a.boards.map((b) =>
                  b.id !== boardId ? b : {
                    ...b,
                    hardware: [
                      ...(b.hardware ?? []).filter((h) => h.hardwareId !== hardwareId),
                      { hardwareId, quantity }
                    ]
                  }
                )
              }
            )
          }
        })),

    }),
    {
      partialize: (state) => {
        const { project } = state
        return { project } as ProjectState
      },
      limit: 200
    }
  )
)

if (typeof window !== 'undefined') {
  window.__projectStore = useProjectStore
}
