// Guards the startup question "Die Datei ist neuer als der gespeicherte Stand – neu laden?":
// the main process remembers the project file last opened or saved and reports when it was
// changed outside the app (src/main/lastFile.ts); the renderer only asks for the same project
// (utils/changedFile.ts); Esc leaves the question undecided (store/useUIStore.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const mem = new Map([['abrichten-welcomed', '1']])
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
})
const { LastFile, contentHash } = await import('../../src/main/lastFile.ts')
const { checkChangedFile, fileNameOf, folderOf } = await import('../../src/renderer/src/utils/changedFile.ts')
const { useUIStore, topModal } = await import('../../src/renderer/src/store/useUIStore.ts')

/** A data folder and a project file in a fresh temp dir; removed after the test. */
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'abrichten-lastfile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'Küche 5.abrichten.json')
  return { root, file, last: new LastFile(join(root, 'userData')) }
}

const project = (extra = {}) => JSON.stringify({ id: 'dnzmrp4d', name: 'Küche 5', assemblies: [], ...extra }, null, 2)

test('nothing remembered yet: no question', async (t) => {
  const { last } = await setup(t)
  assert.equal(await last.read(), null)
  assert.equal(await last.changed(), null)
})

test('opened or saved and unchanged since: no question', async (t) => {
  const { file, last } = await setup(t)
  await writeFile(file, project())
  await last.remember(file, project())
  assert.deepEqual(await last.read(), { path: file, hash: contentHash(project()) })
  // also from a new app start (a new instance reads the memo from disk)
  assert.equal(await last.changed(), null)
})

test('changed outside the app: reported with content and time, until answered', async (t) => {
  const { root, file, last } = await setup(t)
  await writeFile(file, project())
  await last.remember(file, project())

  const changedContent = project({ name: 'Küche 5 (Skript)' })
  await writeFile(file, changedContent)
  const afterRestart = new LastFile(join(root, 'userData'))
  const changed = await afterRestart.changed()
  assert.equal(changed.path, file)
  assert.equal(changed.content, changedContent)
  assert.equal(typeof changed.modifiedAt, 'number')
  assert.ok(Math.abs(changed.modifiedAt - Date.now()) < 60_000)

  // not answered (Esc): the next start asks again
  assert.ok(await new LastFile(join(root, 'userData')).changed())

  // answered (loaded or kept): this version is known, no question at the next start
  await afterRestart.seen()
  assert.equal(await new LastFile(join(root, 'userData')).changed(), null)

  // a further change is reported again
  await writeFile(file, project({ name: 'Küche 5 (noch mal)' }))
  assert.ok(await new LastFile(join(root, 'userData')).changed())
})

test('saving over the changed file makes it known again', async (t) => {
  const { file, last } = await setup(t)
  await writeFile(file, project())
  await last.remember(file, project())
  await writeFile(file, project({ name: 'außen geändert' }))
  assert.ok(await last.changed())
  await writeFile(file, project({ name: 'aus der App' }))
  await last.remember(file, project({ name: 'aus der App' }))
  // seen() after remember() must not bring back the outside version as known
  await last.seen()
  assert.equal(await last.changed(), null)
  assert.equal((await last.read()).hash, contentHash(project({ name: 'aus der App' })))
})

test('file gone or memo broken: no question, no error', async (t) => {
  const { root, file, last } = await setup(t)
  await writeFile(file, project())
  await last.remember(file, project())
  await rm(file)
  assert.equal(await last.changed(), null)

  await writeFile(join(root, 'userData', 'last-project-file.json'), '{ kaputt')
  assert.equal(await last.read(), null)
  assert.equal(await last.changed(), null)
  await last.seen()   // nothing reported: a no-op
  assert.equal(await readFile(join(root, 'userData', 'last-project-file.json'), 'utf8'), '{ kaputt')
})

test('the renderer asks only for the restored project', () => {
  const ask = checkChangedFile('dnzmrp4d', project({ name: 'Küche 5 (Skript)' }))
  assert.equal(ask.kind, 'ask')
  assert.equal(ask.project.id, 'dnzmrp4d')
  assert.equal(ask.project.name, 'Küche 5 (Skript)')
  assert.deepEqual(ask.project.assemblies, [])

  // after "New" the app holds another project: the last file is not offered
  assert.deepEqual(checkChangedFile('neues-projekt', project()), { kind: 'otherProject' })
})

test('a changed file that does not load is reported with the reason', () => {
  const broken = checkChangedFile('dnzmrp4d', '{ "id": "dnzmrp4d", ')
  assert.equal(broken.kind, 'invalid')
  assert.match(broken.reason, /JSON/)
  assert.deepEqual(checkChangedFile('dnzmrp4d', '{ "id": "dnzmrp4d" }'), { kind: 'invalid', reason: '"assemblies" missing' })
  assert.deepEqual(checkChangedFile('dnzmrp4d', 'null'), { kind: 'invalid', reason: 'root is not an object' })
})

test('file name and folder for the question (macOS and Windows paths)', () => {
  const mac = '/Users/e/Library/CloudStorage/OneDrive/2026-Kueche/Küche 5.abrichten.json'
  assert.equal(fileNameOf(mac), 'Küche 5.abrichten.json')
  assert.equal(folderOf(mac), '/Users/e/Library/CloudStorage/OneDrive/2026-Kueche')
  assert.equal(fileNameOf('C:\\Küche\\Küche 5.abrichten.json'), 'Küche 5.abrichten.json')
  assert.equal(folderOf('C:\\Küche\\Küche 5.abrichten.json'), 'C:\\Küche')
  assert.equal(folderOf('Küche 5.abrichten.json'), '')
})

test('the question is a modal; Esc closes it undecided', () => {
  const ui = () => useUIStore.getState()
  ui().setChangedFile({ path: '/k/Küche 5.abrichten.json', modifiedAt: 0, project: JSON.parse(project()) })
  useUIStore.setState({ showCuttingList: true })
  assert.equal(topModal(ui()), 'changedFile')
  ui().closeTopModal()
  assert.equal(ui().changedFile, null)
  assert.equal(topModal(ui()), 'showCuttingList')
  ui().closeTopModal()
})

test('the question has German and English texts', async () => {
  const keys = ['title', 'question', 'changedAt', 'unsavedWarning', 'keep', 'load', 'invalid']
  for (const lang of ['de', 'en']) {
    const { fileChanged } = JSON.parse(await readFile(new URL(`../../src/renderer/src/i18n/${lang}.json`, import.meta.url), 'utf8'))
    for (const k of keys) assert.ok(fileChanged?.[k], `${lang}: fileChanged.${k}`)
  }
  const { fileChanged } = JSON.parse(await readFile(new URL('../../src/renderer/src/i18n/de.json', import.meta.url), 'utf8'))
  assert.equal(fileChanged.question, 'Die Datei ist neuer als der gespeicherte Stand – neu laden?')
})
