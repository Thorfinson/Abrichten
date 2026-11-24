import { test, expect } from '@playwright/test'
import { bootWithSample } from './helpers'

// What loading changes is reported, and the project then is not "saved" (finding 23.11.2026, review data 2, 10, 11).
test('loading a file with an invalid load reports it and leaves the project unsaved', async ({ page }) => {
  await bootWithSample(page)
  const result = await page.evaluate(() => {
    const store = window.__projectStore
    const board = { id: 'b1', name: 'Arbeitsplatte', width: 600, height: 18, depth: 300, position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, materialId: 'fichte', color: '#d2b48c', loads: [{ id: 'l1', x: 550, z: 0, w: 100, d: 100, kg: 30 }] }
    const changes = store.getState().loadProject({ id: 'p1', name: 'Probe', assemblies: [{ id: 'a1', name: 'Regal', boards: [board], joints: [] }] })
    const st = store.getState()
    // unsaved (the saved copy is another object), but a copy is kept so that "discard" does not delete the auto-save
    return { count: changes.length, where: changes[0]?.where, unsaved: st.savedProject !== st.project, hasCopy: st.savedProject !== null }
  })
  expect(result).toEqual({ count: 1, where: 'Arbeitsplatte', unsaved: true, hasCopy: true })

  const clean = await page.evaluate(() => {
    const store = window.__projectStore
    const again = store.getState().loadProject(JSON.parse(JSON.stringify(store.getState().project)))
    const st = store.getState()
    return { count: again.length, saved: st.savedProject === st.project }
  })
  expect(clean).toEqual({ count: 0, saved: true })
})
