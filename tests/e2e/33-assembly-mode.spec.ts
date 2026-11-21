import { test, expect, type Page } from '@playwright/test'
import { bootWithSample } from './helpers'

/**
 * Assembly mode (Montage): steps suggested from the part roles, the 3D view shows
 * one step at a time (earlier ghosted, current highlighted, later hidden), arrow
 * keys step through without nudging the selection, and the instruction prints with
 * a picture per step.
 */

/** Boards drawn in the scene, with how they are drawn */
const drawn = (page: Page) => page.evaluate(() => {
  const out: Record<string, { ghost: boolean; lit: boolean }> = {}
  window.__r3f.scene.traverse((o: any) => {
    if (o.isMesh && typeof o.name === 'string' && o.name.startsWith('b-')) {
      out[o.name] = { ghost: o.material.transparent && o.material.opacity < 1, lit: o.material.emissiveIntensity > 0 }
    }
  })
  return out
})
const stepLabel = (page: Page) => page.getByTestId('assembly-step-label')
const setRoles = (page: Page) => page.evaluate(() => {
  const st = window.__projectStore.getState()
  st.setBoardsRole('asm-1', ['b-links', 'b-rechts', 'b-boden', 'b-deckel', 'b-einlegeboden'], 'carcass')
  st.setBoardsRole('asm-1', ['b-rueckwand'], 'back')
  window.__uiStore.getState().setActiveView('3d')
})
const position = (page: Page, id: string) => page.evaluate((i) =>
  window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === i).position, id)

test.describe('Assembly mode', () => {
  test('suggested steps; the 3D view shows one step at a time; arrows step through', async ({ page }) => {
    await bootWithSample(page)
    await setRoles(page)
    await page.evaluate(() => window.__uiStore.getState().setShowPanelHub(true))
    await page.getByText(/^(Montage-Modus|Assembly mode)$/).click()
    const panel = page.getByTestId('assembly-panel')
    await panel.getByRole('button', { name: /^(Reihenfolge vorschlagen|Suggest an order)$/ }).click()
    await expect(stepLabel(page)).toHaveText(/(Schritt|Step) 1 (von|of) 2/)
    // no substructure: the carcass first, the back panel is fixed to it afterwards
    await expect(panel.getByRole('textbox', { name: /Titel des Schritts|Step title/ })).toHaveValue(/^(Korpus|Carcass)/)
    await expect(page.getByTestId('assembly-band')).toContainText(/(Schritt|Step) 1 (von|of) 2/)
    await expect(page.getByTestId('assembly-step-list').getByRole('listitem')).toHaveCount(2)

    // step 1: only the carcass, highlighted; its fixings listed
    await expect.poll(async () => Object.keys(await drawn(page)).length).toBe(5)
    expect((await drawn(page))['b-links'].lit).toBe(true)
    expect(Object.keys(await drawn(page))).not.toContain('b-rueckwand')
    await expect(panel.getByTestId('assembly-step-fasteners')).toContainText(/12 × Confirmat/)

    // → step 2: the back panel highlighted, the carcass ghosted
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('ArrowRight')
    await expect(stepLabel(page)).toHaveText(/(Schritt|Step) 2 (von|of) 2/)
    await expect.poll(async () => Object.keys(await drawn(page)).length).toBe(6)
    const s2 = await drawn(page)
    expect(s2['b-links']).toEqual({ ghost: true, lit: false })
    expect(s2['b-rueckwand']).toEqual({ ghost: false, lit: true })

    // with a board selected, arrows step instead of nudging it
    await page.evaluate(() => window.__uiStore.getState().selectBoard('asm-1', 'b-links'))
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const before = await position(page, 'b-links')
    await page.keyboard.press('ArrowLeft')
    await expect(stepLabel(page)).toHaveText(/(Schritt|Step) 1 (von|of) 2/)
    expect(await position(page, 'b-links')).toEqual(before)

    // leaving the mode shows the model as usual (only the selected board stays lit)
    await panel.getByRole('button', { name: /^(Montage-Modus beenden|Leave assembly mode)$/ }).click()
    await expect(panel).toHaveCount(0)
    await expect.poll(async () => Object.entries(await drawn(page)).filter(([id, d]) => !d.ghost && d.lit === (id === 'b-links')).length).toBe(6)
  })

  test('steps planned by hand print as an instruction with a picture per step', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => {
      // stub print on the iframe the app prints through
      const w = window as any
      w.__printed = []
      const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true,
        get() {
          const win = desc.get!.call(this)
          if (win) win.print = () => w.__printed.push({ html: win.document.documentElement.outerHTML, sandbox: (this as HTMLIFrameElement).getAttribute('sandbox') })
          return win
        }
      })
      window.__uiStore.getState().setAssemblyMode(true)
    })
    const panel = page.getByTestId('assembly-panel')
    await panel.getByRole('button', { name: /^(\+ Schritt|\+ Step)$/ }).click()
    const title = panel.getByRole('textbox', { name: /Titel des Schritts|Step title/ })
    await title.fill('Korpus <verleimen>')
    await title.press('Enter')
    await panel.getByRole('textbox', { name: /Hinweis zum Schritt|Note for this step/ }).fill('Erst ausrichten')
    await panel.getByRole('textbox', { name: /Hinweis zum Schritt|Note for this step/ }).blur()
    await panel.getByText(/6 (Teile noch nicht eingeplant|parts not planned yet)/).click()
    await panel.getByRole('button', { name: /^(Alle hierher|All here)$/ }).click()
    await expect(panel.getByTestId('assembly-unplanned')).toHaveCount(0)
    await expect(panel.getByTestId('assembly-step-parts').locator('li')).toHaveCount(6)

    // a second step takes the back panel
    await panel.getByRole('button', { name: /^(\+ Schritt|\+ Step)$/ }).click()
    await expect(stepLabel(page)).toHaveText(/(Schritt|Step) 2 (von|of) 2/)
    await panel.getByRole('button', { name: /^(Voriger Schritt|Previous step)/ }).click()
    await panel.getByRole('combobox', { name: /(In Schritt verschieben|Move to step): Rückwand/ }).selectOption({ index: 1 })
    const steps = await page.evaluate(() => window.__projectStore.getState().project.assemblySteps)
    expect(steps.map((s: any) => [s.title, s.note, s.boardIds.length])).toEqual([
      ['Korpus <verleimen>', 'Erst ausrichten', 5],
      [expect.any(String), undefined, 1]
    ])
    expect(steps[1].boardIds).toEqual(['b-rueckwand'])

    await panel.getByRole('button', { name: /^(Anleitung drucken|Print instructions)$/ }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__printed.length)).toBe(1)
    const { html, sandbox } = (await page.evaluate(() => (window as any).__printed[0])) as { html: string; sandbox: string }
    expect(sandbox).toBe('allow-modals allow-same-origin')
    expect(html.match(/<section class="cover">/g)).toHaveLength(1)
    expect(html.match(/<section class="step">/g)).toHaveLength(2)
    expect(html.match(/<img src="data:image\/png;base64,/g)).toHaveLength(3)   // the model + one per step
    expect(html).toContain('Korpus &lt;verleimen&gt;')
    expect(html).toContain('Erst ausrichten')
    expect(html).not.toContain('<verleimen>')
  })
})
