// Runs with the built-in runner: `npm run test:unit` (Node strips the .ts types natively).
// Guards that utils/projection.ts rotates boards exactly like the Three.js mesh does
// (Euler order 'XYZ'), so collision + dimension overlays match what is rendered.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { boardCorners3D } from '../../src/renderer/src/utils/projection.ts'

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
