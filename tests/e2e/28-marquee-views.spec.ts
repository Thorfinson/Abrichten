import { test, expect } from '@playwright/test'
import { bootWithSample, setView, deselectAll, fitView, projectToCanvas, dragCanvas, getUI } from './helpers'

/**
 * Marquee selection: uses the current view after a view switch, and a
 * marquee over several assemblies selects within one assembly only.
 */

test.describe('Marquee selection', () => {
  test('after switching front → side the marquee uses the side axes (z, y)', async ({ page }) => {
    await bootWithSample(page)
    await setView(page, 'front')
    await setView(page, 'side')
    await deselectAll(page)
    await fitView(page)
    await page.waitForTimeout(300)

    // Empty region behind the cabinet in z (all boards end at z = 300)
    const a = await projectToCanvas(page, { x: 0, y: 100, z: 450 })
    const b = await projectToCanvas(page, { x: 0, y: 600, z: 650 })
    await dragCanvas(page, a, b)
    expect((await getUI(page)).selectedBoardIds).toEqual([])

    // Band across the top (y 690–740) over the full depth: Deckel, both sides, back panel
    const c = await projectToCanvas(page, { x: 0, y: 740, z: -60 })
    const d = await projectToCanvas(page, { x: 0, y: 690, z: 360 })
    await dragCanvas(page, c, d)
    const sel = (await getUI(page)).selectedBoardIds
    expect(sel).toContain('b-deckel')
    expect(sel).not.toContain('b-boden')
  })

  test('a marquee over two assemblies selects within one: the current one if hit, else the one with most hits', async ({ page }) => {
    await bootWithSample(page)
    const ids = await page.evaluate(() => {
      const st = window.__projectStore.getState()
      const asm2 = st.addAssembly('Zweite')
      const board = st.addBoard(asm2, {
        name: 'Extra', width: 100, height: 100, depth: 100, materialId: 'buche', color: '#D4A574',
        position: { x: 700, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }
      })
      return { asm2, board }
    })
    await setView(page, 'front')
    await page.evaluate(() => window.__uiStore.setState({ selectedAssemblyId: null, selectedBoardIds: [] }))
    await fitView(page)
    await page.waitForTimeout(300)

    const from = await projectToCanvas(page, { x: -80, y: 800, z: 0 })
    const to = await projectToCanvas(page, { x: 880, y: -60, z: 0 })
    const all = async () => {
      await dragCanvas(page, from, to)
      return page.evaluate(() => {
        const s = window.__uiStore.getState()
        const asm = window.__projectStore.getState().project.assemblies.find((a: any) => a.id === s.selectedAssemblyId)
        const own = new Set(asm?.boards.map((b: any) => b.id) ?? [])
        return { asm: s.selectedAssemblyId, ids: s.selectedBoardIds as string[], allOwn: s.selectedBoardIds.every((id: string) => own.has(id)) }
      })
    }

    // No current assembly: the cabinet (6 hits) wins over the extra board (1 hit)
    const first = await all()
    expect(first.asm).toBe('asm-1')
    expect(first.ids).toHaveLength(6)
    expect(first.allOwn).toBe(true)

    // The extra board's assembly is current: it keeps the selection
    await page.evaluate(({ a, b }) => window.__uiStore.getState().selectBoard(a, b), { a: ids.asm2, b: ids.board })
    await page.evaluate(() => window.__uiStore.getState().deselectAll())
    const second = await all()
    expect(second.asm).toBe(ids.asm2)
    expect(second.ids).toEqual([ids.board])
  })
})
