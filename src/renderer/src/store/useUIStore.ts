import { createContext, useContext } from 'react'
import { create } from 'zustand'
import type { ToolMode, ViewMode, Measurement } from '../types/measurement'
import { useProjectStore } from './useProjectStore'
import { isInputDevice, type InputDevice } from '../utils/canvasInput'

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
  /** Assembly mode (Montage): the 3D view shows the steps one at a time. Not a modal. */
  assemblyMode: boolean
  /** Step shown in assembly mode (index into project.assemblySteps) */
  assemblyStep: number
  /** Turning it on clears the selection (it may sit on parts the step view hides) */
  setAssemblyMode: (on: boolean) => void
  setAssemblyStep: (index: number) => void
  /** Workspace: design (the model) or assembly (steps). Assembly mode is the assembly workspace. */
  workspace: Workspace
  setWorkspace: (workspace: Workspace) => void
  /** How the parts column groups the parts (the assembly workspace shows its steps instead) */
  drawerGroupBy: DrawerGroupBy
  setDrawerGroupBy: (groupBy: DrawerGroupBy) => void
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

export type ModalId = (typeof MODAL_FLAGS)[number] | 'contextMenu' | 'welcome'

/** The topmost open modal — context menu, dialog, panel or the welcome screen — or null. */
export function topModal(s: UIState): ModalId | null {
  if (s.contextMenu) return 'contextMenu'
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
  showJointDialog: false,
  showAssemblyDims: false,
  snapIndicatorPos: null,
  showAssemblyDrawer: false,
  showShortcutsOverlay: false,
  showGrid: true,
  hudCollapsed: storedFlag(HUD_COLLAPSED_KEY),
  staticLegendCollapsed: storedFlag(LEGEND_COLLAPSED_KEY),
  inputDevice: storedInputDevice(),
  assemblyMode: false,
  assemblyStep: 0,
  setAssemblyMode: (on) => get().setWorkspace(on ? 'assembly' : 'design'),
  workspace: 'design',
  setWorkspace: (workspace) => {
    if (!WORKSPACES.includes(workspace) || workspace === get().workspace) return
    set({
      workspace,
      assemblyMode: workspace === 'assembly',
      ...(workspace === 'assembly' ? { selectedBoardIds: [] } : {})
    })
  },
  drawerGroupBy: 'assembly',
  setDrawerGroupBy: (groupBy) => set({ drawerGroupBy: groupBy }),
  setAssemblyStep: (index) => set({ assemblyStep: Number.isFinite(index) ? Math.max(0, Math.round(index)) : 0 }),

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

  selectAllBoards: (assemblyId) =>
    set(() => {
      const proj = useProjectStore.getState().project
      const assembly = proj.assemblies.find((a) => a.id === assemblyId)
      if (!assembly) return {}
      return {
        selectedAssemblyId: assemblyId,
        selectedBoardIds: assembly.boards.map((b) => b.id)
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
    else if (top === 'welcome') get().setHasSeenWelcome()
    else if (top) set({ [top]: false })
  },
}))

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
