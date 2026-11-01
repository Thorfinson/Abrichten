// Guards the AI board import (services/sketch-parser.ts + action-parser.ts): model
// output goes through the same board validation as project files, numeric strings
// with a unit are coerced, and anything else drops the board with a reason.
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
const { parseSketchResponse } = await import('../../src/renderer/src/services/sketch-parser.ts')
const { extractBoardActions } = await import('../../src/renderer/src/services/action-parser.ts')
const { validateProject } = await import('../../src/renderer/src/utils/validateProject.ts')

const reply = (obj) => '```json\n' + JSON.stringify(obj) + '\n```'

test('numeric strings with an unambiguous unit are coerced to mm', () => {
  const { boards, skipped } = parseSketchResponse(reply({ name: 'Schrank', boards: [
    { name: 'Seite', width: '600mm', height: '72 cm', depth: '0.018 m', positionX: '100', rotationY: '90°' }
  ] }))
  assert.deepEqual(skipped, [])
  assert.equal(boards.length, 1)
  const [b] = boards
  assert.deepEqual([b.width, b.height, b.depth], [600, 720, 18])
  assert.deepEqual(b.position, { x: 100, y: 0, z: 0 })
  assert.deepEqual(b.rotation, { x: 0, y: 90, z: 0 })
  assert.equal(b.id, undefined)
})

test('boards with unusable values are dropped with a reason, the rest is kept', () => {
  // 1e999 is what JSON.parse turns into Infinity
  const text = '```json\n{"name":"X","boards":[' +
    '{"name":"ok","width":600,"height":400,"depth":18},' +
    '{"name":"links","width":600,"height":400,"depth":18,"positionX":"links"},' +
    '{"name":"huge","width":600,"height":400,"depth":18,"positionY":1e999},' +
    '{"name":"bad","width":"breit","height":400,"depth":18},' +
    '{"name":"far","width":600,"height":400,"depth":18,"positionZ":1e9},' +
    '"not a board"' +
    ']}\n```'
  const { boards, skipped } = parseSketchResponse(text)
  assert.deepEqual(boards.map((b) => b.name), ['ok'])
  assert.equal(skipped.length, 5)
  assert.match(skipped[0], /links/)
  assert.match(skipped[0], /positionX/)
  assert.match(skipped[1], /positionY/)
  assert.match(skipped[2], /width/)
  assert.match(skipped[3], /position/)
})

test('names and materials of any type are safe', () => {
  const { name, boards } = parseSketchResponse(reply({ name: { x: 1 }, type: 7, boards: [
    { name: { evil: true }, width: 600, height: 400, depth: 18, material: 42 },
    { name: 'Boden\r\n0\r\nLINE', width: 600, height: 400, depth: 18, material: 'Eiche' }
  ] }))
  assert.equal(name, 'Import')
  assert.equal(boards[0].name, 'Brett')
  assert.equal(boards[0].materialId, 'spanplatte')
  assert.equal(boards[1].name, 'Boden 0 LINE')
  assert.equal(boards[1].materialId, 'eiche')
})

test('every imported board survives a save/load round trip (autosave stays loadable)', () => {
  const { boards } = parseSketchResponse(reply({ boards: [
    { name: 'a', width: 1e6, height: 0, depth: -5 },
    { name: 'b', width: '600mm', height: 400, depth: 18, rotationX: 45 }
  ] }))
  const saved = JSON.parse(JSON.stringify({ assemblies: [{ id: 'A', boards: boards.map((b, i) => ({ ...b, id: `b${i}` })), joints: [] }] }))
  assert.doesNotThrow(() => validateProject(saved))
})

test('extractBoardActions passes the skipped boards on, also when none is usable', () => {
  const action = extractBoardActions('Hier:\n' + reply({ name: 'K', boards: [
    { name: 'ok', width: 600, height: 400, depth: 18 },
    { name: 'nope', width: 'abc', height: 400, depth: 18 }
  ] }))
  assert.equal(action.name, 'K')
  assert.equal(action.boards.length, 1)
  assert.equal(action.skipped.length, 1)
  // all boards unusable: no Apply button, but the reasons are shown instead of "no boards detected"
  const none = extractBoardActions(reply({ boards: [{ name: 'nope', width: 'abc', height: 1, depth: 1 }] }))
  assert.equal(none.boards.length, 0)
  assert.equal(none.skipped.length, 1)
})
