import { test, expect, Page } from '@playwright/test'
import { bootWithSample, selectBoard } from './helpers'

/**
 * Properties card: grain and edge banding are settable, sections collapse and
 * remember it, the card fits a small window; joints open in an edit dialog with
 * fasteners, and new joints can get fasteners too.
 */

const undoSteps = (page: Page) => page.evaluate(() => (window.__projectStore.temporal.getState() as any).pastStates.length as number)
const boardById = (page: Page, id: string) => page.evaluate((i) =>
  window.__projectStore.getState().project.assemblies.flatMap((a: any) => a.boards).find((b: any) => b.id === i), id)
const jointById = (page: Page, id: string) => page.evaluate((i) =>
  window.__projectStore.getState().project.assemblies.flatMap((a: any) => a.joints).find((j: any) => j.id === i), id)

test.describe('Properties card: grain, edge banding, sections', () => {
  test('grain offers the two face axes with their lengths; edges toggle with their lengths', async ({ page }) => {
    await bootWithSample(page)
    await selectBoard(page, 'asm-1', 'b-boden')   // 564 × 18 × 300: face 564 × 300

    const grain = page.getByRole('group', { name: /Faserrichtung|Grain direction/ })
    await expect(grain.getByRole('button')).toHaveText([/Keine|None/, /564/, /300/])
    await expect(grain.getByRole('button', { name: /564/ })).toHaveAttribute('aria-pressed', 'true')
    await grain.getByRole('button', { name: /300/ }).click()
    expect((await boardById(page, 'b-boden')).grainDirection).toBe('depth')
    await grain.getByRole('button', { name: /Keine|None/ }).click()
    expect((await boardById(page, 'b-boden')).grainDirection).toBeUndefined()

    // E1 (along 564) is on in the sample; switch E3 (along 300) on
    await expect(page.getByRole('button', { name: 'E1 · 564' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'E3 · 300' }).click()
    expect((await boardById(page, 'b-boden')).edgeBanding).toEqual({ e1: true, e3: true })
    await expect(page.getByText(/864 mm/)).toBeVisible()
  })

  test('a collapsed section stays collapsed for the next board and shows a summary', async ({ page }) => {
    await bootWithSample(page)
    await selectBoard(page, 'asm-1', 'b-boden')
    const geometry = page.getByRole('button', { name: /Geometrie|Geometry/ })
    await expect(geometry).toHaveAttribute('aria-expanded', 'true')
    await geometry.click()
    await expect(geometry).toHaveAttribute('aria-expanded', 'false')
    await expect(geometry).toContainText('564 × 18 × 300')
    await selectBoard(page, 'asm-1', 'b-links')
    await expect(page.getByRole('button', { name: /Geometrie|Geometry/ })).toHaveAttribute('aria-expanded', 'false')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('abrichten-card-sections') ?? '{}').geometry)).toBe(false)
  })

  test('the card stays inside the canvas in a 1024 × 700 window and scrolls inside', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await bootWithSample(page)
    await selectBoard(page, 'asm-1', 'b-links')
    // open every section so the content is as tall as it gets
    for (const name of [/Position/, /Ausschnitte|Cutouts/]) {
      const b = page.getByRole('button', { name, expanded: false })
      if (await b.count()) await b.first().click()
    }
    const card = page.locator('div.absolute.bottom-4.right-4').filter({ has: page.getByTitle(/^(Name bearbeiten|Edit name)$/) })
    const box = (await card.boundingBox())!
    const canvas = (await page.locator('canvas').first().boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(canvas.y)
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height)
    // the delete button in the footer is reachable without scrolling the page
    await expect(card.getByRole('button', { name: /Löschen|Delete/ })).toBeInViewport()
  })
})

test.describe('Joint editing and fasteners', () => {
  test('clicking a joint in the card opens it for editing; save is one undo step', async ({ page }) => {
    await bootWithSample(page)
    await selectBoard(page, 'asm-1', 'b-links')
    await page.getByRole('button', { name: /· Boden/ }).click()
    const dialog = page.getByRole('dialog', { name: /Verbindung bearbeiten|Edit Joint/ })
    await expect(dialog).toBeVisible()
    // the sample joint comes with 3 confirmat screws
    await expect(dialog.getByRole('spinbutton', { name: /Anzahl 1|Quantity 1/ })).toHaveValue('3')

    const steps = await undoSteps(page)
    await dialog.getByRole('combobox', { name: /Verbindungstyp|Joint type/ }).selectOption('dowel')
    await dialog.getByRole('button', { name: /^\+ (Befestiger|Fastener)$/ }).click()
    await dialog.getByRole('combobox', { name: /Art 2|Type 2/ }).selectOption('dowel_pin')
    await dialog.getByRole('spinbutton', { name: /Anzahl 2|Quantity 2/ }).fill('6')
    await dialog.getByRole('textbox').fill('verleimt')
    await dialog.getByRole('button', { name: /^(Speichern|Save)$/ }).click()
    await expect(dialog).toBeHidden()

    const j = await jointById(page, 'j1')
    expect(j.type).toBe('dowel')
    expect(j.note).toBe('verleimt')
    expect(j.fasteners.map((f: any) => [f.type, f.diameter, f.length, f.quantity])).toEqual([
      ['confirmat', 7, 50, 3], ['dowel_pin', 8, 35, 6]
    ])
    expect(await undoSteps(page)).toBe(steps + 1)
    // the card lists the new fastener
    await expect(page.getByText(/6× (Holzdübel|Dowel) 8×35/)).toBeVisible()
  })

  test('cancel and Esc leave the joint untouched; the next J opens a new joint', async ({ page }) => {
    await bootWithSample(page)
    await selectBoard(page, 'asm-1', 'b-links')
    const row = page.getByRole('button', { name: /· Boden/ })
    await row.click()
    const dialog = page.getByRole('dialog', { name: /Verbindung bearbeiten|Edit Joint/ })
    await dialog.getByRole('combobox', { name: /Verbindungstyp|Joint type/ }).selectOption('glued')
    await dialog.getByRole('button', { name: /^(Abbrechen|Cancel)$/ }).click()
    await expect(dialog).toBeHidden()
    expect((await jointById(page, 'j1')).type).toBe('screw')

    await row.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => window.__uiStore.getState().selectedBoardIds)).toEqual(['b-links'])

    await page.evaluate(() => window.__uiStore.setState({ selectedAssemblyId: 'asm-1', selectedBoardIds: ['b-einlegeboden', 'b-links'] }))
    await page.keyboard.press('j')
    await expect(page.getByRole('dialog', { name: /Verbindung hinzufügen|Add Joint/ })).toBeVisible()
  })

  test('a new joint is created with its fasteners', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.setState({ selectedAssemblyId: 'asm-1', selectedBoardIds: ['b-einlegeboden', 'b-links'] }))
    await page.keyboard.press('j')
    const dialog = page.getByRole('dialog', { name: /Verbindung hinzufügen|Add Joint/ })
    await dialog.getByRole('button', { name: /^\+ (Befestiger|Fastener)$/ }).click()
    await dialog.getByRole('combobox', { name: /Art 1|Type 1/ }).selectOption('wood_screw')
    await dialog.getByRole('spinbutton', { name: /Länge 1|Length 1/ }).fill('50')
    await dialog.getByRole('button', { name: /Verbindung erstellen|Create Joint/ }).click()
    const joints = await page.evaluate(() => window.__projectStore.getState().project.assemblies[0].joints)
    const added = joints.find((j: any) => j.boardA === 'b-einlegeboden')
    expect(added.fasteners.map((f: any) => [f.type, f.diameter, f.length, f.quantity])).toEqual([['wood_screw', 4, 50, 4]])
  })
})
