import { useEffect } from 'react'
import { Toolbar } from './components/layout/Toolbar'
import { StatusBar, SaveToast } from './components/layout/StatusBar'
import { CommandPalette } from './components/layout/CommandPalette'
import { ViewTabs } from './components/layout/ViewTabs'
import { SettingsDialog } from './components/layout/SettingsDialog'
import { AssemblyDrawer } from './components/layout/AssemblyDrawer'
import { UnifiedCanvas } from './components/UnifiedCanvas'
import { CuttingList } from './components/panels/CuttingList'
import { ChatPanel } from './components/ai/ChatPanel'
import { ContextMenu } from './components/ui/ContextMenu'
import { ParametersPanel } from './components/panels/ParametersPanel'
import { HardwarePanel } from './components/panels/HardwarePanel'
import { BoringPanel } from './components/panels/BoringPanel'
import { NestingPanel } from './components/panels/NestingPanel'
import { CostPanel } from './components/panels/CostPanel'
import { TolerancePanel } from './components/panels/TolerancePanel'
import { ShopDrawingsPanel } from './components/panels/ShopDrawingsPanel'
import { KorpusPanel } from './components/panels/KorpusPanel'
import { DrawerCalcPanel } from './components/panels/DrawerCalcPanel'
import { HingeCalcPanel } from './components/panels/HingeCalcPanel'
import { JointDialog } from './components/panels/JointDialog'
import { PanelHub } from './components/layout/PanelHub'
import { StaticSummaryPanel } from './components/panels/StaticSummaryPanel'
import { MeasurementPanel } from './components/panels/MeasurementPanel'
import { MaterialsPanel } from './components/panels/MaterialsPanel'
import { WelcomeDialog } from './components/onboarding/WelcomeDialog'
import { ChangedFileDialog } from './components/onboarding/ChangedFileDialog'
import { LoadChangesDialog } from './components/onboarding/LoadChangesDialog'
import { FloatingPropertiesCard } from './components/overlays/FloatingPropertiesCard'
import { AssemblyModePanel } from './components/panels/AssemblyModePanel'
import { AssemblyBand, AssemblyStepList, AssemblyTimeline } from './components/panels/AssemblyWorkspace'
import { ContextHUD } from './components/overlays/ContextHUD'
import { ShortcutsOverlay } from './components/overlays/ShortcutsOverlay'
import { QuadLayout } from './components/layout/QuadLayout'
import { ToolStrip } from './components/tools/ToolStrip'
import { useUIStore } from './store/useUIStore'
import { useProjectStore, isProjectDirty } from './store/useProjectStore'
import { useKeyboard } from './hooks/useKeyboard'
import { useAutoSave } from './hooks/useAutoSave'
import { restoreAutoSave } from './services/projectFile'
import { useUnsavedChanges } from './hooks/useUnsavedChanges'
import { StaticLegend } from './components/overlays/StaticLegend'
import { setDesignLockedNotice } from './store/designLock'
import { designKey } from './hooks/useDesignLocked'
import { keyCombo } from './utils/shortcutKeys'
import i18n from './i18n'

export default function App() {
  useKeyboard()
  useAutoSave()
  useUnsavedChanges()
  const unsaved = useProjectStore(isProjectDirty)
  const showChatPanel = useUIStore((s) => s.showChatPanel)
  const viewLayout    = useUIStore((s) => s.viewLayout)
  const workspace     = useUIStore((s) => s.workspace)

  // Restore project from IndexedDB on startup (an unreadable save is kept as a backup)
  useEffect(() => { restoreAutoSave() }, [])

  // A change the assembly workspace refuses says where it belongs (store/designLock.ts)
  useEffect(() => setDesignLockedNotice((kind) => useUIStore.getState().setExportStatus(
    i18n.t(`designLock.${kind}`, { key: designKey(), undo: keyCombo('Z', ['cmd']), redo: keyCombo('Z', ['cmd', 'shift']) })
  )), [])

  // Every project load — sample, open file, restore, new — frames the model.
  // A loaded or new project always brings its own id.
  useEffect(() => useProjectStore.subscribe((state, prev) => {
    if (state.project.id !== prev.project.id) useUIStore.getState().triggerFitView()
  }), [])

  return (
    <div className="flex flex-col h-screen w-screen bg-chrome-deep text-gray-900 select-none">
      {/* Top toolbar */}
      <Toolbar />
      {/* Assembly workspace: which step is shown, how to leave */}
      <AssemblyBand />

      <div className="flex-1 flex min-h-0">
        {/* Parts column (tree or groups); in the assembly workspace the list of steps */}
        <AssemblyDrawer />
        <AssemblyStepList />

        <main className="flex-1 flex flex-col min-w-0">
          {/* View tabs */}
          <ViewTabs />

          {/* Canvas area — overlays positioned absolutely inside */}
          <div className="flex-1 relative overflow-hidden bg-canvas">
            {viewLayout === 'quad' ? <QuadLayout /> : <UnifiedCanvas />}
            {/* Floating cards over the canvas (z-30) */}
            <ToolStrip />
            {/* Messages sit at the top of the canvas, under the view tabs: they never cover a control */}
            <SaveToast />
            <FloatingPropertiesCard />
            <ContextHUD />
            <AssemblyTimeline />
            {/* Static legend (renders only while the static overlay is on); in the
                assembly workspace above the step timeline, so colour and legend go together */}
            <div className={`absolute ${workspace === 'assembly' ? 'bottom-28' : 'bottom-3'} left-1/2 -translate-x-1/2 z-30`}>
              <StaticLegend />
            </div>
          </div>
        </main>

        {/* Right column of the assembly workspace: the shown step */}
        <AssemblyModePanel />
      </div>

      {/* Status bar, with the unsaved-changes marker */}
      <StatusBar unsaved={unsaved} />

      {/* AI drawer (fixed, overlays the canvas) */}
      {showChatPanel && workspace !== 'assembly' && <ChatPanel />}

      {/* Modals & overlays */}
      <ShortcutsOverlay />
      <CommandPalette />
      <SettingsDialog />
      <CuttingList />
      <ContextMenu />
      <ParametersPanel />
      <HardwarePanel />
      <BoringPanel />
      <NestingPanel />
      <CostPanel />
      <TolerancePanel />
      <ShopDrawingsPanel />
      <KorpusPanel />
      <DrawerCalcPanel />
      <HingeCalcPanel />
      <JointDialog />
      <PanelHub />
      <StaticSummaryPanel />
      <MeasurementPanel />
      <MaterialsPanel />
      <WelcomeDialog />
      <ChangedFileDialog />
      <LoadChangesDialog />
    </div>
  )
}
