import { create } from 'zustand'
import type { ToolMode, ViewMode, Measurement } from '../types/measurement'
import { useProjectStore } from './useProjectStore'

export type TransformMode = 'translate' | 'rotate' | 'scale'

interface ContextMenuState {
  x: number
  y: number
  boardId: string
  assemblyId: string
}

interface UIState {
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
  staticWarningCount: number
  // Onboarding
  hasSeenWelcome: boolean
  tooltipsEnabled: boolean
  seenTipIds: string[]
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
  setStaticWarningCount: (n: number) => void
  setHasSeenWelcome: () => void
  setTooltipsEnabled: (v: boolean) => void
  markTipSeen: (id: string) => void
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
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'front',
  activeTool: 'select',
  selectedBoardIds: [],
  selectedAssemblyId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  measurements: [],
  showStaticOverlay: false,
  showJointMarkers: true,
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
  staticWarningCount: 0,
  hasSeenWelcome: typeof localStorage !== 'undefined' && !!localStorage.getItem('abrichten-welcomed'),
  tooltipsEnabled: false,
  seenTipIds: (() => { try { return JSON.parse(localStorage.getItem('abrichten-seen-tips') ?? '[]') } catch { return [] } })(),
  exportStatus: null,
  showJointDialog: false,
  showAssemblyDims: false,
  snapIndicatorPos: null,
  showAssemblyDrawer: false,
  showShortcutsOverlay: false,
  showGrid: true,

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
  setStaticWarningCount: (n) => set({ staticWarningCount: n }),
  setHasSeenWelcome: () => {
    localStorage.setItem('abrichten-welcomed', '1')
    set({ hasSeenWelcome: true })
  },
  setTooltipsEnabled: (v) => set({ tooltipsEnabled: v }),
  markTipSeen: (id) => set((s) => {
    const ids = [...s.seenTipIds, id]
    localStorage.setItem('abrichten-seen-tips', JSON.stringify(ids))
    return { seenTipIds: ids }
  }),
  setExportStatus: (msg) => {
    set({ exportStatus: msg })
    if (msg) setTimeout(() => set({ exportStatus: null }), 3000)
  },
  setShowJointDialog: (show) => set({ showJointDialog: show }),
  toggleAssemblyDims: () => set((s) => ({ showAssemblyDims: !s.showAssemblyDims })),
  setSnapIndicatorPos: (pos) => set({ snapIndicatorPos: pos }),
  setShowAssemblyDrawer: (show) => set({ showAssemblyDrawer: show }),
  setShowShortcutsOverlay: (show) => set({ showShortcutsOverlay: show }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
}))


declare global { interface Window { __uiStore?: unknown } }
if (typeof window !== 'undefined') {
  window.__uiStore = useUIStore
}
