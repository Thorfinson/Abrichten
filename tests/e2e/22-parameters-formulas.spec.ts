import { test, expect, Page } from '@playwright/test'
import { bootWithSample, findBoardIdByName, selectBoard, getBoard } from './helpers'

/**
 * Parametric dimensions through the real UI:
 *  - leaving a dimension field without editing keeps its formula (no undo step)
 *  - invalid input is flagged instead of silently dropped; comma decimals and "=H+20" work
 *  - the Parameters panel refuses a rename onto an existing name and resizes boards on a value change
 *  - an unreadable auto-save is reported and kept as a backup on the next start
 */

const undoSteps = (page: Page) => page.evaluate(() => (window.__projectStore.temporal.getState() as any).pastStates.length as number)

/** The text input next to a dimension label in the floating properties card. */
const dimField = (page: Page, label: RegExp) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::div//input')

test.describe('Parameters and formulas', () => {
  test('dimension field: blur keeps the formula, bad input is flagged, comma and "=" are accepted', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const sideId = await findBoardIdByName(page, 'Seitenwand Links')
    await page.evaluate(({ a, b }) => window.__projectStore.getState().updateBoard(a, b, { heightFormula: 'H' }), { a: assemblyId, b: sideId })
    await selectBoard(page, assemblyId, sideId)
    const height = dimField(page, /^(Höhe|Height)$/)
    await expect(height).toBeVisible()

    // focus + leave: nothing changes
    const steps = await undoSteps(page)
    await height.focus()
    await height.blur()
    expect(await page.evaluate((id) => window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === id).heightFormula, sideId)).toBe('H')
    expect(await undoSteps(page)).toBe(steps)

    // malformed number: flagged, board unchanged; Esc resets the text
    await height.fill('1.2.3')
    await height.press('Enter')
    await expect(height).toHaveAttribute('aria-invalid', 'true')
    expect((await getBoard(page, sideId)).height).toBe(720)
    await height.focus()
    await height.press('Escape')
    await expect(height).not.toHaveAttribute('aria-invalid', 'true')

    // the tooltip's own example
    await height.fill('=H+20')
    await height.press('Enter')
    await expect.poll(async () => (await getBoard(page, sideId)).height).toBe(740)
    expect(await page.evaluate((id) => window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === id).heightFormula, sideId)).toBe('H+20')

    // comma decimal: a plain number, clears the formula
    await height.fill('700,5')
    await height.press('Enter')
    await expect.poll(async () => (await getBoard(page, sideId)).height).toBe(700.5)
    expect(await page.evaluate((id) => window.__projectStore.getState().project.assemblies[0].boards.find((b: any) => b.id === id).heightFormula, sideId)).toBeUndefined()
  })

  test('parameters panel: rename onto an existing name is refused, a new value resizes the boards in one undo step', async ({ page }) => {
    const { assemblyId } = await bootWithSample(page)
    const sideId = await findBoardIdByName(page, 'Seitenwand Links')
    await page.evaluate(({ a, b }) => {
      const st = window.__projectStore.getState()
      st.updateBoard(a, b, { heightFormula: 'H', widthFormula: 'B - 582' })
      window.__uiStore.getState().setShowParametersPanel(true)
    }, { a: assemblyId, b: sideId })

    // B → H would overwrite H and turn "B - 582" into "H - 582"
    const nameCell = (n: string) => page.locator('td span', { hasText: new RegExp(`^${n}$`) })
    await nameCell('B').dblclick()
    const rename = page.locator('td input[type="text"]')
    await rename.fill('H')
    await rename.press('Enter')
    await expect(page.getByRole('alert')).toHaveText(/existiert bereits|already exists/)
    expect(await page.evaluate(() => window.__projectStore.getState().project.parameters)).toEqual({ H: 720, B: 600, T: 300 })
    await rename.press('Escape')
    await expect(page.getByRole('alert')).toHaveCount(0)

    // H 720 → 800 through the value field
    const steps = await undoSteps(page)
    const hRow = page.locator('tr', { has: nameCell('H') })
    await hRow.locator('input[type="number"]').fill('800')
    await hRow.locator('input[type="number"]').press('Enter')
    await expect.poll(async () => (await getBoard(page, sideId)).height).toBe(800)
    expect(await undoSteps(page)).toBe(steps + 1)
    await page.evaluate(() => window.__projectStore.temporal.getState().undo())
    expect((await getBoard(page, sideId)).height).toBe(720)
    expect(await page.evaluate(() => window.__projectStore.getState().project.parameters.H)).toBe(720)
  })

  test('an unreadable auto-save is reported and kept as a backup', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'abrichten-db'))

    // what an unvalidated AI import used to leave behind
    const bad = { name: 'Küche', assemblies: [{ id: 'a', name: 'A', boards: [{ id: 'b', name: 'Seite', width: '600mm', height: 720, depth: 18, position: { x: 0, y: 0, z: 0 } }], joints: [] }] }
    await page.evaluate((data) => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('abrichten-db')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const tx = req.result.transaction('projects', 'readwrite')
        tx.objectStore('projects').put({ key: 'current', data })
        tx.oncomplete = () => { req.result.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    }), bad)

    await page.reload()
    await expect(page.getByText(/Automatische Sicherung konnte nicht geladen werden|The auto-save could not be restored/)).toBeVisible()

    const stored = await page.evaluate(() => new Promise<{ key: string; data: any }[]>((resolve, reject) => {
      const req = indexedDB.open('abrichten-db')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const all = req.result.transaction('projects').objectStore('projects').getAll()
        all.onsuccess = () => { req.result.close(); resolve(all.result) }
        all.onerror = () => reject(all.error)
      }
    }))
    expect(stored.map((e) => e.key).filter((k) => k === 'current')).toEqual([])
    const backups = stored.filter((e) => e.key.startsWith('unreadable-'))
    expect(backups).toHaveLength(1)
    expect(backups[0].data).toEqual(bad)
  })
})
