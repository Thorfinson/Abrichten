import { test, expect, Page } from '@playwright/test'
import { bootWithSample, selectBoard } from './helpers'

/**
 * The hinge and drawer calculators act on the model: hinges go onto the selected
 * door (and show up in the boring list), the drawer box becomes a new assembly
 * in one undo step.
 */

const undoSteps = (page: Page) => page.evaluate(() => (window.__projectStore.temporal.getState() as any).pastStates.length as number)

test.describe('Calculators that act on the model', () => {
  test('hinge calculator: prefilled from the selected door, apply attaches the hinges', async ({ page }) => {
    await bootWithSample(page)
    await selectBoard(page, 'asm-1', 'b-links')   // 18 × 720 × 300, stands upright
    await page.evaluate(() => window.__uiStore.getState().setShowHingeCalcPanel(true))
    const dialog = page.getByRole('dialog', { name: /Scharnier|Hinge/ })
    await expect(dialog).toBeVisible()
    const numberRow = (label: RegExp) => dialog.locator('label', { hasText: label }).locator('xpath=following-sibling::input')
    await expect(numberRow(/^(Türhöhe|Door Height)$/)).toHaveValue('720')
    await expect(numberRow(/Türdicke|Door thickness|Door Thickness/)).toHaveValue('18')

    await dialog.getByRole('combobox').first().selectOption('hettich-sensys')
    const steps = await undoSteps(page)
    await dialog.getByRole('button', { name: /Auf gewählte Tür anwenden|Apply to selected door/ }).click()
    await expect(dialog).toBeHidden()
    const hardware = await page.evaluate(() =>
      window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === 'b-links').hardware)
    expect(hardware).toEqual([{ hardwareId: 'hettich-sensys-110', quantity: 2 }])
    expect(await undoSteps(page)).toBe(steps + 1)
    await expect(page.getByText(/Bohrliste zeigt die Töpfe|boring list shows the cups/)).toBeVisible()

    // applying another system replaces the hinges instead of adding a second set
    await page.evaluate(() => window.__uiStore.getState().setShowHingeCalcPanel(true))
    await dialog.getByRole('combobox').first().selectOption('blum-clip-top')
    await dialog.getByRole('button', { name: /Auf gewählte Tür anwenden|Apply to selected door/ }).click()
    const again = await page.evaluate(() =>
      window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === 'b-links').hardware)
    expect(again).toEqual([{ hardwareId: 'blum-clip-top-110', quantity: 2 }])

    // the boring list shows two Ø35 cups on that panel
    await page.evaluate(() => window.__uiStore.getState().setShowBoringPanel(true))
    const boring = page.getByRole('dialog', { name: /32mm/ })
    await boring.getByRole('checkbox', { name: /Auto aus Beschlägen|Auto from hardware/ }).check()
    const cups = boring.locator('tbody tr').filter({ hasText: 'Seitenwand Links' }).filter({ has: page.locator('td', { hasText: /^35$/ }) })
    await expect(cups).toHaveCount(2)
  })

  test('hinge calculator without a single selection cannot apply', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().deselectAll())
    await page.evaluate(() => window.__uiStore.getState().setShowHingeCalcPanel(true))
    const dialog = page.getByRole('dialog', { name: /Scharnier|Hinge/ })
    await expect(dialog.getByRole('button', { name: /Auf gewählte Tür anwenden|Apply to selected door/ })).toBeDisabled()
  })

  test('drawer calculator: creates the box next to the selection as one undo step', async ({ page }) => {
    await bootWithSample(page)
    await selectBoard(page, 'asm-1', 'b-rechts')   // right side ends at x = 600
    await page.evaluate(() => window.__uiStore.getState().setShowDrawerCalcPanel(true))
    const dialog = page.getByRole('dialog', { name: /Schublade|Drawer/ })
    await expect(dialog).toBeVisible()
    const steps = await undoSteps(page)
    await dialog.getByRole('button', { name: /Schubkasten erzeugen|Create drawer box/ }).click()
    await expect(dialog).toBeHidden()

    const result = await page.evaluate(() => {
      const p = window.__projectStore.getState().project
      const ui = window.__uiStore.getState()
      const asm = p.assemblies[p.assemblies.length - 1]
      return {
        count: p.assemblies.length,
        boards: asm.boards.map((b: any) => ({ w: b.width, h: b.height, d: b.depth, x: b.position.x })),
        selected: ui.selectedBoardIds,
        firstId: asm.boards[0].id,
        selectedAssembly: ui.selectedAssemblyId,
        asmId: asm.id
      }
    })
    expect(result.count).toBe(2)
    // default: 500 wide opening, Blum TANDEM (12.5 per side) → 475 wide, 150 high → class C 128, 500 slide
    expect(result.boards).toEqual([
      { w: 16, h: 128, d: 500, x: 650 },
      { w: 16, h: 128, d: 500, x: 650 + 475 - 16 },
      { w: 443, h: 128, d: 16, x: 666 },
      { w: 443, h: 128, d: 16, x: 666 },
      { w: 443, h: 16, d: 468, x: 666 }
    ])
    expect(result.selected).toEqual([result.firstId])
    expect(result.selectedAssembly).toBe(result.asmId)
    expect(await undoSteps(page)).toBe(steps + 1)

    await page.evaluate(() => window.__projectStore.temporal.getState().undo())
    expect(await page.evaluate(() => window.__projectStore.getState().project.assemblies.length)).toBe(1)
  })
})
