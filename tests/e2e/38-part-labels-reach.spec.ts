import { test, expect, type Page } from '@playwright/test'
import { bootWithSample, deselectAll, selectBoard } from './helpers'

/*
 * The part label ("Wandschrank 2") reaches every place that names a part, not only the
 * lists: the label on the selected part in 3D, the static summary, the joints in the
 * properties card, the joint dialog — and the cutting list filter finds it. The panel
 * menu opens the cutting list; the short word of an assembly shows as a suggestion
 * until one is set.
 */

const label = (page: Page, id: string) => page.evaluate((i) => {
  const p = window.__projectStore.getState().project
  for (const a of p.assemblies) {
    const b = a.boards.find((x: any) => x.id === i)
    if (b) return `${a.shortName ?? a.name.split(' ')[0]} ${b.partNo}`
  }
  return ''
}, id)

test.describe('Part labels everywhere', () => {
  test('3D label, properties card joints and the joint dialog name parts with their label', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().setActiveView('3d'))
    await selectBoard(page, assemblyId, 'b-links')
    await expect(page.getByTestId('selection-pill-name')).toHaveText(`${await label(page, 'b-links')} Seitenwand Links`)

    // the joints of the selected part: each partner with its label
    const card = page.getByTestId('card-part-label').locator('xpath=ancestor::div[contains(@class,"rounded-xl")]')
    const partnerLabels = await card.getByTestId('part-name-label').allTextContents()
    expect(partnerLabels.length).toBeGreaterThan(0)
    for (const l of partnerLabels) expect(l).toMatch(/^Wandschrank \d+$/)

    // the joint dialog: board A with its label, the choice of B too
    await page.evaluate(() => window.__uiStore.getState().setShowJointDialog(true))
    const dialog = page.getByRole('dialog').filter({ hasText: /Bauteil A|Board A/ })
    await expect(dialog.getByTestId('part-name-label').first()).toHaveText(await label(page, 'b-links'))
    const options = await dialog.getByRole('combobox', { name: /Bauteil B|Board B/ }).locator('option').allTextContents()
    expect(options.slice(1).every((o) => /^Wandschrank \d+ /.test(o))).toBe(true)
  })

  test('static summary rows carry the label', async ({ page }) => {
    await bootWithSample(page)
    await deselectAll(page)
    await page.evaluate(() => window.__uiStore.getState().setShowStaticSummary(true))
    const rowLabels = await page.getByRole('dialog').getByTestId('part-name-label').allTextContents()
    expect(rowLabels.length).toBeGreaterThan(0)
    for (const l of rowLabels) expect(l).toMatch(/^Wandschrank \d+$/)
  })

  test('the cutting list filter finds a part by its label; the panel menu opens the list', async ({ page }) => {
    await bootWithSample(page)
    await deselectAll(page)
    await page.evaluate(() => window.__uiStore.getState().setShowPanelHub(true))
    await expect(page.getByText(/^(Plattenbelegung|Sheet layout)$/)).toBeVisible()
    await page.getByText(/^(Zuschnittliste|Cutting List)$/).click()
    const dialog = page.getByRole('dialog', { name: /Zuschnittliste|Cutting list/i })
    await expect(dialog).toBeVisible()

    const filter = dialog.getByRole('textbox', { name: /filtern|Filter/ })
    await filter.fill('wandschrank 3')
    await expect(dialog.getByTestId('cut-label')).toHaveText(['Wandschrank 3'])
    // a short word alone finds every part of the assembly
    await filter.fill('Wandschrank')
    await expect(dialog.getByTestId('cut-label')).toHaveCount(6)
  })

  test('short word: a suggestion until set; group names keep their room', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().setShowAssemblyDrawer(true))
    const chip = page.getByTestId(`short-name-${assemblyId}`)
    await expect(chip).toHaveAttribute('data-suggested', 'true')
    const name = page.locator(`[data-assembly-id="${assemblyId}"] span[title="Wandschrank"]`)
    expect((await name.boundingBox())!.width).toBeGreaterThanOrEqual(80)

    await chip.click()
    const field = page.getByRole('textbox', { name: /Kurzwort|Short word/ })
    await field.fill('Schrank')
    await field.press('Enter')
    await expect(chip).toHaveAttribute('data-suggested', 'false')

    // renaming the assembly keeps the labels
    await page.evaluate((a) => window.__projectStore.getState().renameAssembly(a, 'Hängeschrank Flur'), assemblyId)
    await expect(chip).toHaveText('Schrank')
  })
})
