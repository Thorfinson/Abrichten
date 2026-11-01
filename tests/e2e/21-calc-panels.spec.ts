import { test, expect, type Page } from '@playwright/test'
import { bootWithSample } from './helpers'
import { detectCollisions3D } from '../../src/renderer/src/utils/collision'

/**
 * Calculation panels:
 *  - the carcass generator builds collision-free carcasses (a grooved back is joined
 *    to the parts it sits in by dado joints) in a single undo step
 *  - print goes through a sandboxed iframe (window.open is denied in the desktop
 *    app) and user strings arrive escaped
 *  - a cleared spacing field in the boring list does not hang the page
 */

const XSS = '<img src=x onerror=alert(1)>'

async function generateKorpus(page: Page, backType: 'groove' | 'face' | 'none') {
  await page.evaluate(() => window.__uiStore.getState().setShowKorpusPanel(true))
  const dialog = page.getByRole('dialog', { name: /Korpus|Cabinet/ })
  await expect(dialog).toBeVisible()
  await dialog.locator('select').filter({ has: page.locator('option[value="face"]') }).selectOption(backType)
  const before = await page.evaluate(() => (window.__projectStore.temporal.getState() as any).pastStates.length)
  await dialog.getByRole('button', { name: /Korpus erstellen|Generate Cabinet/ }).click()
  await expect(dialog).toBeHidden()
  return page.evaluate((pastBefore) => {
    const p = window.__projectStore.getState().project
    const a = p.assemblies[p.assemblies.length - 1]
    const past = (window.__projectStore.temporal.getState() as any).pastStates.length
    return { boards: a.boards, joints: a.joints, steps: past - pastBefore, assemblies: p.assemblies.length }
  }, before)
}

test.describe('Calculation panels', () => {
  for (const backType of ['groove', 'face'] as const) {
    test(`carcass with ${backType} back: no collisions, one undo step`, async ({ page }) => {
      await bootWithSample(page)
      const result = await generateKorpus(page, backType)
      // sides, bottom, top, back, one shelf
      expect(result.boards.length).toBe(6)
      expect(detectCollisions3D(result.boards, result.joints)).toEqual([])
      expect(result.steps).toBe(1)
      expect(result.boards.every((b: any) => ['spanplatte', 'mdf'].includes(b.materialId))).toBe(true)

      if (backType === 'groove') {
        const back = result.boards.find((b: any) => b.depth === 6)
        // 600 × 720 outer, 18 mm panels: back reaches 8 mm into each groove
        expect({ w: back.width, h: back.height }).toEqual({ w: 600 - 36 + 16, h: 720 - 36 + 16 })
        expect(result.joints.filter((j: any) => j.type === 'dado').length).toBe(4)
        // without the joints the groove overlap is a collision
        expect(detectCollisions3D(result.boards).length).toBe(4)
      }

      // one undo removes the whole carcass
      const after = await page.evaluate(() => {
        window.__projectStore.temporal.getState().undo()
        return window.__projectStore.getState().project.assemblies.length
      })
      expect(after).toBe(result.assemblies - 1)
    })
  }

  test('print buttons print through a sandboxed iframe with escaped names', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await page.evaluate(({ aid, bid, xss }) => {
      // stub print on every iframe window the app creates
      const w = window as any
      w.__printed = []
      const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true,
        get() {
          const win = desc.get!.call(this)
          if (win) {
            const frame = this as HTMLIFrameElement
            win.print = () => w.__printed.push({ html: win.document.documentElement.outerHTML, sandbox: frame.getAttribute('sandbox') })
          }
          return win
        }
      })
      const store = w.__projectStore.getState()
      store.setProjectName(xss)
      store.updateBoard(aid, bid, { name: xss, materialId: xss, hardware: [{ hardwareId: 'hw-xss', quantity: 1 }] })
      const p = w.__projectStore.getState().project
      w.__projectStore.setState({ project: { ...p, customHardware: [{ id: 'hw-xss', name: xss, nameEn: xss, category: 'handles', unitPrice: 5 }] } })
    }, { aid: assemblyId, bid: firstBoardId, xss: XSS })

    const printed = () => page.evaluate(() => (window as any).__printed as { html: string; sandbox: string }[])

    // cutting list
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    await page.getByRole('button', { name: /PDF drucken|Print PDF/ }).click()
    await expect.poll(async () => (await printed()).length).toBe(1)
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(false))

    // cost
    await page.evaluate(() => window.__uiStore.getState().setShowCostPanel(true))
    await page.getByRole('button', { name: /PDF drucken|Print PDF/ }).click()
    await expect.poll(async () => (await printed()).length).toBe(2)
    await page.evaluate(() => window.__uiStore.getState().setShowCostPanel(false))

    // shop drawings (the dialog stays open after printing; its preview iframe goes with it)
    await page.evaluate(() => window.__uiStore.getState().setShowShopDrawingsPanel(true))
    await page.getByRole('button', { name: /PDF drucken|Print PDF/ }).click()
    await expect.poll(async () => (await printed()).length).toBe(3)
    await page.evaluate(() => window.__uiStore.getState().setShowShopDrawingsPanel(false))

    for (const { html, sandbox } of await printed()) {
      expect(sandbox).toBe('allow-modals allow-same-origin')
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(html).not.toContain('<img')
      expect(html).not.toContain('<script')
    }
    // the iframes are gone after printing
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('iframe[srcdoc]').length)).toBe(0)
  })

  test('a cleared spacing field does not hang the boring list', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().setShowBoringPanel(true))
    const dialog = page.getByRole('dialog', { name: /32mm/ })
    await expect(dialog).toBeVisible()
    const spacing = dialog.locator('input[type="number"]').first()
    await spacing.fill('')
    await spacing.fill('0')
    // the page still answers and the table is bounded
    const rows = await dialog.locator('tbody tr').count()
    expect(rows).toBeGreaterThan(0)
    expect(rows).toBeLessThan(10_000)
    // right row of the 300 mm deep sample side panel: 300 − 37, not 18 − 37
    await spacing.fill('32')
    await expect(dialog.locator('tbody tr').filter({ hasText: 'Seitenwand Links' }).filter({ hasText: '263' }).first()).toBeVisible()
  })
})
