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
import { FloatingPropertiesCard } from './components/overlays/FloatingPropertiesCard'
import { ContextHUD } from './components/overlays/ContextHUD'
import { ShortcutsOverlay } from './components/overlays/ShortcutsOverlay'
import { QuadLayout } from './components/layout/QuadLayout'
import { useProjectStore } from './store/useProjectStore'
import { useUIStore } from './store/useUIStore'
import { useKeyboard } from './hooks/useKeyboard'
import { useAutoSave } from './hooks/useAutoSave'
import { loadProjectFromDB } from './services/storage'

export default function App() {
  useKeyboard()
  useAutoSave()
  const showChatPanel = useUIStore((s) => s.showChatPanel)
  const viewLayout    = useUIStore((s) => s.viewLayout)

  // Restore project from IndexedDB on startup
  useEffect(() => {
    loadProjectFromDB()
      .then((saved) => {
        if (saved) {
          useProjectStore.getState().loadProject(saved)
        }
      })
      .catch((err) => console.error('Failed to restore project:', err))
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 text-gray-900 select-none">
      {/* Top toolbar */}
      <Toolbar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* View tabs */}
        <ViewTabs />

        {/* Canvas area — full width, overlays positioned absolutely inside */}
        <div className="flex-1 relative overflow-hidden">
          {viewLayout === 'quad' ? <QuadLayout /> : <UnifiedCanvas />}
          {/* Floating glass cards over the canvas */}
          <FloatingPropertiesCard />
          <ContextHUD />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Drawers (fixed, overlay the canvas) */}
      <AssemblyDrawer />
      {showChatPanel && <ChatPanel />}

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
      <SaveToast />
    </div>
  )
}
