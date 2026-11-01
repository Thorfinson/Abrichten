import { test, expect } from '@playwright/test'
import { bootWithSample, selectBoard, getBoard, undoState } from './helpers'

/**
 * Text edits commit once, the UI language survives a restart, a reply
 * streamed into a closed AI panel isn't lost, and a big selection doesn't
 * flood the view with dimension lines.
 */

test.describe('Edits and preferences', () => {
  test('board name: typing is one undo step on blur, Esc reverts', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, 'b-links')
    const input = page.getByTitle(/^(Name bearbeiten|Edit name)$/)
    const start = await undoState(page)

    await input.click()
    await input.fill('')
    await input.pressSequentially('Seite L')
    expect((await getBoard(page, 'b-links')).name).toBe('Seitenwand Links') // nothing committed yet
    await input.press('Enter')
    expect((await getBoard(page, 'b-links')).name).toBe('Seite L')
    expect((await undoState(page)).past).toBe(start.past + 1)

    await input.click()
    await input.pressSequentially('XYZ')
    await input.press('Escape')
    await expect(input).toHaveValue('Seite L')
    expect((await getBoard(page, 'b-links')).name).toBe('Seite L')
    expect((await undoState(page)).past).toBe(start.past + 1)
    // Esc in the field must not deselect
    expect(await page.evaluate(() => window.__uiStore.getState().selectedBoardIds)).toEqual(['b-links'])
  })

  test('the UI language is remembered across a restart', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().setSettingsOpen(true))
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')

    await page.reload()
    await page.waitForLoadState('networkidle')
    // the welcome screen comes back (the test's init script clears its flag) — now in English
    await expect(page.getByRole('button', { name: /Load Sample Project/ })).toBeVisible()
  })

  test('closing the AI panel mid-reply keeps the partial reply and says it was stopped', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('abrichten-settings', JSON.stringify({ apiKey: 'test-key', modelId: 'test/model' }))
      localStorage.removeItem('abrichten-chat-history')
      const realFetch = window.fetch.bind(window)
      // A reply that sends one chunk and then never finishes
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).includes('/chat/completions')) return realFetch(input, init)
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Teilantwort"}}]}\n\n'))
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
          }
        })
        return Promise.resolve(new Response(body, { status: 200 }))
      }
    })
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().setShowChatPanel(true))
    const panel = page.getByRole('dialog', { name: /KI-Assistent|AI Assistant/ })
    await panel.getByRole('textbox').fill('Baue einen Schrank')
    await panel.getByRole('textbox').press('Enter')
    await expect(panel.getByText('Teilantwort')).toBeVisible()

    await panel.getByRole('button', { name: /^(Schließen|Close)$/ }).click()
    await expect(panel).toBeHidden()
    await page.evaluate(() => window.__uiStore.getState().setShowChatPanel(true))
    await expect(panel.getByText('Teilantwort')).toBeVisible()
    await expect(panel.getByText(/Antwort abgebrochen|Reply stopped/)).toBeVisible()
  })

  test('selecting many boards shows one overall dimension, not one per board', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const lines = () => page.evaluate(() => {
      let n = 0
      window.__r3f.scene.traverse((o: any) => { if (o.type === 'Line2') n++ })
      return n
    })
    const base = await lines()
    await selectBoard(page, assemblyId, 'b-links')
    const one = (await lines()) - base
    expect(one).toBe(6) // 2 dimensions × (2 extension lines + 1 dimension line)

    await page.evaluate((a) => window.__uiStore.getState().selectAllBoards(a), assemblyId)
    await page.waitForTimeout(150)
    expect((await lines()) - base).toBe(6)
  })
})
