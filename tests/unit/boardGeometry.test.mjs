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
const { notchedOutline, faceCutout, clampCutouts, cutoutProblem, numberedCutouts } = await import('../../src/renderer/src/utils/geometry.ts')
const { insideCutout, faceAxesInRoom, cutoutInRoom, placementOf, cutoutKind, storedPlacement, switchEdge } = await import('../../src/renderer/src/utils/cutoutPlace.ts')
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
  assert.equal(insideCutout(b, { minX: 1040, maxX: 1100, minY: 0, maxY: 18, minZ: 200, maxZ: 240 }), true)
  assert.equal(insideCutout(b, { minX: 1040, maxX: 1100, minY: 0, maxY: 18, minZ: 200, maxZ: 260 }), false)
})

// ── cutouts on standing boards, round holes, one reference system (utils/cutoutPlace) ──
// A right side wall (19 thick, 710 high, 540 deep, from 60 to 600 off the
// back wall, standing on 100) gets a notch 70 × 50 at its top back corner.
const sideWall = (cutouts = []) => ({
  id: 'w', name: 'Seitenwand', width: 19, height: 710, depth: 540,
  position: { x: 1700, y: 100, z: 60 }, rotation: { x: 0, y: 0, z: 0 },
  materialId: 'birke', color: '#fff', cutouts
})

test('a standing board: its face is height × depth, its edges are named in the room', () => {
  const { u, v } = faceAxesInRoom(sideWall())
  assert.deepEqual([u.dim, u.room, u.minEdge, u.maxEdge, u.length], ['height', 'y', 'bottom', 'top', 710])
  assert.deepEqual([v.dim, v.room, v.minEdge, v.maxEdge, v.length], ['depth', 'z', 'back', 'front', 540])
})

test('L2: 0 from the top, 0 from the back, 70 deep, 50 high — the room says height 760–810, 60–130 off the wall', () => {
  const w = sideWall()
  const stored = { id: 'L2', width: 50, depth: 70, ...storedPlacement({ width: 50 }, { uFrom: 'max', uDist: 0, vFrom: 'min', vDist: 0 }) }
  assert.deepEqual([stored.x, stored.z, stored.uFrom, stored.vFrom], [0, 0, 'max', 'min'], 'kept as measured: 0 from the top, 0 from the back')
  const cut = faceCutout(w, stored)
  assert.deepEqual([cut.x, cut.z], [660, 0], 'on the face from its min corner')
  const room = cutoutInRoom(w, cut)
  assert.deepEqual(room.y, [760, 810])
  assert.deepEqual(room.z, [60, 130])
  assert.deepEqual(room.x, [1700, 1719], 'through the whole thickness')
  assert.equal(cutoutKind(w, cut), 'notch')
  assert.deepEqual(placementOf(w, cut), { uFrom: 'max', uDist: 0, vFrom: 'min', vDist: 0 })
})

test('the mesh of a standing board shows its notch and keeps its size', () => {
  const geo = buildBoardGeometry(sideWall([{ id: 'L2', x: 660, z: 0, width: 50, depth: 70 }]))
  geo.computeBoundingBox()
  const size = geo.boundingBox.getSize(new (geo.boundingBox.min.constructor)())
  assert.deepEqual([size.x, size.y, size.z].map((n) => Math.round(n)), [19, 710, 540])
  const pos = geo.getAttribute('position')
  let corner = false   // the inner corner of the notch: 50 below the top, 70 in from the back
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - (355 - 50)) < 0.01 && Math.abs(pos.getZ(i) - (-270 + 70)) < 0.01) corner = true
  assert.ok(corner)
})

test('a round hole: on the face, wholly inside, drawn round', () => {
  const wall = { id: 'c', name: 'Trennwand C', width: 600, height: 710, depth: 6.5, position: { x: 0, y: 100, z: 1000 }, rotation: { x: 0, y: 0, z: 0 }, materialId: 'm', color: '#fff',
    cutouts: [{ id: 'L7', shape: 'circle', x: 20, z: 20, width: 60, depth: 60 }, { id: 'out', shape: 'circle', x: 580, z: 20, width: 60, depth: 60 }] }
  const { u, v } = faceAxesInRoom(wall)
  assert.deepEqual([u.dim, v.dim], ['width', 'height'])
  const geo = buildBoardGeometry(wall)
  const pos = geo.getAttribute('position')
  let onCircle = 0   // vertices 30 from the hole's centre (u 50, v 50 → centred: x −250, y −305)
  for (let i = 0; i < pos.count; i++) if (Math.abs(Math.hypot(pos.getX(i) + 250, pos.getY(i) + 305) - 30) < 0.01) onCircle++
  assert.ok(onCircle > 20, 'the hole is round')
  assert.equal(cutoutKind(wall, wall.cutouts[0]), 'round')
  assert.deepEqual(cutoutInRoom(wall, wall.cutouts[0]).y, [120, 180])
})

test('a turned board: the edges keep their room names', () => {
  const turned = { ...board([]), rotation: { x: 0, y: 90, z: 0 } }
  const { u, v } = faceAxesInRoom(turned)
  assert.equal(u.room, 'z')
  assert.equal(v.room, 'x')
  assert.notEqual(u.minEdge, u.maxEdge)
})

test('an overlap inside a standing notch is not a collision', () => {
  const w = sideWall([{ id: 'L2', x: 660, z: 0, width: 50, depth: 70 }])
  assert.equal(insideCutout(w, { minX: 1700, maxX: 1719, minY: 770, maxY: 800, minZ: 70, maxZ: 120 }), true)
  assert.equal(insideCutout(w, { minX: 1700, maxX: 1719, minY: 700, maxY: 800, minZ: 70, maxZ: 120 }), false)
})

// ── one source for cutouts ──────────────────────────────────────────────────────────
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
const SRC = new URL('../../src/renderer/src/', import.meta.url).pathname
async function sourceFiles(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await sourceFiles(p)); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

test('cutouts are read in one place (clampCutouts) — every consumer goes through it', async () => {
  // who may touch board.cutouts directly, and why
  const allowed = {
    'utils/geometry.ts': 'clampCutouts itself',
    'utils/validateProject.ts': 'checks a loaded file',
    'components/overlays/CutoutEditor.tsx': 'edits them',
    'components/overlays/FloatingPropertiesCard.tsx': 'counts them for the section title',
    'components/views3d/Board3D.tsx': 'rebuilds the mesh when they change',
    'services/static-fe.ts': 'its own input field, filled by static-sim from clampCutouts'
  }
  const offenders = []
  for (const file of await sourceFiles(SRC)) {
    const rel = relative(SRC, file)
    if (rel.startsWith('types/') || allowed[rel]) continue
    const text = (await readFile(file, 'utf8')).replace(/\/\/.*$/gm, '')
    // read as board.cutouts, or taken apart as { cutouts } = board
    if (/\.cutouts\b|\{[^}]*\bcutouts\b[^}]*\}\s*=/.test(text)) offenders.push(rel)
  }
  assert.deepEqual(offenders, [], 'read cutouts through clampCutouts / utils/cutoutPlace')
})

test('DXF: cutouts of standing boards are drawn, a round hole as a circle', async () => {
  const { exportDxf } = await import('../../src/renderer/src/utils/dxf.ts')
  const wall = sideWall([{ id: 'L2', x: 660, z: 0, width: 50, depth: 70 }, { id: 'r', shape: 'circle', x: 100, z: 100, width: 60, depth: 60 }])
  const dxf = exportDxf([wall])
  const lines = dxf.split('\n').map((l) => l.trim())
  const circle = lines.indexOf('CIRCLE')
  assert.ok(circle > 0, 'a CIRCLE entity')
  assert.equal(lines[circle + 2], 'CUTOUT')
  assert.equal(Number(lines[lines.indexOf('40', circle)  + 1]), 30, 'radius 30')
  assert.ok(lines.filter((l, i) => l === 'POLYLINE' && lines[i + 2] === 'CUTOUT').length === 1, 'the notch as a polyline')
})

test('drawings show a part as it stands: up is up, a lying part from above with the wall side on top', async () => {
  const { faceDrawing, cutoutOnSheet } = await import('../../src/renderer/src/utils/faceDrawing.ts')
  const wall = faceDrawing(sideWall())
  assert.deepEqual([wall.width, wall.height], [540, 710], 'the side wall stands')
  assert.deepEqual(wall.sides, { left: 'back', right: 'front', top: 'top', bottom: 'bottom' })
  assert.deepEqual(cutoutOnSheet(wall, { id: 'L2', x: 660, z: 0, width: 50, depth: 70 }), { x: 0, y: 0, w: 70, h: 50 }, 'L2 at the top back corner')
  const partition = faceDrawing({ ...sideWall(), width: 600, height: 710, depth: 6.5 })
  assert.deepEqual([partition.sides.top, partition.sides.bottom], ['top', 'bottom'], 'not upside down')
  assert.deepEqual(cutoutOnSheet(partition, { id: 'L7', shape: 'circle', x: 30, z: 30, width: 60, depth: 60 }), { x: 30, y: 620, w: 60, h: 60 }, 'the low hole drawn low')
  const shelf = faceDrawing(board([]))
  assert.deepEqual([shelf.sides.top, shelf.width, shelf.height], ['back', 1000, 600])
})

// ── found by the second review ──────────────────────────────────────────────────────
test('a cutout measured from the top stays there when the part gets taller', () => {
  const L2 = { id: 'L2', x: 0, z: 0, width: 50, depth: 70, uFrom: 'max', vFrom: 'min' }
  const tall = { ...sideWall(), height: 760 }
  assert.deepEqual(cutoutInRoom(tall, clampCutouts({ ...tall, cutouts: [L2] })[0]).y, [810, 860], '760 tall from 50: still 0 from the top')
  assert.deepEqual(placementOf(tall, clampCutouts({ ...tall, cutouts: [L2] })[0]), { uFrom: 'max', uDist: 0, vFrom: 'min', vDist: 0 })
})

test('a round hole is placed by its centre, as it is drilled', () => {
  const wall = { ...sideWall(), width: 600, height: 710, depth: 6.5 }
  const hole = { id: 'L7', shape: 'circle', width: 60, depth: 60, ...storedPlacement({ shape: 'circle', width: 60 }, { uFrom: 'min', uDist: 50, vFrom: 'min', vDist: 50 }) }
  assert.deepEqual([hole.x, hole.z], [20, 20])
  assert.deepEqual(placementOf(wall, faceCutout(wall, hole)), { uFrom: 'min', uDist: 50, vFrom: 'min', vDist: 50 }, 'centre 50 from the left, 50 from the bottom')
  // a bigger drill keeps the centre
  const bigger = { ...hole, width: 80, depth: 80, ...storedPlacement({ shape: 'circle', width: 80 }, placementOf(wall, faceCutout(wall, hole))) }
  assert.deepEqual(placementOf(wall, faceCutout(wall, bigger)), { uFrom: 'min', uDist: 50, vFrom: 'min', vDist: 50 })
})

test('measuring from the other edge does not move the cutout', () => {
  const w = sideWall()
  const raw = { id: 'L2', x: 0, z: 0, width: 50, depth: 70, uFrom: 'max', vFrom: 'min' }
  const p = switchEdge(w, raw, 'u')
  assert.deepEqual([p.uFrom, p.uDist], ['min', 660], '660 from the bottom')
  const moved = { ...raw, ...storedPlacement(raw, p) }
  const spot = (c) => { const f = faceCutout(w, c); return [f.x, f.z, f.width, f.depth] }
  assert.deepEqual(spot(moved), spot(raw), 'same place on the part')
  const round = { id: 'r', shape: 'circle', x: 100, z: 100, width: 60, depth: 60 }
  const q = switchEdge(w, round, 'v')
  assert.deepEqual([q.vFrom, q.vDist], ['max', 540 - 130], 'centre 410 from the front')
  assert.deepEqual(faceCutout(w, { ...round, ...storedPlacement(round, q) }).z, 100)
})

test('a cut across the whole part is not built, and says why', () => {
  const w = sideWall()
  const across = { id: 'x', x: 300, z: 0, width: 50, depth: 540 }
  assert.equal(cutoutProblem(w, across), 'splits')
  assert.equal(cutoutProblem(w, { id: 'o', x: 800, z: 0, width: 50, depth: 50 }), 'outside')
  assert.equal(cutoutProblem(w, { id: 'ok', x: 660, z: 0, width: 50, depth: 70 }), null)
  const past = { id: 'p', x: 680, z: 0, width: 50, depth: 70 }
  assert.equal(cutoutProblem(w, past), 'beyond', 'reaches past the top')
  assert.deepEqual(clampCutouts({ ...w, cutouts: [past] }).map((c) => [c.x, c.width]), [[680, 30]], 'built, cut back to the edge')
  const parts = { ...w, cutouts: [{ id: 'a', x: 660, z: 0, width: 50, depth: 70 }, across, { id: 'c', shape: 'circle', x: 100, z: 100, width: 60, depth: 60 }] }
  assert.deepEqual(numberedCutouts(parts).map((e) => e.n), [1, 3], 'numbers as in the editor: the third stays 3')
  const geo = buildBoardGeometry(parts)
  geo.computeBoundingBox()
  const size = geo.boundingBox.getSize(new (geo.boundingBox.min.constructor)())
  assert.deepEqual([size.x, size.y, size.z].map((n) => Math.round(n)), [19, 710, 540], 'the part keeps its whole size')
})

test('the mesh is centred on the whole board, whatever the cutouts take away', () => {
  const geo = buildBoardGeometry(sideWall([{ id: 'L2', x: 660, z: 0, width: 50, depth: 70 }, { id: 'L3', x: 0, z: 470, width: 50, depth: 70 }]))
  geo.computeBoundingBox()
  const { min, max } = geo.boundingBox
  assert.deepEqual([min.y, max.y, min.z, max.z].map((n) => Math.round(n)), [-355, 355, -270, 270])
})

test('a part not turned in 90° steps: no overlap is excused by its cutouts', () => {
  // a small box in the middle of the cutout's room box: inside it on a square part, but on
  // a part turned 30° that box is wider than the cutout, so it excuses nothing
  const middle = (b) => {
    const r = cutoutInRoom(b, clampCutouts(b)[0])
    const m = (a) => [(r[a][0] + r[a][1]) / 2 - 2, (r[a][0] + r[a][1]) / 2 + 2]
    return { minX: m('x')[0], maxX: m('x')[1], minY: m('y')[0], maxY: m('y')[1], minZ: m('z')[0], maxZ: m('z')[1] }
  }
  const square = sideWall([{ id: 'L2', x: 660, z: 0, width: 50, depth: 70 }])
  assert.equal(insideCutout(square, middle(square)), true)
  const w = { ...square, rotation: { x: 0, y: 30, z: 0 } }
  assert.equal(insideCutout(w, middle(w)), false)
})

test('edge banding E1–E4 sits on the same side in the drawing and in the picker', async () => {
  const { edgeSides, edgeSegment, faceDrawing } = await import('../../src/renderer/src/utils/faceDrawing.ts')
  // the side wall stands: u is its height (up the sheet), v its depth (across)
  assert.deepEqual(edgeSides(sideWall()), { e1: 'left', e2: 'right', e3: 'bottom', e4: 'top' })
  // a shelf lies: seen from above, the wall side at the top
  assert.deepEqual(edgeSides(board([])), { e1: 'top', e2: 'bottom', e3: 'left', e4: 'right' })
  // every side once, and where the drawing puts the segment
  for (const b of [sideWall(), board([]), { ...sideWall(), width: 600, height: 710, depth: 6.5 }, { ...board([]), rotation: { x: 0, y: 90, z: 0 } }]) {
    const sides = edgeSides(b)
    assert.equal(new Set(Object.values(sides)).size, 4)
    const d = faceDrawing(b)
    const r = d.rect(...edgeSegment(b, 'e1'))
    assert.equal(sides.e1 === 'top' ? r.y : sides.e1 === 'bottom' ? r.y - d.height : sides.e1 === 'left' ? r.x : r.x - d.width, 0)
  }
})

test('one rule for every picture of a part: the boring list lays it out as the shop drawing', async () => {
  const { faceDrawing } = await import('../../src/renderer/src/utils/faceDrawing.ts')
  const { systemBoringRows } = await import('../../src/renderer/src/services/boring-calc.ts')
  const opts = { spacing: 32, startOffset: 37, sideInset: 37, diameter: 5, depth: 12 }
  // a panel modelled lying and turned upright (90° about z) stands: drawn upright, the rows
  // run up its 710 mm height, 37 in from both sides of its 540 mm depth
  const turned = { ...board([]), width: 710, height: 18, depth: 540, rotation: { x: 0, y: 0, z: 90 } }
  const d = faceDrawing(turned)
  assert.deepEqual([d.width, d.height], [540, 710])
  const holes = systemBoringRows(turned, opts)
  assert.deepEqual([...new Set(holes.map((h) => h.x))], [37, 503])
  assert.equal(Math.max(...holes.map((h) => h.y)) <= 710 - 37, true)
  assert.equal(holes.length, 2 * (Math.floor((710 - 74) / 32) + 1))
  // the old rule (uprightFace, by dimension names only) is gone; no other place lays parts out
  const offenders = []
  for (const file of await sourceFiles(SRC)) if (/\buprightFace\b/.test(await readFile(file, 'utf8'))) offenders.push(relative(SRC, file))
  assert.deepEqual(offenders, [])
})

// ── several cutouts on one part (second review, 23.11.) ─────────────────────────────
test('cutouts that overlap or touch an earlier one are not built, and say which', async () => {
  const { cutoutProblems } = await import('../../src/renderer/src/utils/geometry.ts')
  const same = board([{ id: 'a', x: 220, z: 55, width: 560, depth: 490 }, { id: 'b', x: 220, z: 55, width: 560, depth: 490 }])
  assert.deepEqual(cutoutProblems(same).map((p) => [p.problem, p.other ?? null]), [[null, null], ['overlaps', 1]])
  assert.equal(numberedCutouts(same).length, 1)
  const top = topFace(buildBoardGeometry(same))
  assert.ok(Math.abs(top.area - (1000 * 600 - 560 * 490)) < 1, `one hole in the mesh, not none (${top.area})`)
  // two notches that only together would cut the part in two: they touch
  const split = board([{ id: 'a', x: 0, z: 200, width: 600, depth: 100 }, { id: 'b', x: 600, z: 200, width: 400, depth: 100 }])
  assert.equal(cutoutProblems(split)[1].problem, 'overlaps')
  assert.ok(Math.abs(topFace(buildBoardGeometry(split)).area - (600000 - 60000)) < 1, 'the part stays whole')
  // a round hole over a rectangle, and two circles
  assert.equal(cutoutProblems(board([{ id: 'r', x: 100, z: 100, width: 100, depth: 100 }, { id: 'c', shape: 'circle', x: 180, z: 120, width: 60, depth: 60 }]))[1].problem, 'overlaps')
  assert.equal(cutoutProblems(board([{ id: 'c1', shape: 'circle', x: 100, z: 100, width: 60, depth: 60 }, { id: 'c2', shape: 'circle', x: 150, z: 100, width: 60, depth: 60 }]))[1].problem, 'overlaps')
  // apart by a hand's width: both built
  assert.deepEqual(cutoutProblems(board([{ id: 'a', x: 100, z: 100, width: 100, depth: 100 }, { id: 'b', x: 300, z: 100, width: 100, depth: 100 }])).map((p) => p.problem), [null, null])
})

test('a part turned over is still drawn up the right way, its cutouts where they are in the room', async () => {
  const { faceDrawing, cutoutOnSheet, edgeSides } = await import('../../src/renderer/src/utils/faceDrawing.ts')
  // the side wall turned 180° about its depth: its face's "max height" edge is now at the bottom
  const L2 = { id: 'L2', x: 660, z: 0, width: 50, depth: 70 }
  const turned = { ...sideWall([L2]), rotation: { x: 0, y: 0, z: 180 } }
  const d = faceDrawing(turned)
  assert.deepEqual([d.width, d.height, d.sides.top, d.sides.bottom], [540, 710, 'top', 'bottom'], 'upright, top is top')
  const room = cutoutInRoom(turned, clampCutouts(turned)[0])
  const onSheet = cutoutOnSheet(d, clampCutouts(turned)[0])
  // the sheet's y runs down from the top: a cutout low in the room is low on the sheet
  const roomTop = turned.position.y + turned.height
  assert.ok(Math.abs((roomTop - room.y[1]) - onSheet.y) < 1e-6, `sheet y ${onSheet.y} = ${roomTop - room.y[1]} from the top`)
  // a lying board stood up as a back panel (turned 90° about x): drawn upright, not lying
  const back = faceDrawing({ ...board([]), rotation: { x: 90, y: 0, z: 0 } })
  assert.deepEqual([back.sides.top, back.sides.bottom, back.sides.left, back.sides.right], ['top', 'bottom', 'left', 'right'])
  // a lying board flipped over: still seen from above, the back at the top
  const flipped = faceDrawing({ ...board([]), rotation: { x: 180, y: 0, z: 0 } })
  assert.deepEqual([flipped.sides.top, flipped.sides.left], ['back', 'left'])
  assert.equal(new Set(Object.values(edgeSides(turned))).size, 4)
})
