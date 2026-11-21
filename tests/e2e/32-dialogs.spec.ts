import { test, expect, type Page } from '@playwright/test'
import { bootWithSample, selectBoard, getBoard, getUI } from './helpers'

/**
 * Dialogs after the UX review: one dark Dialog contract, cut sizes as
 * length × width × thickness, guide prices in the cost panel, translated names
 * in the carcass preview and boring list, a live nesting result, the shop
 * drawings preview, the settings without the dead colour scheme, the welcome
 * screen, and the board context menu's new actions.
 */

const open = (page: Page, setter: string) =>
  page.evaluate((s) => (window.__uiStore.getState() as any)[s](true), setter)

/** Text of every cell of the table row that names the board */
const rowCells = (page: Page, name: string) =>
  page.getByRole('dialog').locator('tbody tr').filter({ hasText: name }).first().locator('td').allInnerTexts()

const OWN_DIALOGS = [
  'setShowCuttingList', 'setShowCostPanel', 'setShowNestingPanel', 'setShowKorpusPanel', 'setShowBoringPanel',
  'setShowShopDrawingsPanel', 'setShowParametersPanel', 'setShowMaterialsPanel', 'setShowHardwarePanel',
  'setShowTolerancePanel', 'setShowMeasurementPanel', 'setSettingsOpen'
]

test.describe('Dialogs', () => {
  test('every dialog follows the contract: labelled modal, focus inside, at most one primary, Esc closes', async ({ page }) => {
    await bootWithSample(page)
    for (const setter of OWN_DIALOGS) {
      await open(page, setter)
      const dialog = page.locator('[role="dialog"][aria-modal="true"]')
      await expect(dialog, setter).toHaveCount(1)
      const name = await dialog.evaluate((d) => document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent?.trim())
      expect(name, `${setter} has a title`).toBeTruthy()
      expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `${setter} takes focus`).toBe(true)
      expect(await dialog.locator('button.bg-action').count(), `${setter}: one primary at most`).toBeLessThanOrEqual(1)
      await expect(dialog.getByRole('button', { name: /^(Schließen|Close)$/ }).first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog, `${setter} closes on Esc`).toHaveCount(0)
    }
  })

  test('cutting list: length × width × thickness, grain relative to the length, grouping by cut size', async ({ page }) => {
    await bootWithSample(page)
    await open(page, 'setShowCuttingList')
    const dialog = page.getByRole('dialog', { name: /Zuschnittliste|Cutting List/ })
    await expect(dialog.getByRole('columnheader', { name: /Länge|Length/ })).toBeVisible()
    // side panel 18 × 720 × 300 (grain along the height): 720 × 300 × 18, along
    expect((await rowCells(page, 'Seitenwand Links')).slice(4, 9)).toEqual(['720', '300', '18', 'längs', 'E1'])
    // back 564 × 684 × 8: the height is the longer face side
    expect((await rowCells(page, 'Rückwand')).slice(4, 7)).toEqual(['684', '564', '8'])

    await dialog.getByLabel(/Gleiche gruppieren|Group identical/).check()
    const sides = await rowCells(page, 'Seitenwand')
    expect(sides[sides.length - 1]).toBe('2')
  })

  test('cutting list: battens get a cut plan on stock bars; lengths follow the display unit', async ({ page }) => {
    await bootWithSample(page)
    // three 40 × 60 spruce battens next to the sample cabinet
    await page.evaluate(() => {
      const st = window.__projectStore.getState()
      const a = st.project.assemblies[0].id
      for (const [name, len, z] of [['Latte A', 2660, 400], ['Latte B', 1070, 500], ['Latte C', 1780, 600]] as const) {
        st.addBoard(a, { name, width: len, height: 40, depth: 60, position: { x: 0, y: 0, z }, rotation: { x: 0, y: 0, z: 0 }, materialId: 'fichte', color: '#f5deb3' })
      }
    })
    await open(page, 'setShowCuttingList')
    const plan = page.getByTestId('bar-plan')
    await expect(plan).toBeVisible()
    // 2660 + 1070 on one 4 m bar (3980 usable), 1780 on the next
    await expect(plan.getByTestId('bar-row')).toHaveCount(2)
    await expect(plan.getByTestId('bar-row').first()).toContainText('2660 + 1070')
    // each piece with its part label (the sample cabinet has six parts, so the battens are 7–9)
    await expect(plan.getByTestId('bar-row').first()).toContainText('Wandschrank 7 Latte A · Wandschrank 8 Latte B')
    // in cm: the headers and the numbers follow the unit from the status bar
    await page.evaluate(() => window.__projectStore.getState().setDisplayUnit('cm'))
    await expect(plan.getByTestId('bar-row').first()).toContainText('266 + 107')
    await expect(page.getByRole('columnheader', { name: /(Länge|Length) \(cm\)/ })).toBeVisible()
    // a shorter stock length needs more bars
    await plan.getByTestId('bar-stockMm').fill('2000')
    await expect(plan.getByTestId('bar-row')).toHaveCount(2)
    await expect(plan).toContainText(/Latte A \(266 cm\)/)
  })

  test('cost: guide prices out of the box, an own price wins and is marked', async ({ page }) => {
    await bootWithSample(page)
    await open(page, 'setShowCostPanel')
    const dialog = page.getByRole('dialog', { name: /Kalkulation|Cost/ })
    const total = dialog.getByTestId('cost-total')
    await expect(total).not.toHaveText(/^€0[,.]00$/)
    await expect(dialog.locator('tbody tr').filter({ hasText: 'Multiplex Birke' })).toContainText(/Richtwert|guide/)
    const before = await total.innerText()

    await dialog.getByRole('button', { name: /Preise bearbeiten|Edit Prices/ }).click()
    const price = dialog.getByLabel(/^(Preis\/m² Multiplex Birke|Price\/m² Birch Plywood)$/)
    await price.fill('100')
    await price.press('Enter')
    expect(await page.evaluate(() => window.__projectStore.getState().project.materialPrices)).toEqual({ 'multiplex-birke': 100 })
    await expect(dialog.locator('tbody tr').filter({ hasText: 'Multiplex Birke' })).toContainText(/eigener Preis|own price/)
    await expect(total).not.toHaveText(before)
    // tabbing past a guide value does not turn it into an own price
    await dialog.getByLabel(/^(Preis\/m² Buche|Price\/m² Beech)$/).focus()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => Object.keys(window.__projectStore.getState().project.materialPrices))).toEqual(['multiplex-birke'])
  })

  test('carcass preview names the parts; boring list rows are translated', async ({ page }) => {
    await bootWithSample(page)
    await open(page, 'setShowKorpusPanel')
    const korpus = page.getByRole('dialog', { name: /Korpus|Cabinet/ })
    const preview = korpus.getByRole('region', { name: /Vorschau|Preview/ })
    await expect(preview).toContainText('Seite Links')
    await expect(preview).toContainText('Einlegeboden 1')
    await expect(preview).not.toContainText('—')
    await page.keyboard.press('Escape')

    await open(page, 'setShowBoringPanel')
    const boring = page.getByRole('dialog', { name: /32mm/ })
    // columns: No., assembly, name, side, …
    const sides = await boring.locator('tbody tr td:nth-child(4)').allInnerTexts()
    expect(new Set(sides.map((s) => s.trim()))).toEqual(new Set(['links', 'rechts']))
    const labels = await boring.locator('tbody tr td:nth-child(1)').allInnerTexts()
    expect(new Set(labels.map((s) => s.trim()))).toEqual(new Set(['Wandschrank 1', 'Wandschrank 2']))
  })

  test('nesting optimises on open and again when an input changes', async ({ page }) => {
    await bootWithSample(page)
    await open(page, 'setShowNestingPanel')
    const dialog = page.getByRole('dialog', { name: /Zuschnittoptimierung|Nesting/ })
    await expect(dialog.getByTestId('nesting-preview').locator('svg')).toBeVisible()
    await expect(dialog.getByRole('status')).toContainText(/Gesamt: 2 Platten|Total: 2 Sheets/i)
    await expect(dialog.getByRole('button', { name: /^(Optimieren|Optimize)$/ })).toHaveCount(0)
    // a sheet too low for the 702 × 564 back: recomputed without a click
    await expect(dialog.getByText(/passt nicht auf die Platte|does not fit the sheet/)).toHaveCount(0)
    await dialog.getByLabel(/Plattenhöhe|Sheet Height/i).fill('500')
    await expect(dialog.getByText(/1 Teil passt nicht auf die Platte|1 part does not fit the sheet/)).toBeVisible()
  })

  test('shop drawings show a sandboxed preview of what gets printed', async ({ page }) => {
    await bootWithSample(page)
    await open(page, 'setShowShopDrawingsPanel')
    const dialog = page.getByRole('dialog', { name: /Werkstattzeichnung|Shop Drawings/ })
    const frame = dialog.locator('iframe')
    await expect(frame).toHaveAttribute('sandbox', '')
    expect(await frame.getAttribute('srcdoc')).toContain('Seitenwand Links')
    await expect(page.frameLocator('iframe[title]').getByText('Bauteilzeichnungen')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /PDF drucken|Print PDF/ })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /DXF/ })).toBeVisible()
  })

  test('parameters explain formulas; settings drop the colour scheme and keep old files loading', async ({ page }) => {
    await bootWithSample(page)
    await open(page, 'setShowParametersPanel')
    const params = page.getByRole('dialog', { name: /Parameter/ })
    await expect(params).toContainText('=H-18')
    await expect(params).not.toContainText(/Beschriftungen/)
    await expect(params.getByPlaceholder(/^z\. B\./)).toBeVisible()
    await page.keyboard.press('Escape')

    await page.evaluate(() => localStorage.setItem('abrichten-settings', JSON.stringify({ theme: 'dark', apiKey: 'sk-old', csvDelimiter: ',' })))
    await open(page, 'setSettingsOpen')
    const settings = page.getByRole('dialog', { name: /Einstellungen|Settings/ })
    await expect(settings).not.toContainText(/Farbschema|Theme/)
    await settings.getByRole('button', { name: /KI \/ API|AI \/ API/ }).click()
    await expect(settings.locator('input[type="password"]')).toHaveValue('sk-old')
    await settings.getByRole('button', { name: /Übernehmen|Apply/ }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abrichten-settings') ?? '{}'))
    expect(saved.theme).toBeUndefined()
    expect(saved).toMatchObject({ apiKey: 'sk-old', csvDelimiter: ',' })
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
  })

  test('welcome: SVG icons, no dead tips button, shortcuts open the overview', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.removeItem('abrichten-welcomed') } catch { /* */ } })
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: /Willkommen|Welcome/ })
    await expect(dialog).toBeVisible()
    expect(await dialog.locator('li svg').count()).toBe(3)
    await expect(dialog).not.toContainText(/Mit Hinweisen lernen|Learn with Tips/)
    await dialog.getByRole('button', { name: /Tastenkürzel|Shortcuts/ }).click()
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => window.__uiStore.getState().showShortcutsOverlay)).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('abrichten-welcomed'))).toBe('1')
  })

  test('context menu: rotate in one undo step, joint for two boards, hide the assembly', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const menuAt = (boardId: string) => page.evaluate(({ a, b }) =>
      window.__uiStore.getState().setContextMenu({ x: 400, y: 300, boardId: b, assemblyId: a }), { a: assemblyId, b: boardId })

    // single board: no joint item
    await selectBoard(page, assemblyId, 'b-links')
    await menuAt('b-links')
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /Verbindung erstellen|Create joint/ })).toHaveCount(0)
    const past = await page.evaluate(() => (window.__projectStore.temporal.getState() as any).pastStates.length)
    await menu.getByRole('menuitem', { name: /90° drehen|Rotate 90°/ }).click()
    await expect(menu).toBeHidden()
    expect((await getBoard(page, 'b-links')).rotation.y).toBe(90)
    expect(await page.evaluate(() => (window.__projectStore.temporal.getState() as any).pastStates.length)).toBe(past + 1)

    // two boards: the joint item opens the joint dialog for them
    await page.evaluate((a) => window.__uiStore.setState({ selectedAssemblyId: a, selectedBoardIds: ['b-boden', 'b-deckel'] }), assemblyId)
    await menuAt('b-boden')
    await menu.getByRole('menuitem', { name: /Verbindung erstellen|Create joint/ }).click()
    await expect(page.getByRole('dialog', { name: /Verbindung hinzufügen|Add Joint/ })).toBeVisible()
    await page.keyboard.press('Escape')

    // hide the assembly: hidden, nothing selected
    await menuAt('b-boden')
    await menu.getByRole('menuitem', { name: /Baugruppe ausblenden|Hide assembly/ }).click()
    expect(await page.evaluate((a) => window.__projectStore.getState().project.assemblies.find((x: any) => x.id === a).visible, assemblyId)).toBe(false)
    expect((await getUI(page)).selectedBoardIds).toEqual([])
  })
})
