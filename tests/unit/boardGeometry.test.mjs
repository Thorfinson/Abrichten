// Guards cutout rendering (utils/boardGeometry.ts + utils/geometry.ts): notches at the
// edge cut the outline, and cutout z is measured from the board's min-z face.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// the app imports siblings without extension (Vite style); let Node try "<spec>.ts"
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const { notchedOutline, insideCutout } = await import('../../src/renderer/src/utils/geometry.ts')
const { buildBoardGeometry } = await import('../../src/renderer/src/utils/boardGeometry.ts')

const board = (cutouts) => ({
  id: 'b', name: 'b', width: 1000, height: 18, depth: 600,
  position: { x: 100, y: 0, z: 200 }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'spanplatte', color: '#fff', cutouts
})

/** Area and area-weighted centre of the upward-facing triangles (the top face). */
function topFace(geo) {
  const p = geo.toNonIndexed().attributes.position
  let area = 0, cx = 0, cz = 0
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)])
    if (Math.min(a[1], b[1], c[1]) < 8.99) continue   // keep only triangles on y = +9
    const A = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2
    area += A
    cx += A * (a[0] + b[0] + c[0]) / 3
    cz += A * (a[2] + b[2] + c[2]) / 3
  }
  return { area, cx: cx / area, cz: cz / area }
}

test('two corner notches at the far end shape the outline', () => {
  const out = notchedOutline(1000, 600, [
    { id: 'n1', x: 940, z: 0, width: 60, depth: 40 },
    { id: 'n2', x: 940, z: 560, width: 60, depth: 40 }
  ])
  assert.equal(out.length, 8)
  const area = out.reduce((s, [x, z], i) => { const [x2, z2] = out[(i + 1) % out.length]; return s + x * z2 - x2 * z }, 0) / 2
  assert.equal(Math.abs(area), 1000 * 600 - 2 * 60 * 40)
})

test('notched board mesh leaves the notch empty and keeps cutout z on the min-z side', () => {
  const top = topFace(buildBoardGeometry(board([{ id: 'n', x: 0, z: 0, width: 200, depth: 300 }])))
  assert.ok(Math.abs(top.area - (1000 * 600 - 200 * 300)) < 1e-6)
  // the notch sits at min-x / min-z, so the remaining area's centre moves to +x and +z
  assert.ok(top.cx > 0 && top.cz > 0, `centre ${top.cx}/${top.cz}`)
})

test('an overlap inside a notch is not a collision', () => {
  const b = board([{ id: 'n', x: 940, z: 0, width: 60, depth: 40 }])
  assert.equal(insideCutout(b, { minX: 1040, maxX: 1100, minZ: 200, maxZ: 240 }), true)
  assert.equal(insideCutout(b, { minX: 1040, maxX: 1100, minZ: 200, maxZ: 260 }), false)
})
