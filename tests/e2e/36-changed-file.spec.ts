import { test, expect, type Page } from '@playwright/test'

/*
 * Startup question: the start restores the auto-save (IndexedDB), not the file.
 * When the main process reports that the last opened or saved file was changed
 * outside the app (src/main/lastFile.ts, mocked here as window.electronAPI), the
 * app asks "Die Datei ist neuer als der gespeicherte Stand – neu laden?".
 */

const board = (id: string, name: string, y = 0) => ({
  id, name, width: 600, height: 18, depth: 560, position: { x: 0, y, z: 0 }, materialId: 'spanplatte'
})
const kitchen = (boards: ReturnType<typeof board>[], extra: Record<string, unknown> = {}) => ({
  id: 'mk', name: 'Musterküche', assemblies: [{ id: 'a', name: 'Unterkonstruktion', boards, joints: [] }], ...extra
})
/** What the app auto-saved: one board */
const autoSaved = kitchen([board('b1', 'Boden')])
/** What a script wrote into the file since: a second board */
const fromScript = kitchen([board('b1', 'Boden'), board('b2', 'Fachboden', 300)])
const PATH = '/Users/beispiel/Projekte/Musterküche.abrichten.json'
const MODIFIED = new Date(2026, 10, 21, 13, 26).getTime()

interface Start {
  /** The auto-save entry the app restores */
  entry: Record<string, unknown>
  /** What the main process reports as changed (file content), or null */
  content: string | null
}

/** Boot once to create the database, put the auto-save in, start again with the file report. */
async function startWith(page: Page, { entry, content }: Start): Promise<void> {
  await page.addInitScript(({ path, content, modifiedAt }) => {
    try { localStorage.setItem('abrichten-welcomed', '1') } catch { /* */ }
    const w = window as any
    w.__checks = 0
    w.__seen = 0
    w.electronAPI = {
      fileSave: async () => null,
      fileOpen: async () => null,
      fileExport: async () => null,
      lastFileChanged: async () => { w.__checks++; return content === null ? null : { path, content, modifiedAt } },
      lastFileSeen: async () => { w.__seen++ }
    }
  }, { path: PATH, content, modifiedAt: MODIFIED })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'abrichten-db'))
  await page.evaluate((data) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('abrichten-db')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const tx = req.result.transaction('projects', 'readwrite')
      tx.objectStore('projects').put({ key: 'current', ...data })
      tx.oncomplete = () => { req.result.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  }), entry)
  await page.reload()
  await page.waitForLoadState('networkidle')
  // restored, and the main process was asked
  await page.waitForFunction(() => (window as any).__projectStore?.getState().project.id === 'mk' && (window as any).__checks > 0)
}

const boardNames = (page: Page) => page.evaluate(() =>
  (window as any).__projectStore.getState().project.assemblies.flatMap((a: any) => a.boards.map((b: any) => b.name)))
const dirty = (page: Page) => page.evaluate(() => {
  const s = (window as any).__projectStore.getState()
  return s.project !== s.savedProject
})
const seen = (page: Page) => page.evaluate(() => (window as any).__seen)
const question = (page: Page) => page.getByRole('alertdialog', { name: /Datei außerhalb der App geändert|File changed outside the app/ })

test.describe('Startup: file changed outside the app', () => {
  test('asks, and "Datei laden" loads the file as saved', async ({ page }) => {
    await startWith(page, { entry: { data: autoSaved, unsaved: false }, content: JSON.stringify(fromScript, null, 2) })

    const dlg = question(page)
    await expect(dlg).toBeVisible()
    await expect(dlg.getByText('Die Datei ist neuer als der gespeicherte Stand – neu laden?')).toBeVisible()
    await expect(dlg.getByText(/„Musterküche\.abrichten\.json“ wurde am 21\.11\.2026 um 13:26 außerhalb von Abrichten geändert/)).toBeVisible()
    await expect(dlg.getByText('/Users/beispiel/Projekte', { exact: true })).toBeVisible()
    await expect(dlg.getByText(/ungesicherte Änderungen/)).toHaveCount(0)
    // until answered, the app shows its own saved state
    expect(await boardNames(page)).toEqual(['Boden'])

    await dlg.getByRole('button', { name: 'Datei laden' }).click()
    await expect(dlg).toHaveCount(0)
    expect(await boardNames(page)).toEqual(['Boden', 'Fachboden'])
    expect(await dirty(page)).toBe(false)
    expect(await seen(page)).toBe(1)
    // the swap is not an undo step back to the old state
    expect(await page.evaluate(() => (window as any).__projectStore.temporal.getState().pastStates.length)).toBe(0)
  })

  test('"Stand der App behalten" keeps the auto-save', async ({ page }) => {
    await startWith(page, { entry: { data: autoSaved, unsaved: false }, content: JSON.stringify(fromScript) })
    await question(page).getByRole('button', { name: 'Stand der App behalten' }).click()
    await expect(question(page)).toHaveCount(0)
    expect(await boardNames(page)).toEqual(['Boden'])
    expect(await seen(page)).toBe(1)
  })

  test('unsaved changes in the app are pointed out; Esc leaves it undecided', async ({ page }) => {
    const edited = kitchen([board('b1', 'Boden (geändert)')])
    await startWith(page, { entry: { data: edited, unsaved: true, saved: autoSaved }, content: JSON.stringify(fromScript) })
    const dlg = question(page)
    await expect(dlg.getByText('In der App gibt es ungesicherte Änderungen. Beim Laden der Datei gehen sie verloren.')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dlg).toHaveCount(0)
    expect(await boardNames(page)).toEqual(['Boden (geändert)'])
    expect(await dirty(page)).toBe(true)
    // not answered: the next start asks again
    expect(await seen(page)).toBe(0)
  })

  test('no question when the file holds another project (e.g. after "New")', async ({ page }) => {
    await startWith(page, { entry: { data: autoSaved, unsaved: false }, content: JSON.stringify({ ...fromScript, id: 'anderes' }) })
    await page.waitForTimeout(300)
    await expect(question(page)).toHaveCount(0)
    expect(await boardNames(page)).toEqual(['Boden'])
  })

  test('no question when the file is unchanged', async ({ page }) => {
    await startWith(page, { entry: { data: autoSaved, unsaved: false }, content: null })
    await page.waitForTimeout(300)
    await expect(question(page)).toHaveCount(0)
    expect(await boardNames(page)).toEqual(['Boden'])
  })

  test('a changed file that does not load is reported; the app keeps its state', async ({ page }) => {
    await startWith(page, { entry: { data: autoSaved, unsaved: false }, content: '{ "id": "mk", "assemblies": ' })
    await expect(page.getByText(/„Musterküche\.abrichten\.json“ wurde außerhalb der App geändert, lässt sich aber nicht laden/)).toBeVisible()
    await expect(question(page)).toHaveCount(0)
    expect(await boardNames(page)).toEqual(['Boden'])
  })
})
