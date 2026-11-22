import { test, expect } from '@playwright/test'
import { bootWithSample, deselectAll } from './helpers'

/**
 * Assembly tree: groups start collapsed so large projects stay readable; selecting
 * a board opens its group automatically so the board shows up in the tree.
 */
test.describe('Assembly drawer', () => {
  test('groups start collapsed and the group of a selected board opens', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await deselectAll(page)
    const name = await page.evaluate((id) => {
      for (const a of window.__projectStore.getState().project.assemblies) {
        const b = a.boards.find((x: any) => x.id === id)
        if (b) return b.name as string
      }
      return ''
    }, firstBoardId)
    await page.evaluate(() => window.__uiStore.getState().setShowAssemblyDrawer(true))
    // the row's tooltip names the part with its label: "Wandschrank 1 Seitenwand Links · …"
    const item = page.locator(`[title^="Wandschrank 1 ${name} ·"]`)
    await expect(item).toHaveCount(0)

    await page.evaluate(({ a, b }) => window.__uiStore.getState().selectBoard(a, b), { a: assemblyId, b: firstBoardId })
    await expect(item).toBeVisible()
  })

  test('dragging a group onto another nests it; the parent eye and path cover the subtree', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    await deselectAll(page)
    const { parentId, name } = await page.evaluate((id) => {
      const st = window.__projectStore.getState()
      return { parentId: st.addAssembly('Küche') as string, name: st.project.assemblies.find((a: any) => a.id === id).name as string }
    }, assemblyId)
    await page.evaluate(() => window.__uiStore.getState().setShowAssemblyDrawer(true))

    const header = (id: string) => page.locator(`[data-assembly-id="${id}"]`)
    const box = await header(parentId).boundingBox()
    await header(assemblyId).dragTo(header(parentId), { targetPosition: { x: 40, y: box!.height / 2 } })
    const state = () => page.evaluate((id) => {
      const list = window.__projectStore.getState().project.assemblies
      const a = list.find((x: any) => x.id === id)
      return { parentId: a?.parentId ?? null, visible: a?.visible ?? null, count: list.length }
    }, assemblyId)
    await expect.poll(async () => (await state()).parentId).toBe(parentId)

    // a group cannot go into its own subgroup
    await page.evaluate(({ a, p }) => window.__projectStore.getState().moveAssembly(p, a, 'inside'), { a: assemblyId, p: parentId })
    expect((await state()).parentId).toBe(parentId)

    // save/load keeps the tree
    await page.evaluate(() => {
      const st = window.__projectStore.getState()
      st.loadProject(JSON.parse(JSON.stringify(st.project)))
    })
    expect((await state()).parentId).toBe(parentId)

    // the parent eye hides everything below it
    await page.evaluate((p) => window.__projectStore.getState().toggleAssemblyVisibility(p), parentId)
    expect((await state()).visible).toBe(false)
    const subVisible = await page.evaluate((p) => {
      const st = window.__projectStore.getState()
      const id = st.addAssembly('Neu', p)
      return window.__projectStore.getState().project.assemblies.find((a: any) => a.id === id).visible
    }, parentId)
    expect(subVisible).toBe(false)   // a new subgroup of a hidden group starts hidden
    await page.evaluate((p) => window.__projectStore.getState().toggleAssemblyVisibility(p), parentId)
    expect((await state()).visible).toBe(true)

    // the cutting list shows the path
    await page.evaluate(() => window.__uiStore.getState().setShowCuttingList(true))
    await expect(page.locator('table').first().getByText(`Küche › ${name}`).first()).toBeVisible()

    // deleting the parent removes the whole subtree
    await page.evaluate((p) => window.__projectStore.getState().removeAssembly(p), parentId)
    expect((await state()).count).toBe(0)
  })
})
