import { test, expect, type Page } from '@playwright/test'
import { bootWithSample } from './helpers'

/*
 * The assembly workspace reads the design (store/designLock.ts): the store refuses every
 * other change (tests/unit/montage-read-only.test.mjs). These check that the screen says
 * so too — no card or handles to edit with, menus that offer only the assembly's own
 * actions, design commands greyed with where they work, and nothing from the design left
 * floating over the assembly workspace.
 */

const toAssembly = (page: Page) => page.evaluate(() => {
  window.__projectStore.getState().setAssemblySteps([
    { id: 's1', title: 'Korpus', boardIds: ['b-links', 'b-rechts', 'b-boden', 'b-deckel', 'b-einlegeboden'] },
    { id: 's2', title: 'Rückwand', boardIds: ['b-rueckwand'] }
  ])
  window.__uiStore.getState().setWorkspace('assembly')
  window.__uiStore.getState().setAssemblyStep(0)
})

test.describe('Assembly workspace: the design is read only on screen too', () => {
  test('a selected part has no edit card and its pill no buttons; in the design it has both', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await page.evaluate((a) => window.__uiStore.getState().selectBoard(a, 'b-links'), assemblyId)
    await expect(page.getByTestId('card-part-label')).toBeVisible()
    await toAssembly(page)
    await page.evaluate((a) => window.__uiStore.getState().selectBoard(a, 'b-links'), assemblyId)
    await expect(page.getByTestId('selection-pill-name')).toBeVisible()
    await expect(page.getByTestId('card-part-label')).toHaveCount(0)
    expect(await page.getByTestId('selection-pill-name').locator('..').locator('button').count()).toBe(0)
  })

  test('the right-click menu offers the step, not the design, and says where that is', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await toAssembly(page)
    await page.evaluate((a) => {
      window.__uiStore.getState().selectBoard(a, 'b-links')
      window.__uiStore.getState().setContextMenu({ x: 400, y: 300, assemblyId: a, boardId: 'b-links' })
    }, assemblyId)
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /In Schritt verschieben|Move to step/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Löschen|Delete|Duplizieren|Duplicate/ })).toHaveCount(0)
    await expect(page.getByTestId('context-design-hint')).toBeVisible()
    // moving the part to step 2 is the assembly's own change
    await menu.getByRole('menuitem', { name: /In Schritt verschieben|Move to step/ }).click()
    await page.getByRole('menuitem', { name: /Schritt 2|Step 2/ }).click()
    const steps = await page.evaluate(() => window.__projectStore.getState().project.assemblySteps.map((s: any) => s.boardIds))
    expect(steps[1]).toContain('b-links')
  })

  test('⌘K keeps design commands findable but greyed; choosing one changes nothing', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await toAssembly(page)
    await page.evaluate((a) => window.__uiStore.getState().selectBoard(a, 'b-links'), assemblyId)
    await page.evaluate(() => window.__uiStore.getState().setShowCommandPalette(true))
    const search = page.locator('input[role="combobox"]')
    await search.fill('dupl')
    const option = page.locator('#command-palette-list [role="option"]').first()
    await expect(option).toHaveAttribute('aria-disabled', 'true')
    await expect(option.getByTestId('command-in-design')).toBeVisible()
    await search.press('Enter')
    expect(await page.evaluate(() => window.__projectStore.getState().project.assemblies[0].boards.length)).toBe(6)
  })

  test('the parts column\'s assembly menu does not stay open over the assembly workspace', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const name = await page.evaluate((a) => {
      window.__uiStore.getState().setShowAssemblyDrawer(true)
      return window.__projectStore.getState().project.assemblies.find((x: any) => x.id === a).name
    }, assemblyId)
    await page.getByText(name, { exact: true }).first().click({ button: 'right' })
    const rename = page.getByRole('button', { name: /^(Umbenennen|Rename)$/ })
    await expect(rename).toBeVisible()
    await page.keyboard.press('ControlOrMeta+2')
    await expect.poll(() => page.evaluate(() => window.__uiStore.getState().workspace)).toBe('assembly')
    await expect(rename).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+1')
    await expect(rename).toHaveCount(0)
  })

  test('⌘Z in the assembly workspace: a renamed step comes back, a moved part waits for the design', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const x = () => page.evaluate(() => window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === 'b-links').position.x)
    const title = () => page.evaluate(() => window.__projectStore.getState().project.assemblySteps[0].title)
    // Montage: an empty step first (as a person might), then the suggested order
    await page.keyboard.press('ControlOrMeta+2')
    await page.getByRole('button', { name: '+ Schritt' }).first().click()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /^Reihenfolge vorschlagen$/ }).click()
    // the empty step is replaced: the first step holds parts again
    await expect.poll(() => page.evaluate(() => window.__projectStore.getState().project.assemblySteps[0].boardIds.length)).toBeGreaterThan(0)
    // Entwurf: move a part one step to the right
    await page.keyboard.press('ControlOrMeta+1')
    await page.evaluate((a) => window.__uiStore.getState().selectBoard(a, 'b-links'), assemblyId)
    const before = await x()
    await page.keyboard.press('ArrowRight')
    await expect.poll(x).not.toBe(before)
    const moved = await x()
    // Montage: rename the first step by typing
    await page.keyboard.press('ControlOrMeta+2')
    const field = page.getByRole('textbox', { name: 'Titel des Schritts' })
    const old = await field.inputValue()
    await field.fill('Test')
    await field.press('Enter')
    await expect.poll(title).toBe('Test')
    // ⌘Z: the title comes back
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(title).toBe(old)
    // ⌘Z again: the move belongs to the design — the part stays, the hint is on screen
    await page.keyboard.press('ControlOrMeta+z')
    const hint = page.getByTestId('app-toast')
    await expect(hint).toContainText('Die letzte Änderung gehört zum Entwurf')
    expect(await x()).toBe(moved)
    // the hint covers no control: it sits below the view tabs
    const tabs = await page.getByRole('tablist').first().boundingBox()
    const box = await hint.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(tabs!.y + tabs!.height)
    // back in the design, ⌘Z takes the move back
    await page.keyboard.press('ControlOrMeta+1')
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(x).toBe(before)
  })
})
