// Runs with the built-in runner: `npm run test:unit` (Node strips the .ts types natively).
// Guards that utils/projection.ts rotates boards exactly like the Three.js mesh does
// (Euler order 'XYZ'), so collision + dimension overlays match what is rendered.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  boardCorners3D, faceCentre, resizeFromFace
} from '../../src/renderer/src/utils/projection.ts'

const board = (rx, ry, rz) => ({
  id: 'b', name: 'b', width: 600, height: 950, depth: 25,
  position: { x: 226, y: -420, z: 287 }, rotation: { x: rx, y: ry, z: rz },
  materialId: 'spanplatte', color: '#fff'
})

function threeAabb(b) {
  const geo = new THREE.BoxGeometry(b.width, b.height, b.depth)
  const mesh = new THREE.Mesh(geo)
  mesh.position.set(b.position.x + b.width / 2, b.position.y + b.height / 2, b.position.z + b.depth / 2)
  mesh.rotation.set(THREE.MathUtils.degToRad(b.rotation.x), THREE.MathUtils.degToRad(b.rotation.y), THREE.MathUtils.degToRad(b.rotation.z))
  mesh.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(mesh)
}

function oursAabb(b) {
  const box = new THREE.Box3()
  for (const c of boardCorners3D(b)) box.expandByPoint(new THREE.Vector3(c.x, c.y, c.z))
  return box
}

for (const rot of [[0, 0, 0], [0, 90, 0], [-90, 0, 0], [90, 0, 90], [-90, 0, 90], [30, 45, 60], [-180, 0, 0]]) {
  test(`boardCorners3D matches Three.js for rotation (${rot})`, () => {
    const b = board(...rot)
    const a = threeAabb(b), o = oursAabb(b)
    for (const k of ['x', 'y', 'z']) {
      assert.ok(Math.abs(a.min[k] - o.min[k]) < 1e-6, `min.${k}: three=${a.min[k]} ours=${o.min[k]}`)
      assert.ok(Math.abs(a.max[k] - o.max[k]) < 1e-6, `max.${k}: three=${a.max[k]} ours=${o.max[k]}`)
    }
  })
}

// resizeFromFace (used by the resize handles): moving one face of a (rotated) board must
// leave the opposite face exactly where it was on every world axis, and move the dragged
// face by Δ. faceCentre must sit where Three.js renders that face.

/** The 8 world-space corners via the Three.js mesh transform, keyed by local sign "sx,sy,sz". */
function threeCorners(b) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.width, b.height, b.depth))
  mesh.position.set(b.position.x + b.width / 2, b.position.y + b.height / 2, b.position.z + b.depth / 2)
  mesh.rotation.set(THREE.MathUtils.degToRad(b.rotation.x), THREE.MathUtils.degToRad(b.rotation.y), THREE.MathUtils.degToRad(b.rotation.z))
  mesh.updateMatrixWorld(true)
  const out = {}
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    out[`${sx},${sy},${sz}`] = new THREE.Vector3(sx * b.width / 2, sy * b.height / 2, sz * b.depth / 2).applyMatrix4(mesh.matrixWorld)
  }
  return out
}

const LOCAL_AXIS = { width: 0, height: 1, depth: 2 }
const ROTATIONS = [[0, 0, 0], [0, 90, 0], [90, 0, 0], [0, 0, 90], [90, 0, 90], [-90, 0, 0], [30, 45, 60], [0, 180, 0]]

function checkResize(b, dim, sign, delta) {
  const position = resizeFromFace(b, dim, sign, b[dim] + delta)
  const before = threeCorners(b)
  const now = threeCorners({ ...b, [dim]: b[dim] + delta, position })
  const label = `${dim}/${sign}/${delta} rot(${Object.values(b.rotation)})`
  for (const [k, p] of Object.entries(before)) {
    const moved = now[k].distanceTo(p)
    if (Number(k.split(',')[LOCAL_AXIS[dim]]) === sign) {
      assert.ok(Math.abs(moved - Math.abs(delta)) < 1e-6, `${label}: dragged corner ${k} moved ${moved} instead of ${Math.abs(delta)}`)
    } else {
      assert.ok(moved < 1e-6, `${label}: anchored corner ${k} moved by ${moved}`)
    }
  }
}

for (const rot of ROTATIONS) {
  test(`resizeFromFace keeps the opposite face fixed, faceCentre matches Three.js: rotation (${rot})`, () => {
    const b = board(...rot)
    for (const dim of ['width', 'height', 'depth']) {
      for (const sign of [1, -1]) {
        checkResize(b, dim, sign, 40)
        checkResize(b, dim, sign, -12)

        const corners = Object.entries(threeCorners(b)).filter(([k]) => Number(k.split(',')[LOCAL_AXIS[dim]]) === sign)
        const mid = corners.reduce((s, [, p]) => s.add(p), new THREE.Vector3()).divideScalar(4)
        const c = faceCentre(b, dim, sign)
        assert.ok(mid.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) < 1e-6, `faceCentre ${dim}/${sign} rot(${rot})`)
      }
    }
  })
}

test('board rotated 90° about Y: growing its +x face keeps the z extent and the left edge', () => {
  const b = board(0, 90, 0)
  // after a 90° turn about Y the local depth axis points along world +x
  const position = resizeFromFace(b, 'depth', 1, b.depth + 40)
  const a = oursAabb(b)
  const z = oursAabb({ ...b, depth: b.depth + 40, position })
  assert.ok(Math.abs(a.min.z - z.min.z) < 1e-9 && Math.abs(a.max.z - z.max.z) < 1e-9, `z extent moved: ${a.min.z}..${a.max.z} → ${z.min.z}..${z.max.z}`)
  assert.ok(Math.abs(a.min.x - z.min.x) < 1e-9, 'left edge stays')
  assert.ok(Math.abs(z.max.x - a.max.x - 40) < 1e-9, 'right edge moves by 40')
})

test('resizeFromFace does not round fractional positions', () => {
  const b = { ...board(0, 0, 0), position: { x: 100.3, y: 0.25, z: -7.7 } }
  assert.deepEqual(resizeFromFace(b, 'width', 1, b.width + 40), { x: 100.3, y: 0.25, z: -7.7 })
  assert.deepEqual(resizeFromFace(b, 'width', -1, b.width + 40), { x: 60.3, y: 0.25, z: -7.7 })
})
