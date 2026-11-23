import { test, expect } from '@playwright/test'
import { bootWithSample } from './helpers'

/*
 * Air between boards in the statics (Wunschliste, Statik Stufe 1, 23.11.): a drawer side
 * screwed to the carcass side across 12.7 mm of air connects nothing, until the runner on
 * it says which gap it bridges. The range is typed in the hardware list (Beschläge › Eigene)
 * as from–to; it is stored when focus leaves the pair, as one undo step.
 */
test('a screw across air is reported until the runner says it bridges the gap', async ({ page }) => {
  await bootWithSample(page)
  await page.evaluate(() => {
    const board = (id: string, name: string, w: number, h: number, d: number, x: number, y: number, extra = {}) => ({
      id, name, width: w, height: h, depth: d, position: { x, y, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      materialId: 'multiplex-birke', color: '#e8d5b7', ...extra
    })
    window.__projectStore.getState().loadProject({
      id: 'gap', name: 'Spalt', displayUnit: 'mm', language: 'de', createdAt: '', updatedAt: '',
      customHardware: [{ id: 'runner', name: 'Auszug Test', nameEn: 'Runner test', category: 'slides', unitPrice: 9 }],
      assemblies: [{
        id: 'a', name: 'Schub', visible: true,
        boards: [
          board('side', 'Seitenwand', 18, 720, 500, 0, 0),
          board('drawer', 'Schubkastenseite', 12, 150, 450, 30.7, 100, { hardware: [{ hardwareId: 'runner', quantity: 1 }] })
        ],
        joints: [{ id: 'j', type: 'screw', boardA: 'side', boardB: 'drawer', position: { x: 0, y: 0, z: 0 }, fasteners: [] }]
      }]
    })
    window.__uiStore.getState().setShowStaticSummary(true)
  })
  const summary = page.locator('[aria-labelledby="static-summary-title"]')
  await expect(summary.getByTestId('static-joint-air').first()).toContainText('Schraubenverbindung über 12,7 mm Luft')
  await expect(summary).toContainText('1 ohne Auflager')
  await page.evaluate(() => { window.__uiStore.getState().setShowStaticSummary(false); window.__uiStore.getState().setShowHardwarePanel(true) })

  await page.getByRole('tab', { name: 'Eigene' }).click()
  const from = page.getByRole('textbox', { name: 'Überbrückt Spalt (mm) von: Auszug Test' })
  const to = page.getByRole('textbox', { name: 'Überbrückt Spalt (mm) bis: Auszug Test' })
  const range = () => page.evaluate(() => window.__projectStore.getState().project.customHardware?.[0].bridgesMm ?? null)
  await from.fill('12,5')
  await from.press('Tab')
  await expect(to).toBeFocused()
  expect(await range(), 'still inside the pair: nothing stored yet').toBeNull()
  await to.fill('13')
  await to.press('Tab')
  await expect.poll(range).toEqual([12.5, 13])

  // one undo step takes the whole range back, redo brings it again (the dialog is closed
  // first: it covers the toolbar, and shortcuts do not reach the model behind a dialog)
  await page.getByRole('button', { name: 'Schließen' }).last().click()
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect.poll(range).toBeNull()
  await page.evaluate(() => window.__uiStore.getState().setShowHardwarePanel(true))
  await page.getByRole('tab', { name: 'Eigene' }).click()
  await expect(from).toHaveValue('')
  await expect(to).toHaveValue('')
  await page.getByRole('button', { name: 'Schließen' }).last().click()
  await page.getByRole('button', { name: 'Wiederherstellen' }).click()
  await expect.poll(range).toEqual([12.5, 13])

  // the gap is explained now: the drawer side hangs on its runner, nothing is reported
  await page.evaluate(() => window.__uiStore.getState().setShowStaticSummary(true))
  await expect(summary).toContainText('0 ohne Auflager')
  await expect(summary.getByTestId('static-joint-air')).toHaveCount(0)
})

/*
 * Catalogue hardware has no range of its own: a shelf on catalogue shelf pins, 1 mm short at
 * each end, has no support until the project gives the pins the end play they allow.
 */
test('catalogue shelf pins explain the end play once the project gives them a range', async ({ page }) => {
  await bootWithSample(page)
  await page.evaluate(() => {
    const board = (id: string, name: string, w: number, h: number, d: number, x: number, y: number, extra = {}) => ({
      id, name, width: w, height: h, depth: d, position: { x, y, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      materialId: 'multiplex-birke', color: '#e8d5b7', ...extra
    })
    window.__projectStore.getState().loadProject({
      id: 'pins', name: 'Bodenträger', displayUnit: 'mm', language: 'de', createdAt: '', updatedAt: '',
      assemblies: [{
        id: 'a', name: 'Regal', visible: true, joints: [],
        boards: [
          board('l', 'Seite links', 18, 720, 300, 0, 0),
          board('r', 'Seite rechts', 18, 720, 300, 584, 0),
          board('s', 'Fachboden', 564, 19, 300, 19, 400, { hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 4 }] })
        ]
      }]
    })
    window.__uiStore.getState().setShowStaticSummary(true)
  })
  const summary = page.locator('[aria-labelledby="static-summary-title"]')
  await expect(summary).toContainText('1 ohne Auflager')
  await expect(summary.getByTestId('static-air').first()).toContainText('Luft 1 mm')
  await page.evaluate(() => { window.__uiStore.getState().setShowStaticSummary(false); window.__uiStore.getState().setShowHardwarePanel(true) })
  await page.getByRole('tab', { name: 'Regalbodenträger' }).click()
  const from = page.getByRole('textbox', { name: 'Überbrückt Spalt (mm) von: Regalbodenträger 5mm', exact: true })
  const to = page.getByRole('textbox', { name: 'Überbrückt Spalt (mm) bis: Regalbodenträger 5mm', exact: true })
  await from.fill('0')
  await to.fill('3')
  await to.press('Enter')
  await expect.poll(() => page.evaluate(() => window.__projectStore.getState().project.hardwareBridges ?? null)).toEqual({ 'shelf-pin-5mm': [0, 3] })
  await page.getByRole('button', { name: 'Schließen' }).last().click()
  await page.evaluate(() => window.__uiStore.getState().setShowStaticSummary(true))
  await expect(summary).toContainText('0 ohne Auflager')
})
