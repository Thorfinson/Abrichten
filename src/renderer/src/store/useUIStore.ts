import { createContext, useContext } from 'react'
import { create } from 'zustand'
import type { ToolMode, ViewMode, Measurement } from '../types/measurement'
import { useProjectStore } from './useProjectStore'
import { isInputDevice, type InputDevice } from '../utils/canvasInput'
import type { ChangedProjectFile } from '../utils/changedFile'
import { stepHiddenIds } from '../utils/assemblySteps'
import type { Board, Project } from '../types/furniture'
import { setDesignLockSource } from './designLock'
import { assemblyCounts } from '../utils/activeParts'

export type TransformMode = 'translate' | 'rotate' | 'scale'

interface ContextMenuState {
  x: number
  y: number
  boardId: string
  assemblyId: string
}

export interface UIState {
  activeView: ViewMode
  activeTool: ToolMode
  selectedBoardIds: string[]
  selectedAssemblyId: string | null
  zoom: number
  panX: number
  panY: number
  measurements: Measurement[]
  showStaticOverlay: boolean
  showJointMarkers: boolean
  showCollisionOverlay: boolean
  settingsOpen: boolean
  transformMode: TransformMode
  showCuttingList: boolean
  showChatPanel: boolean
  snapEnabled: boolean
  snapSize: number
  contextMenu: ContextMenuState | null
  staticLoadKg: number
  fitViewTrigger: number
  showParametersPanel: boolean
  showHardwarePanel: boolean
  showNestingPanel: boolean
  showCostPanel: boolean
  showBoringPanel: boolean
  showTolerancePanel: boolean
  showShopDrawingsPanel: boolean
  showKorpusPanel: boolean
  showDrawerCalcPanel: boolean
  showHingeCalcPanel: boolean
  showCommandPalette: boolean
  saveStatus: 'idle' | 'saved' | 'error'
  setSaveStatus: (s: 'idle' | 'saved' | 'error') => void
  collisionPairs: { boardIdA: string; boardIdB: string }[]
  setCollisionPairs: (pairs: { boardIdA: string; boardIdB: string }[]) => void
  hoveredWorldPos: { x: number; y: number; z: number } | null
  setHoveredWorldPos: (pos: { x: number; y: number; z: number } | null) => void
  // New panel flags
  showPanelHub: boolean
  showStaticSummary: boolean
  showMeasurementPanel: boolean
  showBoringOverlay: boolean
  showMaterialsPanel: boolean
  // View layout
  viewLayout: 'single' | 'quad'
  // Collision grace
  collisionGraceMm: number
  // Static warnings
  // Onboarding
  hasSeenWelcome: boolean
  // Export status
  exportStatus: string | null
  /** Startup question: the last opened/saved file changed outside the app (services/projectFile.ts) */
  changedFile: ChangedProjectFile | null
  // Joint creation dialog
  showJointDialog: boolean
  // Assembly bounding dimensions overlay
  showAssemblyDims: boolean
  // Snap indicator position (world coords, set during snap-active drags)
  snapIndicatorPos: { x: number; y: number; z: number } | null

  setActiveView: (view: ViewMode) => void
  setActiveTool: (tool: ToolMode) => void
  selectBoard: (assemblyId: string | null, boardId: string | null) => void
  toggleBoardSelection: (assemblyId: string, boardId: string) => void
  selectAllBoards: (assemblyId: string) => void
  deselectAll: () => void
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  addMeasurement: (m: Measurement) => void
  clearMeasurements: () => void
  removeMeasurement: (idx: number) => void
  toggleStaticOverlay: () => void
  toggleJointMarkers: () => void
  toggleCollisionOverlay: () => void
  setSettingsOpen: (open: boolean) => void
  setTransformMode: (mode: TransformMode) => void
  setShowCuttingList: (show: boolean) => void
  setShowChatPanel: (show: boolean) => void
  toggleSnap: () => void
  setSnapSize: (size: number) => void
  setContextMenu: (menu: ContextMenuState | null) => void
  setStaticLoadKg: (kg: number) => void
  triggerFitView: () => void
  setShowParametersPanel: (show: boolean) => void
  setShowHardwarePanel: (show: boolean) => void
  setShowNestingPanel: (show: boolean) => void
  setShowCostPanel: (show: boolean) => void
  setShowBoringPanel: (show: boolean) => void
  setShowTolerancePanel: (show: boolean) => void
  setShowShopDrawingsPanel: (show: boolean) => void
  setShowKorpusPanel: (show: boolean) => void
  setShowDrawerCalcPanel: (show: boolean) => void
  setShowHingeCalcPanel: (show: boolean) => void
  setShowCommandPalette: (show: boolean) => void
  setShowPanelHub: (show: boolean) => void
  setShowStaticSummary: (show: boolean) => void
  setShowMeasurementPanel: (show: boolean) => void
  toggleBoringOverlay: () => void
  setShowMaterialsPanel: (show: boolean) => void
  setViewLayout: (layout: 'single' | 'quad') => void
  setCollisionGraceMm: (mm: number) => void
  setHasSeenWelcome: () => void
  setExportStatus: (msg: string | null) => void
  setChangedFile: (file: ChangedProjectFile | null) => void
  setShowJointDialog: (show: boolean) => void
  toggleAssemblyDims: () => void
  setSnapIndicatorPos: (pos: { x: number; y: number; z: number } | null) => void
  showAssemblyDrawer: boolean
  setShowAssemblyDrawer: (show: boolean) => void
  showShortcutsOverlay: boolean
  setShowShortcutsOverlay: (show: boolean) => void
  showGrid: boolean
  toggleGrid: () => void
  /** The shortcut HUD is folded to its overlay row — the user's choice, remembered */
  hudCollapsed: boolean
  setHudCollapsed: (collapsed: boolean) => void
  /** The static legend is folded to its title row — remembered like hudCollapsed */
  staticLegendCollapsed: boolean
  setStaticLegendCollapsed: (collapsed: boolean) => void
  /** How wheel and ⌥-drag move the camera: mouse, trackpad or decided per gesture (utils/canvasInput) — remembered */
  inputDevice: InputDevice
  setInputDevice: (device: InputDevice) => void
  /** Close the topmost open modal (see topModal) */
  closeTopModal: () => void
  /** Step shown in the assembly workspace (index into project.assemblySteps); see shownStep */
  assemblyStep: number
  /** The assembly workspace on or off (same as setWorkspace) */
  setAssemblyMode: (on: boolean) => void
  setAssemblyStep: (index: number) => void
  /** Workspace: design (the model) or assembly (steps). Assembly mode is the assembly workspace. */
  workspace: Workspace
  setWorkspace: (workspace: Workspace) => void
  /** How the parts column groups the parts (the assembly workspace shows its steps instead) */
  drawerGroupBy: DrawerGroupBy
  setDrawerGroupBy: (groupBy: DrawerGroupBy) => void
  /** Parts the eye hides in the design workspace: a view only — they still count in every
   *  list and total (that is the assembly's tick, Assembly.visible). Not saved in the file. */
  hiddenParts: string[]
  /** The eye of a part or a group: hides them all when all are shown, else shows them all */
  togglePartsInView: (ids: string[]) => void
  /** Hide (or show) these parts, whatever they were before — the menu's "hide assembly" */
  setPartsHidden: (ids: string[], hidden: boolean) => void
  /** Parts the X-ray picks out in the design workspace (others are ghosted): a view, not saved */
  highlightedParts: string[]
  /** The X-ray of a part or a group: same rule as the eye */
  togglePartsHighlight: (ids: string[]) => void
}

export type Workspace = 'design' | 'assembly'
export const WORKSPACES: readonly Workspace[] = ['design', 'assembly']
export type DrawerGroupBy = 'assembly' | 'role' | 'material'

/** Modal panel flags, topmost first (z-index order) so Esc closes the one on top. */
const MODAL_FLAGS = [
  'showShortcutsOverlay', 'showCommandPalette', 'showJointDialog', 'settingsOpen',
  'showCuttingList', 'showParametersPanel', 'showHardwarePanel', 'showNestingPanel',
  'showCostPanel', 'showBoringPanel', 'showTolerancePanel', 'showShopDrawingsPanel',
  'showKorpusPanel', 'showDrawerCalcPanel', 'showHingeCalcPanel', 'showStaticSummary',
  'showMeasurementPanel', 'showMaterialsPanel', 'showPanelHub'
] as const satisfies readonly (keyof UIState)[]

export type ModalId = (typeof MODAL_FLAGS)[number] | 'contextMenu' | 'welcome' | 'changedFile'

/** The design is read-only: the assembly workspace changes only the assembly plan (store/designLock.ts). */
export const designLockedIn = (s: Pick<UIState, 'workspace'>): boolean => s.workspace === 'assembly'

/** Tools that only change the design: closed when the assembly workspace opens. */
const DESIGN_TOOLS = ['showKorpusPanel', 'showDrawerCalcPanel', 'showHingeCalcPanel', 'showTolerancePanel',
  'showParametersPanel', 'showMaterialsPanel', 'showChatPanel', 'showJointDialog'] as const

/** Of the given parts: none in the list (shown, not picked out), all of them, or some. */
export type ViewState = 'shown' | 'hidden' | 'mixed'
export function viewStateOf(ids: readonly string[], list: readonly string[]): ViewState {
  if (ids.length === 0) return 'shown'
  const inList = new Set(list)
  const n = ids.filter((id) => inList.has(id)).length
  return n === 0 ? 'shown' : n === ids.length ? 'hidden' : 'mixed'
}

/** One click rule for the eye and the X-ray of a part or a group: none of them in the
 *  list → all go in; some or all → all come out. Returns the new list. */
export function toggleAll(list: readonly string[], ids: readonly string[]): string[] {
  const these = new Set(ids)
  return viewStateOf(ids, list) === 'shown' ? [...new Set([...list, ...ids])] : list.filter((id) => !these.has(id))
}

/**
 * The parts the view hides right now — one rule for the boards, every layer drawn over
 * them, ⌘A and the marquee: in the assembly workspace what the step view hides (later
 * steps, parts in no step), in the design workspace what the eye hides.
 */
export function viewHiddenIds(
  project: Pick<Project, 'assemblies' | 'assemblySteps'>,
  s: Pick<UIState, 'workspace' | 'assemblyStep' | 'hiddenParts'>
): Set<string> {
  return s.workspace === 'assembly' ? stepHiddenIds(project, s.assemblyStep) : new Set(s.hiddenParts)
}

/** The boards a drag can snap to: those that count (the tick) and are seen (viewHiddenIds:
 *  the eye, or the step view), not the ones being moved. A hidden part is no target. */
export function snapTargets(project: Pick<Project, 'assemblies' | 'assemblySteps'>, s: Pick<UIState, 'workspace' | 'assemblyStep' | 'hiddenParts'>, moving: Iterable<string>): Board[] {
  const skip = new Set(moving)
  const hidden = viewHiddenIds(project, s)
  return project.assemblies
    .filter(assemblyCounts)
    .flatMap((a) => a.boards.filter((b) => !skip.has(b.id) && !hidden.has(b.id)))
}

/** The step the 3D view shows: in the assembly workspace its current step, else -1 (no step view). */
export const shownStep = (s: Pick<UIState, 'workspace' | 'assemblyStep'>): number => (s.workspace === 'assembly' ? s.assemblyStep : -1)

/** The topmost open modal — context menu, dialog, panel, the startup question or the welcome screen — or null. */
export function topModal(s: UIState): ModalId | null {
  if (s.contextMenu) return 'contextMenu'
  if (s.changedFile) return 'changedFile'
  const flag = MODAL_FLAGS.find((f) => s[f])
  if (flag) return flag
  return s.hasSeenWelcome ? null : 'welcome'
}

const HUD_COLLAPSED_KEY = 'abrichten-hud-collapsed'
const LEGEND_COLLAPSED_KEY = 'abrichten-static-legend-collapsed'
const INPUT_DEVICE_KEY = 'abrichten-input-device'

function storedInputDevice(): InputDevice {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(INPUT_DEVICE_KEY) : null
    return isInputDevice(v) ? v : 'auto'
  } catch { return 'auto' }
}

function storedFlag(key: string): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1' } catch { return false }
}

export const useUIStore = create<UIState>((set, get) => ({
  activeView: 'front',
  activeTool: 'select',
  selectedBoardIds: [],
  selectedAssemblyId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  measurements: [],
  showStaticOverlay: false,
  // Off by default: in real projects the joint badges cover the model
  showJointMarkers: false,
  showCollisionOverlay: false,
  settingsOpen: false,
  transformMode: 'translate',
  showCuttingList: false,
  showChatPanel: false,
  // Snap default OFF: snap-quantized translate-drag with TC felt like the
  // gizmo was "breaking" between snap-grid steps. User can re-enable via `S`.
  snapEnabled: false,
  snapSize: 10,
  contextMenu: null,
  staticLoadKg: 20,
  fitViewTrigger: 0,
  showParametersPanel: false,
  showHardwarePanel: false,
  showNestingPanel: false,
  showCostPanel: false,
  showBoringPanel: false,
  showTolerancePanel: false,
  showShopDrawingsPanel: false,
  showKorpusPanel: false,
  showDrawerCalcPanel: false,
  showHingeCalcPanel: false,
  showCommandPalette: false,
  saveStatus: 'idle',
  setSaveStatus: (s) => set({ saveStatus: s }),
  collisionPairs: [],
  setCollisionPairs: (pairs) => set({ collisionPairs: pairs }),
  hoveredWorldPos: null,
  setHoveredWorldPos: (pos) => set({ hoveredWorldPos: pos }),
  showPanelHub: false,
  showStaticSummary: false,
  showMeasurementPanel: false,
  showBoringOverlay: false,
  showMaterialsPanel: false,
  viewLayout: 'single',
  collisionGraceMm: 0.5,
  hasSeenWelcome: typeof localStorage !== 'undefined' && !!localStorage.getItem('abrichten-welcomed'),
  exportStatus: null,
  changedFile: null,
  showJointDialog: false,
  showAssemblyDims: false,
  snapIndicatorPos: null,
  showAssemblyDrawer: false,
  showShortcutsOverlay: false,
  showGrid: true,
  hudCollapsed: storedFlag(HUD_COLLAPSED_KEY),
  staticLegendCollapsed: storedFlag(LEGEND_COLLAPSED_KEY),
  inputDevice: storedInputDevice(),
  assemblyStep: 0,
  setAssemblyMode: (on) => get().setWorkspace(on ? 'assembly' : 'design'),
  workspace: 'design',
  setWorkspace: (workspace) => {
    if (!WORKSPACES.includes(workspace) || workspace === get().workspace) return
    // entering assembly clears the selection (it may sit on parts the step view hides)
    // and closes the design tools and the context menu (they would change the design)
    // back in design, parts the eye hides leave the selection (Del never hits a hidden part)
    if (workspace !== 'assembly') {
      set((s) => {
        const hidden = new Set(s.hiddenParts)
        const kept = s.selectedBoardIds.filter((id) => !hidden.has(id))
        return kept.length === s.selectedBoardIds.length ? { workspace } : { workspace, selectedBoardIds: kept }
      })
      return
    }
    set({ workspace, selectedBoardIds: [], contextMenu: null, ...(Object.fromEntries(DESIGN_TOOLS.map((flag) => [flag, false])) as Partial<UIState>) })
  },
  drawerGroupBy: 'assembly',
  setDrawerGroupBy: (groupBy) => set({ drawerGroupBy: groupBy }),
  hiddenParts: [],
  // hidden parts leave the selection, so Del never hits a part you cannot see
  togglePartsInView: (ids) => set((s) => {
    if (ids.length === 0) return {}
    const hiddenParts = toggleAll(s.hiddenParts, ids)
    const hidden = new Set(hiddenParts)
    return { hiddenParts, selectedBoardIds: s.selectedBoardIds.filter((id) => !hidden.has(id)) }
  }),
  setPartsHidden: (ids, hidden) => set((s) => {
    if (ids.length === 0) return {}
    const drop = new Set(ids)
    const hiddenParts = hidden ? [...new Set([...s.hiddenParts, ...ids])] : s.hiddenParts.filter((id) => !drop.has(id))
    return hidden ? { hiddenParts, selectedBoardIds: s.selectedBoardIds.filter((id) => !drop.has(id)) } : { hiddenParts }
  }),
  highlightedParts: [],
  togglePartsHighlight: (ids) => set((s) => (ids.length === 0 ? {} : { highlightedParts: toggleAll(s.highlightedParts, ids) })),
  // another step may hide selected parts: they leave the selection, so Del never hits a part you cannot see
  setAssemblyStep: (index) => set((s) => {
    const assemblyStep = Number.isFinite(index) ? Math.max(0, Math.round(index)) : 0
    const hidden = viewHiddenIds(useProjectStore.getState().project, { ...s, assemblyStep })
    const kept = s.selectedBoardIds.filter((id) => !hidden.has(id))
    return kept.length === s.selectedBoardIds.length ? { assemblyStep } : { assemblyStep, selectedBoardIds: kept }
  }),

  setActiveView: (view) => set({ activeView: view }),
  setActiveTool: (tool) => set({ activeTool: tool }),

  selectBoard: (assemblyId, boardId) =>
    set({ selectedAssemblyId: assemblyId, selectedBoardIds: boardId ? [boardId] : [] }),

  toggleBoardSelection: (assemblyId, boardId) =>
    set((s) => {
      if (s.selectedAssemblyId !== assemblyId) {
        return { selectedAssemblyId: assemblyId, selectedBoardIds: [boardId] }
      }
      const exists = s.selectedBoardIds.includes(boardId)
      return {
        selectedBoardIds: exists
          ? s.selectedBoardIds.filter((id) => id !== boardId)
          : [...s.selectedBoardIds, boardId]
      }
    }),

  // ⌘A: the parts you can see — not those the step view or the eye hides
  selectAllBoards: (assemblyId) =>
    set((s) => {
      const proj = useProjectStore.getState().project
      const assembly = proj.assemblies.find((a) => a.id === assemblyId)
      if (!assembly) return {}
      const hidden = viewHiddenIds(proj, s)
      return {
        selectedAssemblyId: assemblyId,
        selectedBoardIds: assembly.boards.filter((b) => !hidden.has(b.id)).map((b) => b.id)
      }
    }),

  deselectAll: () => set({ selectedBoardIds: [] }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  addMeasurement: (m) => set((s) => ({ measurements: [...s.measurements, m] })),
  clearMeasurements: () => set({ measurements: [] }),
  removeMeasurement: (idx) => set((s) => ({
    measurements: s.measurements.filter((_, i) => i !== idx)
  })),
  toggleStaticOverlay: () => set((s) => ({ showStaticOverlay: !s.showStaticOverlay })),
  toggleJointMarkers: () => set((s) => ({ showJointMarkers: !s.showJointMarkers })),
  toggleCollisionOverlay: () => set((s) => ({ showCollisionOverlay: !s.showCollisionOverlay })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setShowCuttingList: (show) => set({ showCuttingList: show }),
  setShowChatPanel: (show) => set({ showChatPanel: show }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setSnapSize: (size) => set({ snapSize: Math.max(1, size) }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  setStaticLoadKg: (kg) => set({ staticLoadKg: Math.max(0, kg) }),
  triggerFitView: () => set((s) => ({ fitViewTrigger: s.fitViewTrigger + 1 })),
  setShowParametersPanel: (show) => set({ showParametersPanel: show }),
  setShowHardwarePanel: (show) => set({ showHardwarePanel: show }),
  setShowNestingPanel: (show) => set({ showNestingPanel: show }),
  setShowCostPanel: (show) => set({ showCostPanel: show }),
  setShowBoringPanel: (show) => set({ showBoringPanel: show }),
  setShowTolerancePanel: (show) => set({ showTolerancePanel: show }),
  setShowShopDrawingsPanel: (show) => set({ showShopDrawingsPanel: show }),
  setShowKorpusPanel: (show) => set({ showKorpusPanel: show }),
  setShowDrawerCalcPanel: (show) => set({ showDrawerCalcPanel: show }),
  setShowHingeCalcPanel: (show) => set({ showHingeCalcPanel: show }),
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),
  setShowPanelHub: (show) => set({ showPanelHub: show }),
  setShowStaticSummary: (show) => set({ showStaticSummary: show }),
  setShowMeasurementPanel: (show) => set({ showMeasurementPanel: show }),
  toggleBoringOverlay: () => set((s) => ({ showBoringOverlay: !s.showBoringOverlay })),
  setShowMaterialsPanel: (show) => set({ showMaterialsPanel: show }),
  setViewLayout: (layout) => set({ viewLayout: layout }),
  setCollisionGraceMm: (mm) => set({ collisionGraceMm: Math.max(0, mm) }),
  setHasSeenWelcome: () => {
    localStorage.setItem('abrichten-welcomed', '1')
    set({ hasSeenWelcome: true })
  },
  setExportStatus: (msg) => {
    set({ exportStatus: msg })
    // long messages (e.g. a failed auto-save restore) stay readable; a newer toast is never cut short
    if (msg) setTimeout(() => { if (get().exportStatus === msg) set({ exportStatus: null }) }, Math.max(3000, msg.length * 60))
  },
  setChangedFile: (file) => set({ changedFile: file }),
  setShowJointDialog: (show) => set({ showJointDialog: show }),
  toggleAssemblyDims: () => set((s) => ({ showAssemblyDims: !s.showAssemblyDims })),
  setSnapIndicatorPos: (pos) => set({ snapIndicatorPos: pos }),
  setShowAssemblyDrawer: (show) => set({ showAssemblyDrawer: show }),
  setShowShortcutsOverlay: (show) => set({ showShortcutsOverlay: show }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setHudCollapsed: (collapsed) => {
    try { localStorage.setItem(HUD_COLLAPSED_KEY, collapsed ? '1' : '0') } catch { /* session only */ }
    set({ hudCollapsed: collapsed })
  },
  setStaticLegendCollapsed: (collapsed) => {
    try { localStorage.setItem(LEGEND_COLLAPSED_KEY, collapsed ? '1' : '0') } catch { /* session only */ }
    set({ staticLegendCollapsed: collapsed })
  },
  setInputDevice: (device) => {
    try { localStorage.setItem(INPUT_DEVICE_KEY, device) } catch { /* session only */ }
    set({ inputDevice: device })
  },
  closeTopModal: () => {
    const top = topModal(get())
    if (top === 'contextMenu') set({ contextMenu: null })
    // Esc on the startup question: undecided, so the next start asks again
    else if (top === 'changedFile') set({ changedFile: null })
    else if (top === 'welcome') get().setHasSeenWelcome()
    else if (top) set({ [top]: false })
  },
}))

// The workspace is the one source of the design lock the project store applies
setDesignLockSource(() => designLockedIn(useUIStore.getState()))

// Another project brings its own parts: what the eye hid and the X-ray picked out belongs to the one before
useProjectStore.subscribe((state, prev) => {
  if (state.project.id === prev.project.id) return
  const ui = useUIStore.getState()
  if (ui.hiddenParts.length || ui.highlightedParts.length) useUIStore.setState({ hiddenParts: [], highlightedParts: [] })
})

/**
 * View of the canvas a component renders in. QuadLayout gives every quadrant
 * its own view; null means "follow the store" (single layout).
 */
export const CanvasViewContext = createContext<ViewMode | null>(null)

/** View of the enclosing canvas — the quadrant's view in quad layout, else the store's activeView. */
export function useCanvasView(): ViewMode {
  const forced = useContext(CanvasViewContext)
  const storeView = useUIStore((s) => s.activeView)
  return forced ?? storeView
}


declare global { interface Window { __uiStore?: unknown } }
if (typeof window !== 'undefined') {
  window.__uiStore = useUIStore
}
