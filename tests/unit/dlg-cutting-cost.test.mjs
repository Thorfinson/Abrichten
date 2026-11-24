// Guards the dialog data rules: the cutting list's length × width × thickness
// (utils/cuttingDims.ts, built on boardFace) and the cost panel's guide prices
// (data/defaultPrices.ts), which apply only where the project has no own price.
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
const { cuttingDims } = await import('../../src/renderer/src/utils/cuttingDims.ts')
const { DEFAULT_PRICES_PER_SQM, resolvePrice } = await import('../../src/renderer/src/data/defaultPrices.ts')
const { materials } = await import('../../src/renderer/src/data/materials.ts')
const { groupByRole, roleKey, isBoardRole } = await import('../../src/renderer/src/utils/boardRole.ts')
const { BOARD_ROLES } = await import('../../src/renderer/src/types/furniture.ts')

const dims = (width, height, depth, grainDirection) => ({ width, height, depth, grainDirection })
const lbd = (d) => [d.length, d.width, d.thickness]

test('a side panel is listed 720 × 300 × 18, not with its 18 mm thickness as width', () => {
  const side = cuttingDims(dims(18, 720, 300, 'height'))
  assert.deepEqual(lbd(side), [720, 300, 18])
  assert.equal(side.grain, 'along')
})

test('lying parts, backs and fronts: longer face side first, thickness last', () => {
  assert.deepEqual(lbd(cuttingDims(dims(564, 18, 300))), [564, 300, 18])  // shelf
  assert.deepEqual(lbd(cuttingDims(dims(564, 702, 8))), [702, 564, 8])   // back: height is the longer side
  assert.deepEqual(lbd(cuttingDims(dims(300, 300, 18))), [300, 300, 18]) // square face
})

test('grain is told relative to the length', () => {
  assert.equal(cuttingDims(dims(18, 720, 300, 'height')).grain, 'along')
  assert.equal(cuttingDims(dims(18, 720, 300, 'depth')).grain, 'across')
  // a door whose grain runs along its shorter side
  assert.equal(cuttingDims(dims(600, 400, 19, 'height')).grain, 'across')
  assert.equal(cuttingDims(dims(600, 400, 19, 'width')).grain, 'along')
  // no grain, or grain along the thickness: nothing to show
  assert.equal(cuttingDims(dims(18, 720, 300)).grain, null)
  assert.equal(cuttingDims(dims(18, 720, 300, 'width')).grain, null)
})

test('the same part modelled standing or lying gets the same cut size (grouping key)', () => {
  const standing = cuttingDims(dims(18, 720, 300, 'height'))
  const lying = cuttingDims(dims(720, 300, 18, 'width'))
  assert.deepEqual(lbd(standing), lbd(lying))
  assert.equal(standing.grain, lying.grain)
})

test('every built-in material has a plausible guide price, and nothing else does', () => {
  const ids = materials.map((m) => m.id).sort()
  assert.deepEqual(Object.keys(DEFAULT_PRICES_PER_SQM).sort(), ids)
  for (const id of ids) {
    const p = DEFAULT_PRICES_PER_SQM[id]
    assert.ok(Number.isFinite(p) && p > 0 && p < 2000, `${id}: ${p}`)
  }
  assert.ok(Object.isFrozen(DEFAULT_PRICES_PER_SQM))
})

test('a project price wins over the guide price; unknown materials have none', () => {
  assert.deepEqual(resolvePrice('spanplatte'), { price: DEFAULT_PRICES_PER_SQM.spanplatte, source: 'default' })
  assert.deepEqual(resolvePrice('spanplatte', { spanplatte: 9.5 }), { price: 9.5, source: 'project' })
  // an explicit 0 is the user's choice, not "no price"
  assert.deepEqual(resolvePrice('spanplatte', { spanplatte: 0 }), { price: 0, source: 'project' })
  assert.deepEqual(resolvePrice('my-own-board', { spanplatte: 9.5 }), { price: 0, source: 'none' })
  assert.deepEqual(resolvePrice('my-own-board', { 'my-own-board': 42 }), { price: 42, source: 'project' })
  // a broken value from a file falls back to the guide price
  assert.deepEqual(resolvePrice('mdf', { mdf: Number.NaN }), { price: DEFAULT_PRICES_PER_SQM.mdf, source: 'default' })
})

test('ids from project files cannot reach Object.prototype', () => {
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(resolvePrice(id), { price: 0, source: 'none' }, id)
    assert.deepEqual(resolvePrice(id, {}), { price: 0, source: 'none' }, id)
  }
})

test('by part role: groups in role order, parts without a role last, order kept within a group', () => {
  const parts = [
    { name: 'Front 1', role: 'visible' }, { name: 'Leiste' }, { name: 'Seite L', role: 'carcass' },
    { name: 'Rückwand', role: 'back' }, { name: 'Front 2', role: 'visible' }, { name: 'Seite R', role: 'carcass' },
    { name: 'Alt', role: 'from-a-newer-version' }
  ]
  const groups = groupByRole(parts, (p) => p.role)
  assert.deepEqual(groups.map((g) => g.role), ['visible', 'carcass', 'back', undefined])
  assert.deepEqual(groups.map((g) => g.items.map((p) => p.name)), [['Front 1', 'Front 2'], ['Seite L', 'Seite R'], ['Rückwand'], ['Leiste', 'Alt']])
  assert.deepEqual(groupByRole([], (p) => p.role), [])
  assert.equal(roleKey(undefined), 'role.none')
  assert.equal(roleKey('plinth'), 'role.plinth')
  assert.ok(BOARD_ROLES.every(isBoardRole))
  assert.ok(!isBoardRole('none') && !isBoardRole(undefined) && !isBoardRole('__proto__'))
})

test('every part role has a German and an English label and hint', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const lang of ['de', 'en']) {
    const { role } = JSON.parse(await readFile(new URL(`../../src/renderer/src/i18n/${lang}.json`, import.meta.url), 'utf8'))
    for (const r of BOARD_ROLES) {
      assert.ok(role[r], `${lang}: role.${r}`)
      assert.ok(role[`hint_${r}`], `${lang}: role.hint_${r}`)
    }
    assert.ok(role.none && role.label, `${lang}: role.none / role.label`)
  }
  const de = JSON.parse(await readFile(new URL('../../src/renderer/src/i18n/de.json', import.meta.url), 'utf8')).role
  assert.deepEqual(BOARD_ROLES.map((r) => de[r]), ['Sichtteil', 'Korpus', 'Rückwand', 'Unterkonstruktion', 'Schubkasten', 'Arbeitsplatte', 'Sockel', 'Einbaugerät'])
  assert.equal(de.none, 'ohne Bauteilart')
})
