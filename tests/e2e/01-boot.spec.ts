import { test, expect } from '@playwright/test'
import { bootWithSample } from './helpers'

test.describe('App boot', () => {
  test('renders welcome dialog and exposes dev stores on window', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.removeItem('abrichten-welcomed') } catch {}
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Welcome dialog should be visible
    await expect(page.getByText(/Willkommen bei Abrichten|Welcome to Abrichten/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Beispielprojekt laden|Load Sample Project/i })).toBeVisible()

    // Dev hooks must be available before the user interacts
    const hooksReady = await page.evaluate(() => {
      return !!window.__uiStore && !!window.__projectStore
    })
    expect(hooksReady).toBe(true)
  })

  test('loads the sample project and mounts the R3F scene', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    expect(assemblyId).toBeTruthy()
    expect(firstBoardId).toBeTruthy()

    const counts = await page.evaluate(() => {
      const proj = window.__projectStore.getState().project
      return {
        assemblies: proj.assemblies.length,
        boards: proj.assemblies[0].boards.length,
        hasR3F: !!window.__r3f
      }
    })
    expect(counts.assemblies).toBeGreaterThanOrEqual(1)
    expect(counts.boards).toBeGreaterThanOrEqual(6)
    expect(counts.hasR3F).toBe(true)
  })
})
