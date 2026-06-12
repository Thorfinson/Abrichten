import { test, expect } from '@playwright/test'
import { bootWithSample, selectBoard, getUI } from './helpers'

test.describe('Selection model', () => {
  test('selectBoard sets selectedBoardIds and assemblyId', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, firstBoardId)
    const ui = await getUI(page)
    expect(ui.selectedBoardIds).toEqual([firstBoardId])
  })

  test('toggleBoardSelection adds/removes from multi-selection', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const boards = await page.evaluate(() => {
      const proj = window.__projectStore.getState().project
      return proj.assemblies[0].boards.slice(0, 3).map((b: any) => b.id)
    })
    await page.evaluate(
      ({ a, ids }) => {
        const ui = window.__uiStore.getState()
        ui.selectBoard(a, ids[0])
        ui.toggleBoardSelection(a, ids[1])
        ui.toggleBoardSelection(a, ids[2])
      },
      { a: assemblyId, ids: boards }
    )
    const ui = await getUI(page)
    expect(ui.selectedBoardIds.sort()).toEqual([...boards].sort())

    // Toggle one off
    await page.evaluate(
      ({ a, id }) => window.__uiStore.getState().toggleBoardSelection(a, id),
      { a: assemblyId, id: boards[1] }
    )
    const ui2 = await getUI(page)
    expect(ui2.selectedBoardIds.sort()).toEqual([boards[0], boards[2]].sort())
  })

  test('Escape clears selection', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, firstBoardId)
    expect((await getUI(page)).selectedBoardIds).toHaveLength(1)

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
    expect((await getUI(page)).selectedBoardIds).toHaveLength(0)
  })

  test('Ctrl+A selects all boards in active assembly', async ({ page }) => {
    const { assemblyId, firstBoardId } = await bootWithSample(page)
    await selectBoard(page, assemblyId, firstBoardId) // arm activeAssemblyId
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    await page.keyboard.press('Control+a')
    await page.waitForTimeout(120)
    const ui = await getUI(page)
    const total = await page.evaluate(() => window.__projectStore.getState().project.assemblies[0].boards.length)
    expect(ui.selectedBoardIds).toHaveLength(total)
  })
})
