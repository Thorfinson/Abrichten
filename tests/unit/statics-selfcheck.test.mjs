// Selbstprüfung der Statik mit bekannter Antwort (Review 23.11.2026, Statik A1–A3; Notbremse):
// - gleiche Eingabe = gleiches Ergebnis, unabhängig von der Reihenfolge der Bretter und von früheren Rechnungen;
// - jede Last ist verbucht: hinein = am Boden + im Kreis verworfen + steckt in Teilen ohne Auflager;
// - wo ein Kreis Last verwirft, sind die beteiligten Bretter „unsicher“, statt still „ok“.
// Wahrheit: Erhaltung der Kraft und die Gleichheit eines Möbels mit sich selbst, nicht die frühere Ausgabe.
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
globalThis.performance ??= { now: () => Date.now() }
const sim = await import('../../src/renderer/src/services/static-sim.ts')

const bd = (id, x0, x1, y0, y1, z0, z1, extra = {}) => ({ id, name: id, width: x1 - x0, height: y1 - y0, depth: z1 - z0,
  position: { x: x0, y: y0, z: z0 }, rotation: { x: 0, y: 0, z: 0 }, materialId: 'fichte', color: '#fff', ...extra })
const j = (a, b, type = 'screw') => ({ id: a + b, type, boardA: a, boardB: b, position: { x: 0, y: 0, z: 0 }, fasteners: [] })

const MX = { materialId: 'multiplex-birke' }
const FAELLE = {
  // Regal: Boden zwischen zwei Seiten, eine Kiste außermittig
  regal: { boards: [bd('links', 0, 18, 0, 700, 0, 300), bd('rechts', 1018, 1036, 0, 700, 0, 300),
    bd('boden', 18, 1018, 400, 418, 0, 300, { weightKg: 10 }), bd('kiste', 218, 418, 418, 518, 50, 250, { weightKg: 30 })], joints: [] },
  // Kreis: zwei Böden Stirn an Stirn, jeder auf seiner Seite, dazu eine Mittelwand
  kreis: { boards: [bd('links', 0, 18, 0, 700, 0, 300), bd('mitte', 500, 518, 0, 700, 0, 300), bd('rechts', 1018, 1036, 0, 700, 0, 300),
    bd('boden A', 18, 500, 400, 418, 0, 300, { weightKg: 10 }), bd('boden B', 518, 1018, 400, 418, 0, 300, { weightKg: 10 }),
    bd('kiste', 400, 640, 418, 518, 50, 250, { weightKg: 30 })], joints: [] },
  // A1 (Review-Skript 23-split): ein Fachboden aus zwei losen Hälften zwischen zwei Seiten, in der Mitte stumpf gestoßen
  haelften: { boards: [bd('links', 0, 18, 0, 720, 0, 300, MX), bd('rechts', 582, 600, 0, 720, 0, 300, MX),
    bd('hälfte A', 18, 300, 400, 419, 0, 300, MX), bd('hälfte B', 300, 582, 400, 419, 0, 300, MX)], joints: [] },
  // Eckpfosten im Kleinen: Pfosten auf Schiene, Balken oben, zwei angeschraubte Auflagen
  pfosten: { boards: [bd('schiene', 0, 1200, 0, 100, 0, 56), bd('post', 0, 36, 100, 814, 0, 36), bd('post2', 1064, 1100, 100, 814, 0, 36),
    bd('balken', 0, 1200, 814, 870, 0, 36, { weightKg: 47 }),
    bd('auflage250', 36, 1064, 339, 375, 0, 56, { weightKg: 74 }), bd('auflage468', 36, 1064, 557, 593, 0, 56, { weightKg: 74 })],
    joints: [j('post', 'schiene'), j('post2', 'schiene'), j('post', 'balken'), j('post2', 'balken'), j('post', 'auflage250', 'butt'),
      j('post', 'auflage468', 'butt'), j('post2', 'auflage250', 'butt'), j('post2', 'auflage468', 'butt')] },
}
const run = (boards, joints, kg = 20) => sim.simulateStatics(boards, { payloadKg: kg, joints })
const sig = (r) => `${r.status}|${r.uMax.toFixed(6)}|${r.totalLoadN.toFixed(3)}|${JSON.stringify(r.unsure ?? null)}`

for (const [name, { boards, joints }] of Object.entries(FAELLE)) {
  test(`${name}: umgekehrte Reihenfolge der Bretter und Verbindungen ergibt dasselbe`, () => {
    sim.clearStaticCache(); const a = run(boards, joints)
    sim.clearStaticCache(); const b = run([...boards].reverse(), [...joints].reverse())
    for (const [id, r] of a.results) assert.equal(sig(b.results.get(id)), sig(r), `${id}`)
    assert.deepEqual([b.critical, b.warning, b.unsupported, b.unsureCount], [a.critical, a.warning, a.unsupported, a.unsureCount])
  })
  test(`${name}: frühere Rechnungen ändern das Ergebnis nicht`, () => {
    sim.clearStaticCache(); const a = run(boards, joints)
    for (const kg of [0, 60, 5]) run(boards, joints, kg)
    run(FAELLE.pfosten.boards, FAELLE.pfosten.joints, 33)
    const b = run(boards, joints)
    for (const [id, r] of a.results) assert.equal(sig(b.results.get(id)), sig(r), `${id}`)
  })
  test(`${name}: Bilanz geht auf – hinein = Boden + verworfen + steckt fest`, () => {
    sim.clearStaticCache(); const { balance: b } = run(boards, joints)
    assert.ok(b.inN > 0)
    assert.ok(Math.abs(b.inN - b.floorN - b.droppedN - b.stuckN) < 0.05, JSON.stringify(b))
  })
}

for (const [name, { boards, joints }] of Object.entries(FAELLE)) {
  if (!joints.length) continue
  test(`${name}: A und B einer Verbindung tauschen ergibt dasselbe (Reihenfolge des Anklickens)`, () => {
    sim.clearStaticCache(); const a = run(boards, joints)
    sim.clearStaticCache(); const b = run(boards, joints.map((x) => ({ ...x, boardA: x.boardB, boardB: x.boardA })))
    for (const [id, r] of a.results) assert.equal(sig(b.results.get(id)), sig(r), `${id}`)
  })
}

test('A1: die Seiten tragen die Hälften und sind damit selbst unsicher (Folge des Kreises)', () => {
  sim.clearStaticCache(); const s = run(FAELLE.haelften.boards, FAELLE.haelften.joints)
  for (const id of ['links', 'rechts']) {
    const u = s.results.get(id).unsure ?? []
    assert.ok(u.some((x) => x.reason === 'folge' || x.reason === 'kreis'), `${id}: ${JSON.stringify(u)}`)
  }
  const a = s.results.get('hälfte A').unsure
  assert.ok(a.some((x) => x.role === 'gab') && a.some((x) => x.role === 'fehlt'), 'Richtung steht dabei')
})

test('A1, zwei lose Hälften: verworfene Last ist gemeldet, beide sind unsicher statt still ok', () => {
  sim.clearStaticCache(); const s = run(FAELLE.haelften.boards, FAELLE.haelften.joints)
  assert.ok(s.balance.droppedN > 0, 'Last im Kreis verworfen')
  for (const id of ['hälfte A', 'hälfte B']) {
    const u = s.results.get(id).unsure
    assert.ok(u && u.some((x) => x.reason === 'kreis' && x.kg > 0), `${id} ist unsicher`)
  }
  assert.ok(s.unsureCount >= 2)
})

test('ein Gerät auf dem Boden ohne eigene Bewertung gibt sein Gewicht an den Boden, nicht „steckt fest“', () => {
  // Zweitprüfung 23.11.: ein Geschirrspüler auf dem Boden stand in der Bilanz als „steckt fest“
  const geraet = bd('spüler', 0, 600, 0, 820, 0, 570, { materialId: 'stahl', weightKg: 45 })
  sim.clearStaticCache(); const s = run([...FAELLE.regal.boards, { ...geraet, position: { x: 2000, y: 0, z: 0 } }], [])
  assert.ok(s.balance.stuckN < 0.01, JSON.stringify(s.balance))
  assert.ok(Math.abs(s.balance.floorN - s.balance.inN) < 0.05)
})

test('Regal ohne Kreis: nichts verworfen, nichts unsicher, alles am Boden', () => {
  sim.clearStaticCache(); const s = run(FAELLE.regal.boards, FAELLE.regal.joints)
  assert.equal(s.balance.droppedN, 0)
  assert.equal(s.unsureCount, 0)
  assert.ok(Math.abs(s.balance.floorN - s.balance.inN) < 0.05)
})
