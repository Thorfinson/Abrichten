import { test, expect } from '@playwright/test'
import { bootWithSample, setView, getUI } from './helpers'

test.describe('View tabs and cameras', () => {
  test('switching views updates store and active camera type', async ({ page }) => {
    await bootWithSample(page)
    await page.waitForTimeout(200)

    for (const v of ['front', 'side', 'top', '3d'] as const) {
      await setView(page, v)
      const ui = await getUI(page)
      expect(ui.activeView).toBe(v)

      // Camera should be orthographic for the three ortho views, perspective for 3d
      const camType = await page.evaluate(() => {
        const c = window.__r3f.camera as any
        return c.isOrthographicCamera ? 'ortho' : (c.isPerspectiveCamera ? 'perspective' : 'unknown')
      })
      const expected = v === '3d' ? 'perspective' : 'ortho'
      expect(camType, `view=${v} should use ${expected} camera`).toBe(expected)
    }
  })

  test('Alt+1..4 shortcut switches views', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

    const shortcuts: Array<[string, string]> = [
      ['Alt+1', 'front'],
      ['Alt+2', 'side'],
      ['Alt+3', 'top'],
      ['Alt+4', '3d']
    ]
    for (const [combo, expected] of shortcuts) {
      await page.keyboard.press(combo)
      await page.waitForTimeout(120)
      const ui = await getUI(page)
      expect(ui.activeView).toBe(expected)
    }
  })
})
