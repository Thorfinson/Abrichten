import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Project, Assembly, Board, Joint, Unit, Vec3, Material, CustomHardwareItem } from '../types/furniture'

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function now(): string {
  return new Date().toISOString()
}

interface ProjectState {
  project: Project

  // Project
  setProjectName: (name: string) => void
  setDisplayUnit: (unit: Unit) => void
  setLanguage: (lang: 'de' | 'en') => void
  loadProject: (project: Project) => void
  resetProject: () => void

  // Assembly
  addAssembly: (name: string) => string
  removeAssembly: (id: string) => void
  renameAssembly: (id: string, name: string) => void
  reorderAssemblies: (fromIdx: number, toIdx: number) => void
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

  // Board (move between assemblies)
  moveBoardToAssembly: (fromAssemblyId: string, boardId: string, toAssemblyId: string) => void
  moveBoardsToAssembly: (fromAssemblyId: string, boardIds: string[], toAssemblyId: string) => void

  // Joint
  addJoint: (assemblyId: string, joint: Omit<Joint, 'id'>) => string

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
        set({ project }),

      resetProject: () =>
        set({ project: createEmptyProject() }),

      addAssembly: (name) => {
        const id = uid()
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: [...s.project.assemblies, { id, name, visible: true, boards: [], joints: [] }]
          }
        }))
        return id
      },

      removeAssembly: (id) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.filter((a) => a.id !== id)
          }
        })),

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

      reorderAssemblies: (fromIdx, toIdx) => {
        const assemblies = [...get().project.assemblies]
        const [moved] = assemblies.splice(fromIdx, 1)
        assemblies.splice(toIdx, 0, moved)
        set((s) => ({ project: { ...s.project, assemblies, updatedAt: now() } }))
      },

      toggleAssemblyVisibility: (id) =>
        set((s) => ({
          project: {
            ...s.project,
            updatedAt: now(),
            assemblies: s.project.assemblies.map((a) =>
              a.id === id ? { ...a, visible: !a.visible } : a
            )
          }
        })),

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
                ? { ...a, boards: a.boards.filter((b) => b.id !== boardId) }
                : a
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
                ? { ...a, boards: a.boards.filter((b) => !idSet.has(b.id)) }
                : a
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
