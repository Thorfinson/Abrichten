import { test, expect, type Page } from '@playwright/test'
import { bootWithSample, deselectAll } from './helpers'

/*
 * Part labels for the workshop: the assembly's short word plus the part's fixed
 * number within it ("Schrank 2"), the same in the parts column, the properties
 * card and the cutting list (utils/partLabel.ts). The short word is set at the
 * assembly in the parts column; the sample cabinet's group is "Wandschrank".
 */

const labelsInColumn = (page: Page) => page.getByTestId('part-label').allTextContents()
const cutLabels = (page: Page) => page.getByTestId('cut-label').allTextContents()

async function openColumn(page: Page, assemblyId: string): Promise<void> {
  await page.evaluate(() => window.__uiStore.getState().setShowAssemblyDrawer(true))
  // the group opens with its parts once one of them is selected
  await page.evaluate((a) => {
    const b = window.__projectStore.getState().project.assemblies.find((x: any) => x.id === a).boards[0].id
    window.__uiStore.getState().selectBoard(a, b)
  }, assemblyId)
}

test.describe('Part labels (Teilenummern)', () => {
  test('every part has its label; the short word is changed at the assembly', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await openColumn(page, assemblyId)
    expect(await labelsInColumn(page)).toEqual(['Wandschrank 1', 'Wandschrank 2', 'Wandschrank 3', 'Wandschrank 4', 'Wandschrank 5', 'Wandschrank 6'])
    // the properties card of the selected part shows it too
    await expect(page.getByTestId('card-part-label')).toHaveText('Wandschrank 1')

    const chip = page.getByTestId(`short-name-${assemblyId}`)
    await expect(chip).toHaveText('Wandschrank')
    await chip.click()
    const field = page.getByRole('textbox', { name: /Kurzwort|Short word/ })
    await field.fill('Schrank')
    await field.press('Enter')
    await expect(chip).toHaveText('Schrank')
    expect((await labelsInColumn(page)).slice(0, 2)).toEqual(['Schrank 1', 'Schrank 2'])
    await expect(page.getByTestId('card-part-label')).toHaveText('Schrank 1')
    // saved with the project, one undo step
    expect(await page.evaluate((a) => window.__projectStore.getState().project.assemblies.find((x: any) => x.id === a).shortName, assemblyId)).toBe('Schrank')
    await page.evaluate(() => window.__projectStore.temporal.getState().undo())
    await expect(chip).toHaveText('Wandschrank')
  })

  test('a short word another assembly uses is refused', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const otherId = await page.evaluate(() => {
      const st = window.__projectStore.getState()
      const id = st.addAssembly('Unterschrank') as string
      st.addBoard(id, { name: 'Boden', width: 600, height: 18, depth: 560, position: { x: 0, y: 0, z: 1000 }, rotation: { x: 0, y: 0, z: 0 }, materialId: 'spanplatte', color: '#D2B48C' })
      return id
    })
    await openColumn(page, assemblyId)
    await page.getByTestId(`short-name-${otherId}`).click()
    const field = page.getByRole('textbox', { name: /Kurzwort|Short word/ })
    await field.fill('wandschrank')
    await field.press('Enter')
    await expect(page.getByText(/Das Kurzwort „wandschrank“ hat schon eine andere Baugruppe/)).toBeVisible()
    await expect(page.getByTestId(`short-name-${otherId}`)).toHaveText('Unterschrank')
  })

  test('cutting list: the label is the No. column; numbers stay when parts go, renumbering closes the gaps', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await deselectAll(page)
    // a copy gets the next free number, a removed part leaves a gap
    await page.evaluate((a) => {
      const st = window.__projectStore.getState()
      st.duplicateBoards(a, ['b-boden'])
      st.removeBoard(a, 'b-rechts')
    }, assemblyId)

    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    const dialog = page.getByRole('dialog', { name: /Zuschnittliste|Cutting list/ })
    await expect(dialog).toBeVisible()
    expect(await cutLabels(page)).toEqual(['Wandschrank 1', 'Wandschrank 3', 'Wandschrank 4', 'Wandschrank 5', 'Wandschrank 6', 'Wandschrank 7'])
    const copyRow = dialog.locator('tr', { hasText: 'Boden (Kopie)' })
    await expect(copyRow.getByTestId('cut-label')).toHaveText('Wandschrank 7')

    // sorting by name and back by number keeps each part's label
    await dialog.getByRole('columnheader', { name: /Name/ }).click()
    await expect(dialog.locator('tr', { hasText: 'Boden (Kopie)' }).getByTestId('cut-label')).toHaveText('Wandschrank 7')
    await dialog.getByRole('columnheader', { name: /^Nr\.|^No\./ }).click()
    expect((await cutLabels(page))[0]).toBe('Wandschrank 1')

    // identical parts grouped: their labels in short
    await page.evaluate((a) => window.__projectStore.getState().duplicateBoards(a, ['b-links', 'b-links']), assemblyId)
    await dialog.getByLabel(/Gleiche gruppieren|Group identical/).check()
    await expect(dialog.getByTestId('cut-label').filter({ hasText: 'Wandschrank 1, 8' })).toHaveCount(1)
    await dialog.getByLabel(/Gleiche gruppieren|Group identical/).uncheck()

    // renumbering asks first
    page.once('dialog', (d) => d.accept())
    await dialog.getByRole('button', { name: /Teilenummern neu vergeben|Renumber parts/ }).click()
    expect(await cutLabels(page)).toEqual(['Wandschrank 1', 'Wandschrank 2', 'Wandschrank 3', 'Wandschrank 4', 'Wandschrank 5', 'Wandschrank 6', 'Wandschrank 7'])
    await expect(page.getByText(/Teilenummern neu vergeben\. Rückgängig mit/)).toBeVisible()

    // declined: nothing changes, the gap of the removed "Boden" (no. 2) stays
    await page.evaluate((a) => window.__projectStore.getState().removeBoard(a, 'b-boden'), assemblyId)
    page.once('dialog', (d) => d.dismiss())
    await dialog.getByRole('button', { name: /Teilenummern neu vergeben|Renumber parts/ }).click()
    expect((await cutLabels(page)).slice(0, 3)).toEqual(['Wandschrank 1', 'Wandschrank 3', 'Wandschrank 4'])
  })
})
