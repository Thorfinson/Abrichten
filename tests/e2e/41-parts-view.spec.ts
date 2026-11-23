import { test, expect, type Page } from '@playwright/test'
import { bootWithSample } from './helpers'

/*
 * The parts column (B): every level of every grouping — assembly, subgroup, part role,
 * material, single part — has the same eye. The eye hides in the view only; the lists
 * still count the parts. Real assemblies also have the tick (a design variant): unticked,
 * they count nowhere. Some subgroups unticked: the tick shows "some".
 */

const board = (id: string, role: string, materialId = 'mdf') =>
  ({ id, name: `Teil ${id}`, width: 600, height: 720, depth: 18, materialId, role, position: { x: 0, y: 0, z: 0 } })

async function nested(page: Page): Promise<void> {
  await bootWithSample(page)
  await page.evaluate((parts) => {
    window.__projectStore.getState().loadProject({
      name: 'Test',
      assemblies: [
        { id: 'K', name: 'Küche', visible: true, boards: [], joints: [] },
        { id: 'H', name: 'Herdfach', parentId: 'K', visible: true, boards: [parts[0], parts[1]], joints: [] },
        { id: 'S', name: 'Schubkasten', parentId: 'H', visible: true, boards: [parts[2]], joints: [] },
        { id: 'U', name: 'Unterbau', parentId: 'K', visible: true, boards: [parts[3]], joints: [] }
      ]
    })
    window.__uiStore.getState().setShowAssemblyDrawer(true)
  }, [board('h1', 'carcass'), board('h2', 'back', 'hdf'), board('s1', 'drawer'), board('u1', 'substructure', 'spruce')])
}
const drawer = (page: Page) => page.locator('aside').first()
const inScene = (page: Page, id: string) => page.evaluate((i) => {
  let found = false
  window.__r3f.scene.traverse((o: any) => { if (o.isMesh && o.name === i && o.visible) found = true })
  return found
}, id)
async function expandAll(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const closed = drawer(page).getByRole('button', { name: /^(Aufklappen|Expand)$/ })
    if (await closed.count() === 0) return
    await closed.first().click()
  }
}
const cutRows = (page: Page) => page.evaluate(() => document.querySelectorAll('[data-testid="cut-label"]').length)

test.describe('Parts column: the eye on every level, the tick on assemblies', () => {
  test('every level of every grouping has the eye; assemblies also the tick', async ({ page }) => {
    await nested(page)
    await expandAll(page)
    const col = drawer(page)
    await expect(col.locator('[data-assembly-id]')).toHaveCount(4)
    await expect(col.getByTestId('counts-check')).toHaveCount(4)
    // 4 assemblies + 4 parts, each with the eye and the X-ray
    await expect(col.getByTestId('view-eye')).toHaveCount(8)
    await expect(col.getByTestId('view-xray')).toHaveCount(8)
    for (const by of ['role', 'material']) {
      await page.evaluate((g) => window.__uiStore.getState().setDrawerGroupBy(g), by)
      const groups = await col.locator('[data-testid^="part-group-"]').count()
      expect(groups).toBeGreaterThan(1)
      await expect(col.getByTestId('view-eye')).toHaveCount(groups + 4)
      await expect(col.getByTestId('view-xray')).toHaveCount(groups + 4)
      await expect(col.getByTestId('counts-check')).toHaveCount(0)
    }
  })

  test('a group eye hides its parts in the view only; the cutting list still counts them', async ({ page }) => {
    await nested(page)
    await page.evaluate(() => window.__uiStore.getState().setDrawerGroupBy('role'))
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    const before = await cutRows(page)
    await page.keyboard.press('Escape')
    const eye = drawer(page).getByTestId('part-group-back').getByTestId('view-eye').first()
    await eye.click()
    await expect(eye).toHaveAttribute('data-state', 'hidden')
    expect(await inScene(page, 'h2')).toBe(false)
    expect(await inScene(page, 'h1')).toBe(true)
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    expect(await cutRows(page)).toBe(before)
    await page.keyboard.press('Escape')
    // the assembly tree says it too: Herdfach is partly hidden
    await page.evaluate(() => window.__uiStore.getState().setDrawerGroupBy('assembly'))
    await expandAll(page)
    await expect(drawer(page).locator('[data-assembly-id="H"]').getByTestId('view-eye')).toHaveAttribute('data-state', 'mixed')
    await drawer(page).locator('[data-assembly-id="H"]').getByTestId('view-eye').click()
    expect(await inScene(page, 'h2')).toBe(true)
  })

  test('the tick takes an assembly and its subgroups out of every list; some unticked shows "some"', async ({ page }) => {
    await nested(page)
    await expandAll(page)
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    const before = await cutRows(page)
    await page.keyboard.press('Escape')
    await drawer(page).locator('[data-assembly-id="S"]').getByTestId('counts-check').click()
    await expect(drawer(page).locator('[data-assembly-id="H"]').getByTestId('counts-check')).toHaveAttribute('data-state', 'some')
    expect(await inScene(page, 's1')).toBe(false)
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    expect(await cutRows(page)).toBe(before - 1)
    await page.keyboard.press('Escape')
    await drawer(page).locator('[data-assembly-id="H"]').getByTestId('counts-check').click()
    await expect(drawer(page).locator('[data-assembly-id="S"]').getByTestId('counts-check')).toHaveAttribute('data-state', 'on')
  })

  test('the X-ray picks out a group on any level: its parts glow, everything else steps back', async ({ page }) => {
    await nested(page)
    await expandAll(page)
    const look = (id: string) => page.evaluate((i) => {
      let out: { lit: boolean; ghost: boolean } | null = null
      window.__r3f.scene.traverse((o: any) => { if (o.isMesh && o.name === i) out = { lit: o.material.emissiveIntensity > 0, ghost: o.material.transparent && o.material.opacity < 1 } })
      return out
    }, id)
    // a subgroup in the tree
    await drawer(page).locator('[data-assembly-id="S"]').getByTestId('view-xray').click()
    expect(await look('s1')).toEqual({ lit: true, ghost: false })
    expect(await look('h1')).toEqual({ lit: false, ghost: true })
    await expect(drawer(page).locator('[data-assembly-id="H"]').getByTestId('view-xray')).toHaveAttribute('data-state', 'mixed')
    await drawer(page).locator('[data-assembly-id="S"]').getByTestId('view-xray').click()
    expect(await look('h1')).toEqual({ lit: false, ghost: false })
    // a part-role group
    await page.evaluate(() => window.__uiStore.getState().setDrawerGroupBy('role'))
    await drawer(page).getByTestId('part-group-back').getByTestId('view-xray').first().click()
    expect(await look('h2')).toEqual({ lit: true, ghost: false })
    expect(await look('u1')).toEqual({ lit: false, ghost: true })
    // picked out but hidden by the eye: nothing is ghosted for it
    await drawer(page).getByTestId('part-group-back').getByTestId('view-eye').first().click()
    expect(await look('u1')).toEqual({ lit: false, ghost: false })
    await drawer(page).getByTestId('part-group-back').getByTestId('view-eye').first().click()
    expect(await look('u1')).toEqual({ lit: false, ghost: true })
    // the assembly workspace shows its steps, not the design's X-ray
    await page.evaluate(() => window.__uiStore.getState().setWorkspace('assembly'))
    expect(await look('u1')).toEqual({ lit: false, ghost: false })
    await page.evaluate(() => window.__uiStore.getState().setWorkspace('design'))
    expect(await look('u1')).toEqual({ lit: false, ghost: true })
  })
})
