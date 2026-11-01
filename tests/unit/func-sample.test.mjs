// Guards the bundled sample project (assets/sample-project.json) and the drawer
// generator (utils/geometry.ts drawerBoxParts): no collisions, the carcass follows
// the parameters H/B/T, and generated drawer parts touch without overlapping.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx) } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  }
})
const { detectCollisions3D } = await import('../../src/renderer/src/utils/collision.ts')
const { drawerBoxParts } = await import('../../src/renderer/src/utils/geometry.ts')
const { withHinges } = await import('../../src/renderer/src/data/hardware.ts')
const { useProjectStore } = await import('../../src/renderer/src/store/useProjectStore.ts')

const sample = JSON.parse(await readFile(new URL('../../src/renderer/src/assets/sample-project.json', import.meta.url), 'utf8'))
const store = () => useProjectStore.getState()
const boards = () => store().project.assemblies.flatMap((a) => a.boards)
const byId = (id) => boards().find((b) => b.id === id)

test('the sample cabinet has no collisions', () => {
  store().loadProject(sample)
  const joints = store().project.assemblies.flatMap((a) => a.joints)
  assert.deepEqual(detectCollisions3D(boards(), joints), [])
})

test('the sample carcass uses the parameters: changing H resizes sides and back', () => {
  store().loadProject(sample)
  const users = boards().filter((b) => b.widthFormula || b.heightFormula || b.depthFormula)
  assert.ok(users.length >= 5, 'carcass parts carry formulas')
  store().setParameter('H', 800)
  assert.equal(byId('b-links').height, 800)
  assert.equal(byId('b-rechts').height, 800)
  assert.equal(byId('b-rueckwand').height, 764)
  store().setParameter('B', 500)
  assert.equal(byId('b-boden').width, 464)
  assert.equal(store().project.assemblies[0].boards.length, 6)
})

test('every sample part has a material, panels have grain and edge banding where it shows', () => {
  store().loadProject(sample)
  for (const b of boards()) assert.ok(b.materialId, b.id)
  assert.equal(byId('b-boden').grainDirection, 'width')
  assert.equal(byId('b-links').edgeBanding?.e1, true)
})

test('drawer box parts touch but do not overlap', () => {
  const parts = drawerBoxParts(475, 128, 500, { x: 1000, y: 0, z: 0 })
  assert.equal(parts.length, 5)
  const asBoards = parts.map((p, i) => ({
    id: p.key, name: p.key, width: p.width, height: p.height, depth: p.depth,
    position: p.position, rotation: { x: 0, y: 0, z: 0 }, materialId: 'multiplex-birke', color: '#fff'
  }))
  assert.deepEqual(detectCollisions3D(asBoards), [])
  // outer size is what was asked for
  const maxX = Math.max(...parts.map((p) => p.position.x + p.width))
  const maxZ = Math.max(...parts.map((p) => p.position.z + p.depth))
  assert.equal(maxX - 1000, 475)
  assert.equal(maxZ, 500)
  assert.equal(drawerBoxParts(30, 128, 500, { x: 0, y: 0, z: 0 }), null, 'too narrow for two walls')
})

test('furniture faces +z like the front view: back at z = 0, front towards +z', () => {
  // the front-view and 3D cameras look from +z; projects (e.g. kitchens) put the wall side at z = 0
  store().loadProject(sample)
  const back = byId('b-rueck') ?? boards().find((b) => /Rückwand/.test(b.name))
  assert.equal(back.position.z, 0, 'sample back panel at the wall side')
  const drawer = drawerBoxParts(475, 128, 500, { x: 0, y: 0, z: 0 })
  const z = (key) => drawer.find((p) => p.key === key).position.z
  assert.ok(z('front') > z('back'), 'drawer front towards +z')
})

test('withHinges replaces any hinge on the door and keeps other hardware', () => {
  const list = [{ hardwareId: 'blum-clip-top-110', quantity: 2 }, { hardwareId: 'griff-bar-128', quantity: 1 }]
  assert.deepEqual(withHinges(list, 'hettich-sensys-110', 3), [
    { hardwareId: 'griff-bar-128', quantity: 1 },
    { hardwareId: 'hettich-sensys-110', quantity: 3 }
  ])
  assert.deepEqual(withHinges(undefined, 'blum-clip-top-110', 99), [{ hardwareId: 'blum-clip-top-110', quantity: 10 }])
})
