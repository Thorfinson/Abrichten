// Guards utils/boardFace.ts: one rule for thickness (smallest dimension) and face
// (the other two, in width/height/depth order), used by cost, edge banding, DXF,
// boring and nesting alike.
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
const { boardFace, faceAreaSqm, edgeBandingLengthMm } = await import('../../src/renderer/src/utils/boardFace.ts')
const { exportDxf } = await import('../../src/renderer/src/utils/dxf.ts')
const { systemBoringRows, inferBoringFromHardware } = await import('../../src/renderer/src/services/boring-calc.ts')
const { nestBoards } = await import('../../src/renderer/src/utils/nesting.ts')
const { HINGE_CUP_EDGE_MM, hingePositionsMm } = await import('../../src/renderer/src/data/hardware.ts')

const board = (w, h, d, extra = {}) => ({
  id: 'b', name: 'b', width: w, height: h, depth: d,
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff', ...extra
})

test('thickness is the smallest dimension, the face the other two in axis order', () => {
  assert.deepEqual(boardFace(board(18, 720, 300)), { thicknessAxis: 'width', thickness: 18, uAxis: 'height', u: 720, vAxis: 'depth', v: 300 })
  assert.deepEqual(boardFace(board(564, 18, 300)), { thicknessAxis: 'height', thickness: 18, uAxis: 'width', u: 564, vAxis: 'depth', v: 300 })
  assert.deepEqual(boardFace(board(564, 702, 8)), { thicknessAxis: 'depth', thickness: 8, uAxis: 'width', u: 564, vAxis: 'height', v: 702 })
})

test('the default carcass costs the same area that nesting cuts', () => {
  // KorpusPanel defaults: 600 × 720 × 570, 18 mm, grooved 6 mm back, one shelf
  const parts = [
    board(18, 720, 570), board(18, 720, 570),
    board(564, 18, 570), board(564, 18, 570), board(564, 18, 556),
    board(580, 700, 6)
  ].map((b, i) => ({ ...b, id: `p${i}` }))
  const cost = parts.reduce((s, b) => s + faceAreaSqm(b), 0)
  const nest = nestBoards(parts, 2800, 2070, 3, true)
  const placed = nest.groups.flatMap((g) => g.sheets.flatMap((s) => s.placed)).reduce((s, p) => s + p.w * p.h, 0) / 1e6
  assert.ok(Math.abs(cost - placed) < 1e-9, `cost ${cost} vs nesting ${placed}`)
  assert.ok(cost > 2, 'side panels count with their 720 × 570 face')
})

test('edge banding E1 of a side panel runs along its 720 mm height', () => {
  assert.equal(edgeBandingLengthMm(board(18, 720, 300, { edgeBanding: { e1: true } })), 720)
  // lying boards keep the old meaning: E1/E2 = width, E3/E4 = depth
  assert.equal(edgeBandingLengthMm(board(564, 18, 300, { edgeBanding: { e1: true, e3: true } })), 864)
})

test('DXF outline of a side panel is its 720 × 300 face', () => {
  const dxf = exportDxf([board(18, 720, 300)]).split('\n')
  const xs = [], ys = []
  for (let i = 0; i < dxf.length - 1; i += 2) {
    if (dxf[i] === '8' && dxf[i + 1] === 'OUTLINE' && dxf[i - 1] === 'VERTEX') {
      xs.push(Number(dxf[i + 3])); ys.push(Number(dxf[i + 5]))
    }
  }
  assert.equal(Math.max(...xs) - Math.min(...xs), 720)
  assert.equal(Math.max(...ys) - Math.min(...ys), 300)
})

test('32 mm system rows of a side panel stay on its 300 mm face', () => {
  const holes = systemBoringRows(board(18, 720, 300), { spacing: 32, startOffset: 37, sideInset: 37, diameter: 5, depth: 12 })
  assert.deepEqual([...new Set(holes.map((h) => h.x))].sort((a, b) => a - b), [37, 263])
  assert.ok(holes.every((h) => h.y >= 37 && h.y <= 720 - 37))
})

test('a spacing of 0 or a huge board cannot hang the row loop', () => {
  for (const spacing of [0, -5, NaN, 0.0001]) {
    const holes = systemBoringRows(board(18, 720, 300), { spacing, startOffset: 37, sideInset: 37, diameter: 5, depth: 12 })
    assert.ok(holes.length <= 2 * 1000, `spacing ${spacing} gave ${holes.length} holes`)
  }
  const tall = systemBoringRows(board(18, 1e9, 300), { spacing: 32, startOffset: 37, sideInset: 37, diameter: 5, depth: 12 })
  assert.ok(tall.length <= 2 * 1000)
})

test('hinge cups sit at the shared edge distance on the door face', () => {
  assert.ok(HINGE_CUP_EDGE_MM >= 21.5 && HINGE_CUP_EDGE_MM <= 23.5)
  const door = board(400, 700, 18, { hardware: [{ hardwareId: 'blum-clip-top-110', quantity: 2 }] })
  const bores = inferBoringFromHardware(door)
  assert.deepEqual(bores.map((b) => b.x), [HINGE_CUP_EDGE_MM, HINGE_CUP_EDGE_MM])
  assert.deepEqual(bores.map((b) => b.y), hingePositionsMm(700, 2))
})

test('runner holes: 37 mm from the front edge and on the 32 mm grid within the runner length', () => {
  const side = board(18, 720, 560, { hardware: [{ hardwareId: 'blum-tandem-500', quantity: 2 }] })
  const holes = inferBoringFromHardware(side).map((b) => [b.x, b.y])
  // 500 runner: 37 + 14·32 = 485; one row per runner from 37 above the bottom to 37 below the top
  assert.deepEqual(holes, [[37, 37], [485, 37], [37, 683], [485, 683]])
  const lots = board(18, 720, 560, { hardware: [{ hardwareId: 'blum-tandem-500', quantity: 1e9 }] })
  assert.ok(inferBoringFromHardware(lots).length <= 20, 'runner count is capped')
})

test('one margin rule for hinge positions; huge quantities are capped', () => {
  assert.deepEqual(hingePositionsMm(700, 2), [100, 600])
  assert.deepEqual(hingePositionsMm(700, 1), [350])
  assert.equal(hingePositionsMm(700, 0).length, 0)
  const door = board(400, 700, 18, { hardware: [{ hardwareId: 'blum-clip-top-110', quantity: 1e9 }] })
  assert.ok(inferBoringFromHardware(door).length <= 20)
})

test('whether shelf pins are planned is decided in one place (hasShelfPins) — statics and boring list alike', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join, relative } = await import('node:path')
  const { hasShelfPins } = await import('../../src/renderer/src/data/hardware.ts')
  assert.equal(hasShelfPins({ hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 4 }] }), true)
  assert.equal(hasShelfPins({ hardware: [{ hardwareId: 'shelf-pin-5mm', quantity: 0 }] }), false)
  assert.equal(hasShelfPins({ hardware: [{ hardwareId: 'kugelauszug-500', quantity: 1 }] }), false)
  assert.equal(hasShelfPins({ hardware: [{ hardwareId: 'eigen', quantity: 2 }] }, [{ id: 'eigen', category: 'shelfPins' }]), true)
  const SRC = new URL('../../src/renderer/src/', import.meta.url).pathname
  const files = async (d) => (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => e.isDirectory() ? files(join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(d, e.name)] : []))).flat()
  const offenders = []
  // any mention of the category outside the hardware module (and the panel's list of categories)
  const allowed = ['data/hardware.ts', 'components/panels/HardwarePanel.tsx']
  for (const f of await files(SRC)) if (!allowed.includes(relative(SRC, f)) && /['"`]shelfPins['"`]/.test(await readFile(f, 'utf8'))) offenders.push(relative(SRC, f))
  assert.deepEqual(offenders, [])
})
