import { test, expect, type Page } from '@playwright/test'
import { bootWithSample } from './helpers'

/**
 * Workspaces (store/useUIStore.ts `workspace`, layout/WorkspaceSwitcher.tsx): one
 * model, two ways to work on it. Design keeps the parts column (tree or groups),
 * assembly shows its band, the step list, the docked step panel and the timeline.
 * ⌘/Ctrl 1 and 2 switch too.
 */

const ws = (page: Page, w: 'design' | 'assembly') => page.getByTestId(`workspace-${w}`)

test.describe('Workspaces', () => {
  test('design → assembly → design', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().setShowAssemblyDrawer(true))
    await expect(ws(page, 'design')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('workspace-production')).toHaveCount(0)
    await expect(page.getByTestId('drawer-group-by')).toBeVisible()

    // assembly by keyboard: band, step list, docked step panel; the parts column makes room
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Control+2')
    await expect(ws(page, 'assembly')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('assembly-band')).toBeVisible()
    await expect(page.getByTestId('assembly-step-list')).toBeVisible()
    await expect(page.getByTestId('assembly-panel')).toBeVisible()
    await expect(page.getByTestId('drawer-group-by')).toHaveCount(0)
    expect(await page.evaluate(() => window.__uiStore.getState().workspace)).toBe('assembly')

    // a third workspace key does nothing
    await page.keyboard.press('Control+3')
    await expect(ws(page, 'assembly')).toHaveAttribute('aria-pressed', 'true')

    // the band leaves to design, the parts column is back
    await page.getByTestId('assembly-band').getByRole('button').click()
    await expect(ws(page, 'design')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('assembly-band')).toHaveCount(0)
    await expect(page.getByTestId('drawer-group-by')).toBeVisible()
    expect(await page.evaluate(() => window.__uiStore.getState().workspace)).toBe('design')

    // ⌘1 / Ctrl+1 from assembly back to design
    await page.keyboard.press('Control+2')
    await expect(ws(page, 'assembly')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Control+1')
    await expect(ws(page, 'design')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the parts column groups by assembly, part role or material', async ({ page }) => {
    await bootWithSample(page)
    await page.evaluate(() => window.__uiStore.getState().setShowAssemblyDrawer(true))
    const groupBy = page.getByTestId('drawer-group-by')
    await expect(groupBy).toHaveValue('assembly')

    // by part role: the sample has none yet, so one group "no part role"; a role gets its group
    await groupBy.selectOption('role')
    await expect(page.getByTestId('part-group-none')).toBeVisible()
    await page.evaluate(() => window.__projectStore.getState().setBoardsRole('asm-1', ['b-links'], 'carcass'))
    await expect(page.getByTestId('part-group-carcass')).toBeVisible()

    // by material: a group lists its parts; clicking one selects it
    await groupBy.selectOption('material')
    await expect(page.locator('[data-testid^="part-group-"]').first()).toBeVisible()
    await page.locator('[data-testid^="part-group-"]').first().locator('div[title]').first().click()
    expect(await page.evaluate(() => window.__uiStore.getState().selectedBoardIds.length)).toBe(1)

    // the choice survives a trip to the assembly workspace
    await ws(page, 'assembly').click()
    await ws(page, 'design').click()
    await expect(groupBy).toHaveValue('material')
  })
})
