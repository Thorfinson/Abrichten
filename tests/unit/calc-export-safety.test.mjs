// Guards the export writers against injection: board names in DXF group code 1
// and CSV cells that spreadsheets would evaluate as formulas.
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
const { exportDxf } = await import('../../src/renderer/src/utils/dxf.ts')
const { csvCell } = await import('../../src/renderer/src/utils/textSafety.ts')

const board = (name) => ({
  id: 'b', name, width: 600, height: 18, depth: 400,
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff'
})

test('a board name cannot add DXF entities or end the file early', () => {
  const evil = 'Boden\n0\nLINE\n8\nOUTLINE\n10\n0\n20\n0\n11\n999\n21\n999\r\n0\nEOF\u0007'
  const lines = exportDxf([board(evil)]).split('\n')
  assert.equal(lines.filter((l) => l === 'EOF').length, 1)
  assert.equal(lines.at(-1), 'EOF')
  assert.ok(!lines.some((l) => l.includes('\r')))
  assert.ok(!lines.some((l) => /[\u0000-\u001f\u007f]/.test(l)))
  // the only entities on OUTLINE are the board outline polyline and its 4 vertices
  const onOutline = lines.filter((l, i) => l === 'OUTLINE' && lines[i - 1] === '8' && lines[i - 2] !== 'LAYER' && lines[i - 3] !== 'LAYER')
  assert.equal(onOutline.length, 5)
  // group codes and values still alternate: the label is one value line
  const text = lines.findIndex((l) => l.startsWith('Boden'))
  assert.equal(lines[text - 1], '1')
})

test('csvCell neutralises formula prefixes including leading tab and CR', () => {
  for (const s of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1']) {
    assert.ok(csvCell(s).startsWith(`"'`), `${JSON.stringify(s)} → ${csvCell(s)}`)
  }
  assert.equal(csvCell('Boden "A"'), '"Boden ""A"""')
  assert.equal(csvCell(-19), '-19')
})
