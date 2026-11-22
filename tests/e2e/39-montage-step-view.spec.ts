import { test, expect, type Page } from '@playwright/test'
import { bootWithSample } from './helpers'

/*
 * The step view of the assembly workspace is one consistent state: parts of later steps
 * are hidden — and cannot be picked with ⌘A / Ctrl+A, so Del never removes a part you
 * cannot see; stepping back drops them from the selection. The static legend stays with
 * the static colours; the parts in no step are listed once.
 */

/** Sample cabinet in two steps: carcass, then the back panel */
const twoSteps = (page: Page) => page.evaluate(() => {
  window.__projectStore.getState().setAssemblySteps([
    { id: 's1', title: 'Korpus', boardIds: ['b-links', 'b-rechts', 'b-boden', 'b-deckel', 'b-einlegeboden'] },
    { id: 's2', title: 'Rückwand', boardIds: ['b-rueckwand'] }
  ])
  window.__uiStore.getState().setWorkspace('assembly')
  window.__uiStore.getState().setAssemblyStep(0)
})
const selected = (page: Page) => page.evaluate(() => [...window.__uiStore.getState().selectedBoardIds].sort())

test.describe('Assembly workspace: what is hidden stays out of reach', () => {
  test('select all picks only visible parts; stepping back drops the hidden ones', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await twoSteps(page)
    await page.evaluate((a) => window.__uiStore.getState().selectBoard(a, 'b-links'), assemblyId)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Control+a')
    await expect.poll(() => selected(page)).toEqual(['b-boden', 'b-deckel', 'b-einlegeboden', 'b-links', 'b-rechts'])

    // Del removes what you see, never the hidden back panel
    await page.keyboard.press('Delete')
    const left = await page.evaluate(() => window.__projectStore.getState().project.assemblies[0].boards.map((b: any) => b.id))
    expect(left).toEqual(['b-rueckwand'])
    await page.evaluate(() => window.__projectStore.temporal.getState().undo())

    // step 2 shows the back panel; select it, go back to step 1: it leaves the selection
    await page.evaluate((a) => {
      window.__uiStore.getState().setAssemblyStep(1)
      window.__uiStore.getState().selectAllBoards(a)
    }, assemblyId)
    expect(await selected(page)).toContain('b-rueckwand')
    await page.evaluate(() => window.__uiStore.getState().setAssemblyStep(0))
    expect(await selected(page)).not.toContain('b-rueckwand')
  })

  test('the static legend stays in the assembly workspace; parts in no step are listed once', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => {
      window.__projectStore.getState().setAssemblySteps([{ id: 's1', title: 'Korpus', boardIds: ['b-links', 'b-rechts'] }])
      window.__uiStore.getState().setWorkspace('assembly')
      if (!window.__uiStore.getState().showStaticOverlay) window.__uiStore.getState().toggleStaticOverlay()
    })
    await expect(page.getByTestId('static-legend')).toBeVisible()
    // "4 Teile noch nicht eingeplant": in the step panel only, not again under the step list
    await expect(page.getByText(/4 (Teile noch nicht eingeplant|parts not planned yet)/)).toHaveCount(1)
    await expect(page.getByTestId('assembly-step-list')).not.toContainText(/eingeplant|planned/)
  })
})
