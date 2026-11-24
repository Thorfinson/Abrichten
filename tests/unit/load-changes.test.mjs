// Prüffälle mit bekannter Antwort: Was das Laden an einer Datei ändert, wird gemeldet (Review 23.11.2026, Daten 2, 10, 11).
// Wahrheit: die Datei, wie sie gelesen wurde. Ein gültiges Projekt lädt ohne Meldung (auch ein großes echtes: 0).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const { validateProject } = await import('../../src/renderer/src/utils/validateProject.ts')
const { describeLoadChanges, formatLoadChange } = await import('../../src/renderer/src/utils/loadChanges.ts')

const board = (id, name, extra = {}) => ({ id, name, width: 600, height: 18, depth: 300, position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, materialId: 'fichte', color: '#d2b48c', ...extra })
const project = (boards, joints = []) => ({ id: 'p1', name: 'Probe', assemblies: [{ id: 'a1', name: 'Regal', boards, joints }] })
const changes = (raw) => describeLoadChanges(raw, validateProject(structuredClone(raw)))

test('ein gültiges Projekt lädt ohne Meldung, auch ein zweites Mal', () => {
  const once = validateProject(project([board('b1', 'Boden')]))
  assert.deepEqual(describeLoadChanges(structuredClone(once), validateProject(structuredClone(once))), [])
})

test('eine Last, die über das Brett ragt, wird nicht still verworfen, sondern gemeldet', () => {
  const raw = project([board('b1', 'Arbeitsplatte', { loads: [{ id: 'l1', x: 550, z: 0, w: 100, d: 100, kg: 30 }] })])
  const ch = changes(raw)
  assert.equal(ch.length, 1)
  assert.equal(ch[0].kind, 'removed')
  assert.equal(ch[0].where, 'Arbeitsplatte')
  assert.match(ch[0].field, /^loads\[0\]$/)
  assert.equal(formatLoadChange(ch[0], 'de'), 'Arbeitsplatte: Last 1 entfernt (30 kg)')
})

test('ein Name mit Leerzeichen am Rand wird gemeldet, mit vorher und nachher', () => {
  const ch = changes(project([board('b1', 'Boden ')]))
  assert.deepEqual(ch.map((c) => [c.kind, c.field, c.before, c.after]), [['changed', 'name', 'Boden ', 'Boden']])
})

test('eine Verbindung zu einem fehlenden Brett wird gemeldet', () => {
  const j = { id: 'j1', type: 'screw', boardA: 'b1', boardB: 'fehlt', position: { x: 0, y: 0, z: 0 }, fasteners: [] }
  const ch = changes(project([board('b1', 'Boden')], [j]))
  assert.ok(ch.some((c) => c.kind === 'removed' && /joints\[0\]/.test(c.field)), JSON.stringify(ch))
})

// Zweitprüfung 24.11.: Listen ohne Kennung, doppelte Kennungen, Behälter im Pfad, Startfrage
test('ein Beschlag in der Mitte entfernt: genau eine Entfernung, keine falschen Änderungen dahinter', () => {
  const raw = project([board('b1', 'Seite', { hardware: [{ hardwareId: 'h1', quantity: 2 }, { hardwareId: 'h1', quantity: 5000 }, { hardwareId: 'h2', quantity: 2 }] })])
  const ch = changes(raw)
  assert.ok(ch.every((c) => c.kind === 'removed' || !/hardwareId/.test(c.field)), JSON.stringify(ch))
})

test('zwei Teile mit derselben Kennung: gemeldet, ohne erfundene Namens- oder Lageänderung', () => {
  const ch = changes(project([board('b1', 'Boden'), board('b1', 'Deckel', { position: { x: 0, y: 700, z: 0 } })]))
  assert.ok(ch.some((c) => c.kind === 'duplicate' && c.before === 'b1'), JSON.stringify(ch))
  assert.ok(!ch.some((c) => c.field === 'name' || c.field === 'position.y'), JSON.stringify(ch))
})

test('eine Änderung in einem Ausschnitt sagt, dass sie im Ausschnitt ist', () => {
  const raw = project([board('b1', 'Boden', { cutouts: [{ id: 'c1', shape: 'circle', x: 100, z: 100, width: 50, depth: 80 }] })])
  const ch = changes(raw)
  for (const c of ch) assert.match(formatLoadChange(c, 'de'), /Ausschnitt 1/, formatLoadChange(c, 'de'))
})

const { checkChangedFile } = await import('../../src/renderer/src/utils/changedFile.ts')
test('die Startfrage reicht die Datei wie gelesen weiter: was die Prüfung ändert, bleibt meldbar', () => {
  const raw = project([board('b1', 'Arbeitsplatte', { loads: [{ id: 'l1', x: 550, z: 0, w: 100, d: 100, kg: 30 }] })])
  const check = checkChangedFile('p1', JSON.stringify(raw))
  assert.equal(check.kind, 'ask')
  assert.equal(describeLoadChanges(check.raw, validateProject(structuredClone(check.raw))).length, 1)
})

test('ein gespeichertes Kurzwort mit 17 Buchstaben lädt ohne Meldung (früher „Unterkonstruktio 12“)', () => {
  const raw = project([board('b1', 'Boden')])
  raw.assemblies[0].shortName = 'Unterkonstruktion'
  assert.deepEqual(changes(raw), [])
})
