import { test, expect } from '@playwright/test'
import { bootWithSample } from './helpers'

/**
 * Regression: opening the cutting list threw React #310 ("rendered more hooks
 * than during the previous render") because an early `return null` sat above
 * the useMemo hooks, and without an error boundary the whole tree unmounted
 * (white window). Every panel toggle is exercised once; none may raise a page
 * error or empty the root.
 */
const PANEL_SETTERS = [
  'setShowCuttingList', 'setShowNestingPanel', 'setShowCostPanel', 'setShowHardwarePanel',
  'setShowBoringPanel', 'setShowParametersPanel', 'setShowTolerancePanel', 'setShowShopDrawingsPanel',
  'setShowKorpusPanel', 'setShowDrawerCalcPanel', 'setShowHingeCalcPanel', 'setShowPanelHub',
  'setShowStaticSummary', 'setShowMeasurementPanel', 'setShowMaterialsPanel', 'setShowCommandPalette',
  'setShowAssemblyDrawer', 'setShowShortcutsOverlay', 'setShowChatPanel', 'setSettingsOpen'
]

test.describe('Panels open without crashing', () => {
  test('cutting list opens, lists parts and the fastener summary', async ({ page }) => {
    await bootWithSample(page)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    await expect(page.locator('table').first()).toBeVisible()
    expect(pageErrors).toEqual([])

    // A joint with fasteners must show up in the summary table (joints may span assemblies)
    await page.evaluate(() => {
      const store = window.__projectStore.getState()
      const p = store.project
      const [a, b] = p.assemblies[0].boards
      store.loadProject({
        ...p,
        assemblies: p.assemblies.map((asm: any, i: number) => i !== 0 ? asm : {
          ...asm,
          joints: [{ id: 'jf', type: 'screw', boardA: a.id, boardB: b.id, position: { x: 0, y: 0, z: 0 },
                     fasteners: [{ id: 'f', type: 'wood_screw', diameter: 5, length: 80, quantity: 7 }, { id: 'g', type: 'angle_bracket', diameter: 60, length: 60, quantity: 2 }] }]
        })
      })
    })
    await expect(page.getByText(/Verbindungsmittel|Fasteners/)).toBeVisible()
    await expect(page.getByText('5 × 80')).toBeVisible()
    await expect(page.getByText('60 × 60')).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('every panel toggle opens and closes without a page error', async ({ page }) => {
    await bootWithSample(page)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    for (const setter of PANEL_SETTERS) {
      await page.evaluate((s) => { const ui = window.__uiStore.getState(); if (typeof ui[s] === 'function') ui[s](true) }, setter)
      await page.waitForTimeout(120)
      const rootChildren = await page.evaluate(() => document.getElementById('root')?.children.length ?? 0)
      expect(rootChildren, `${setter} emptied the root`).toBeGreaterThan(0)
      await page.evaluate((s) => { const ui = window.__uiStore.getState(); if (typeof ui[s] === 'function') ui[s](false) }, setter)
    }
    expect(pageErrors).toEqual([])
  })

  test('cost panel lists project-defined hardware attached to a board', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => {
      const store = window.__projectStore.getState()
      const p = store.project
      const first = p.assemblies[0].boards[0]
      store.loadProject({
        ...p,
        customHardware: [{ id: 'hw-x', name: 'Abfallsammler Test', nameEn: 'Waste bin test', category: 'slides', unitPrice: 99 }],
        assemblies: p.assemblies.map((a: any, i: number) => i !== 0 ? a : {
          ...a,
          boards: a.boards.map((b: any) => b.id !== first.id ? b : { ...b, hardware: [{ hardwareId: 'hw-x', quantity: 2 }] })
        })
      })
      window.__uiStore.getState().setShowCostPanel(true)
    })
    await expect(page.getByText(/Abfallsammler Test|Waste bin test/)).toBeVisible()
  })
})
