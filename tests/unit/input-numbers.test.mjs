// Prüffälle mit bekannter Antwort: Eine Zahl bleibt, wie der Mensch sie eingegeben hat.
// Befunde 23.11.2026 (Review Geometrie, Befund 1–3): Positionsfeld ignorierte das Komma und rundete auf ganze mm,
// „1.200“ wurde 1,2 mm, ein Klick auf den 3D-Griff rundete alle drei Richtungen, Maßlinien zeigten 6,5 mm als „7 mm“.
// Wahrheit: die Eingabe selbst. Eine Regel für alle Felder (utils/units.ts parseNumber), ein Wächter für neue Felder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const units = await import('../../src/renderer/src/utils/units.ts')
const release = await import('../../src/renderer/src/utils/handleRelease.ts')

test('parseNumber liest, was ein deutscher oder englischer Mensch meint', () => {
  const cases = {
    '860,3': 860.3, '1116.5': 1116.5, '212.5': 212.5, '6,5': 6.5, '1.5': 1.5, '1.50': 1.5, '10.25': 10.25,
    '1.234,5': 1234.5, '1,234.5': 1234.5, '1.234.567': 1234567, '0.125': 0.125, '0,125': 0.125,
    '-20': -20, '−20': -20, ' 18 ': 18, '1 200': 1200, '1 200': 1200, '12 mm': 12, '12mm': 12, '0': 0,
  }
  for (const [text, want] of Object.entries(cases)) assert.equal(units.parseNumber(text), want, `„${text}“`)
  for (const bad of ['', '  ', 'abc', '12abc', '1,2,3', '1.2.3', '=H+20', '1e3', '--1', ',', '.'])
    assert.equal(units.parseNumber(bad), null, `„${bad}“ ist keine Zahl`)
  // mehrdeutig, nie raten (Zweitprüfung 23.11.): ein Trennzeichen mit genau drei Ziffern danach
  for (const amb of ['1.200', '12.000', '1.125', '212.500', '1,000', '12,125'])
    assert.equal(units.parseNumber(amb), null, `„${amb}“ ist mehrdeutig und wird abgelehnt`)
})

test('parseInput nutzt dieselbe Regel und rechnet die Einheit um', () => {
  assert.equal(units.parseInput('1.200', 'mm'), null)
  assert.equal(units.parseInput('1200', 'mm'), 1200)
  assert.equal(units.parseInput('860,3', 'mm'), 860.3)
  assert.ok(Math.abs(units.parseInput('86,03', 'cm') - 860.3) < 1e-9)
  assert.equal(units.parseInput('12abc', 'mm'), null)
})

test('Maße in mm werden mit Zehnteln angezeigt, ganze Zahlen ohne Komma', () => {
  assert.equal(units.formatValue(6.5, 'mm', 'de'), '6,5 mm')
  assert.equal(units.formatValue(0.4, 'mm', 'de'), '0,4 mm')
  assert.equal(units.formatValue(508.6, 'mm', 'de'), '508,6 mm')
  assert.equal(units.formatValue(7, 'mm', 'de'), '7 mm')
  assert.equal(units.formatValue(6.5, 'mm', 'en'), '6.5 mm')
  assert.equal(units.formatValue(1200, 'mm', 'de'), '1.200 mm')
  assert.equal(units.formatValue(-0.04, 'mm', 'de'), '0 mm', 'kein „-0 mm“')
  assert.equal(units.numberFieldValue(''), null, 'leeres Browser-Zahlenfeld ist keine 0')
  assert.equal(units.numberFieldValue('12.125'), 12.125, 'Browser liefert Punkt-Dezimal')
})

test('Griff loslassen: gerundet wird die gezogene Strecke, nie die Lage', () => {
  const start = { x: 0, y: 136.5, z: 1116.5 }
  assert.deepEqual(release.releaseMove(start, { x: 0, y: 0, z: 0 }, null), start, 'bloßer Klick ändert nichts')
  assert.deepEqual(release.releaseMove(start, { x: 0, y: 32.3, z: 1e-12 }, null), { x: 0, y: 168.5, z: 1116.5 }, 'halber mm bleibt')
  assert.deepEqual(release.releaseMove(start, { x: 0.4, y: 0, z: 0 }, null), start, 'Zittern unter 0,5 mm ändert nichts')
  assert.deepEqual(release.releaseMove(start, { x: 0, y: 32, z: 0 }, 10), { x: 0, y: 170, z: 1116.5 }, 'mit Raster rastet die bewegte Achse ein')
  const dims = { width: 600, height: 710, depth: 6.5 }
  assert.deepEqual(release.releaseScale(dims, { x: 1, y: 1, z: 1 }), dims, 'Klick auf den Größen-Griff ändert nichts')
  assert.deepEqual(release.releaseScale(dims, { x: 1.1, y: 1, z: 1 }), { width: 660, height: 710, depth: 6.5 })
  assert.deepEqual(release.releaseScale(dims, { x: 1, y: 1, z: 1.00001 }), dims, 'Zittern am Größen-Griff ändert 6,5 nicht')
  assert.deepEqual(release.releaseRotate({ x: 0, y: 30.5, z: 0 }, { x: 0, y: 30.5, z: 0 }, 'y'), { x: 0, y: 30.5, z: 0 })
  assert.deepEqual(release.releaseRotate({ x: 0, y: 30.5, z: 0 }, { x: 0, y: 44.7, z: 1e-9 }, 'y'), { x: 0, y: 44.5, z: 0 }, 'gedrehte Achse: ganze Grad gedreht')
  // die 3D-Bibliothek schreibt dieselbe Lage mit anderen Winkeln: die nicht gedrehte Achse bleibt genau
  assert.deepEqual(release.releaseRotate({ x: 0, y: 200.5, z: 0 }, { x: -170, y: -20.5, z: -180 }, 'x'), { x: -170, y: -20.5, z: -180 })
})

// Wächter: Eingabefelder lesen Zahlen nur über parseNumber (Textfeld) oder numberFieldValue (Browser-Zahlenfeld).
// Jede bekannte Ausnahme steht hier mit Grund und gilt nur für Zeilen, auf die ihr Muster passt.
const AUSNAHMEN = {
  'components/panels/BoringPanel.tsx': [/Number\(e\.target\.value\)/, 'Browser-Zahlenfeld (type=number); leer ergibt 0, offen'],
  'components/panels/DrawerCalcPanel.tsx': [/setSlideLength\(Number\(e\.target\.value\)\)/, 'Auswahlliste (select) der Schienenlänge'],
  'components/panels/TolerancePanel.tsx': [/Number\(e\.target\.value\)/, 'Browser-Zahlenfeld (type=number); offen'],
  'components/panels/HingeCalcPanel.tsx': [/Number\(e\.target\.value\)/, 'Rechner-Eingaben type=number, nicht im Projekt; offen'],
  'components/panels/NestingPanel.tsx': [/Number\(e\.target\.value\)/, 'Browser-Zahlenfeld (type=number); leer ergibt 0, offen'],
  'components/panels/BarCutPlan.tsx': [/Number\(e\.target\.value\)/, 'Browser-Zahlenfeld (type=number); offen'],
  'components/layout/StatusBar.tsx': [/setSnapSize\(Number\(e\.target\.value\)\)/, 'Auswahl der Rasterweite (select)'],
  'components/panels/MaterialsPanel.tsx': [/parseFloat\(s\.trim\(\)\)/, 'Liste „18, 22, 25“ ist kommagetrennt; Dezimalkomma dort mehrdeutig. Trennzeichen entscheidet der Eigentümer'],
}
// Die Textregel an einem Browser-Zahlenfeld liest „12.125“ als 12125 (Zweitprüfung 23.11.): nur geprüfte Dateien haben beides
const BEIDES_GEPRUEFT = { 'components/panels/HardwarePanel.tsx': 'Spaltbereich ist ein Textfeld (parseNumber), Bohrung und Preis sind Zahlenfelder (numberFieldValue)' }
test('Wächter: kein Eingabefeld liest Zahlen an parseNumber vorbei', async () => {
  const root = new URL('../../src/renderer/src/components/', import.meta.url).pathname
  const files = []
  const walk = async (d) => { for (const e of await readdir(d, { withFileTypes: true })) e.isDirectory() ? await walk(join(d, e.name)) : /\.tsx?$/.test(e.name) && files.push(join(d, e.name)) }
  await walk(root)
  const funde = []
  for (const f of files) {
    const rel = 'components/' + relative(root, f)
    const text = await readFile(f, 'utf8')
    text.split('\n').forEach((l, i) => {
      if (!/\bparseFloat\s*\(|\bparseInt\s*\(|\bNumber\s*\((?!\.)|\+\s*e\.target\.value/.test(l)) return
      if (AUSNAHMEN[rel] && AUSNAHMEN[rel][0].test(l)) return
      funde.push(`${rel}:${i + 1}: ${l.trim().slice(0, 90)}`)
    })
    if (/\bparseNumber\(/.test(text) && /type="number"/.test(text) && !BEIDES_GEPRUEFT[rel]) funde.push(`${rel}: parseNumber in einer Datei mit Browser-Zahlenfeldern – numberFieldValue?`)
  }
  assert.deepEqual(funde, [], 'Zahlen aus Eingaben bitte mit parseNumber lesen:\n' + funde.join('\n'))
})
