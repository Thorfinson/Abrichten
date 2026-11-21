// Guards the part labels for the workshop: the assembly's short word plus the part's fixed
// number within it ("Herd 2"), stored on the board (utils/partLabel.ts, store/useProjectStore.ts,
// utils/validateProject.ts), and the same label in every list and print.
import { test, beforeEach } from 'node:test'
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
const mem = new Map([['abrichten-welcomed', '1']])
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
})
const {
  shortNameOf, defaultShortName, cleanShortName, partLabel, partLabels, partOrder, joinLabels,
  numberParts, renumberParts, doubledShortNames
} = await import('../../src/renderer/src/utils/partLabel.ts')
const { validateProject } = await import('../../src/renderer/src/utils/validateProject.ts')
const { useProjectStore } = await import('../../src/renderer/src/store/useProjectStore.ts')

const board = (id, extra = {}) => ({ id, name: id, width: 600, height: 18, depth: 560, position: { x: 0, y: 0, z: 0 }, materialId: 'spanplatte', ...extra })
const asm = (id, name, boards, extra = {}) => ({ id, name, visible: true, boards, joints: [], ...extra })

/** A small kitchen: a parent without parts, Herdfach with a drawer inside, Eckfach */
function kitchen() {
  return validateProject({
    id: 'mk', name: 'Musterküche',
    assemblies: [
      asm('k', 'Küche', []),
      asm('herd', 'Herdfach', [board('sw-l', { name: 'Seitenwand Herdfach links' }), board('sw-r'), board('boden')], { parentId: 'k' }),
      asm('schub', 'Schubkasten', [board('front'), board('sk-boden')], { parentId: 'herd' }),
      asm('eck', 'Eckfach', [board('e1'), board('e2')], { parentId: 'k' })
    ]
  })
}
const ui = () => useProjectStore.getState()
const labels = () => partLabels(ui().project.assemblies)
const boardsOf = (id) => ui().project.assemblies.find((a) => a.id === id).boards

beforeEach(() => ui().loadProject(kitchen()))

test('short word: set by the user, else the first word of the name', () => {
  assert.equal(defaultShortName('Herdfach'), 'Herdfach')
  assert.equal(defaultShortName('Fach 1'), 'Fach')
  assert.equal(defaultShortName('  Spülenfach mit Spülstein '), 'Spülenfach')
  assert.equal(shortNameOf({ name: 'Herdfach', shortName: 'Herd' }), 'Herd')
  assert.equal(shortNameOf({ name: 'Herdfach', shortName: '   ' }), 'Herdfach')
  assert.equal(cleanShortName('  Unter\nbau  '), 'Unter bau')
  assert.equal(cleanShortName('Unterkonstruktionsrahmen'), 'Unterkonstruktio')   // 16 characters
  assert.equal(partLabel({ name: 'Herdfach', shortName: 'Herd' }, { partNo: 2 }), 'Herd 2')
  assert.equal(partLabel({ name: 'Herdfach' }, {}), 'Herdfach –')
})

test('an older file: every part gets 1, 2, 3 … per assembly in list order', () => {
  assert.deepEqual(boardsOf('herd').map((b) => b.partNo), [1, 2, 3])
  assert.deepEqual(boardsOf('schub').map((b) => b.partNo), [1, 2])
  assert.equal(labels().get('sw-l'), 'Herdfach 1')
  assert.equal(labels().get('sk-boden'), 'Schubkasten 2')
  assert.equal(labels().get('e2'), 'Eckfach 2')
})

test('a saved number stays; missing and doubled ones get the next free number', () => {
  const p = validateProject({
    id: 'p', name: 'P',
    assemblies: [asm('a', 'Herdfach', [board('x', { partNo: 7 }), board('y'), board('z', { partNo: 7 }), board('w', { partNo: 2.5 })])]
  })
  assert.deepEqual(p.assemblies[0].boards.map((b) => b.partNo), [7, 8, 9, 10])
  // nothing to fix: the very same arrays come back
  assert.equal(numberParts(p.assemblies), p.assemblies)
})

test('new parts, copies and moved parts take the next number of their assembly', () => {
  const id = ui().addBoard('herd', { ...board('neu'), partNo: 1 })
  assert.equal(labels().get(id), 'Herdfach 4')

  const [copy] = ui().duplicateBoards('herd', ['sw-l'])
  assert.equal(labels().get(copy), 'Herdfach 5')
  assert.equal(labels().get('sw-l'), 'Herdfach 1')

  ui().moveBoardsToAssembly('herd', ['sw-r'], 'eck')
  assert.equal(labels().get('sw-r'), 'Eckfach 3')
  // the others keep theirs: numbers are fixed, a gap stays
  assert.deepEqual(boardsOf('herd').map((b) => labels().get(b.id)), ['Herdfach 1', 'Herdfach 3', 'Herdfach 4', 'Herdfach 5'])

  // one undo step each: the number came with the change
  useProjectStore.temporal.getState().undo()
  assert.equal(labels().get('sw-r'), 'Herdfach 2')
})

test('renumbering closes the gaps in one undo step', () => {
  ui().removeBoard('herd', 'sw-r')
  assert.deepEqual(boardsOf('herd').map((b) => b.partNo), [1, 3])
  ui().renumberParts()
  assert.deepEqual(boardsOf('herd').map((b) => b.partNo), [1, 2])
  useProjectStore.temporal.getState().undo()
  assert.deepEqual(boardsOf('herd').map((b) => b.partNo), [1, 3])
  assert.equal(renumberParts(kitchen().assemblies).length, 4)
})

test('setting a short word; a word another assembly uses is refused', () => {
  assert.equal(ui().setAssemblyShortName('herd', ' Herd '), true)
  assert.equal(labels().get('sw-l'), 'Herd 1')
  assert.equal(ui().setAssemblyShortName('schub', 'herd'), false)
  assert.equal(labels().get('front'), 'Schubkasten 1')
  assert.equal(ui().setAssemblyShortName('k', 'Herd'), false)
  // empty goes back to the first word of the name
  assert.equal(ui().setAssemblyShortName('herd', ''), true)
  assert.equal(labels().get('sw-l'), 'Herdfach 1')
  assert.equal(ui().project.assemblies.find((a) => a.id === 'herd').shortName, undefined)
})

test('short word and numbers are kept in the project file', () => {
  ui().setAssemblyShortName('schub', 'Schub')
  const reloaded = validateProject(JSON.parse(JSON.stringify(ui().project)))
  assert.equal(partLabels(reloaded.assemblies).get('sk-boden'), 'Schub 2')
  // a broken short word is dropped
  const p = validateProject({ id: 'p', name: 'P', assemblies: [asm('a', 'Herdfach', [board('x')], { shortName: 42 })] })
  assert.equal(p.assemblies[0].shortName, undefined)
})

test('doubled short words are found (names alike by default)', () => {
  const p = validateProject({
    id: 'p', name: 'P',
    assemblies: [asm('a', 'Schubkasten oben', [board('x')]), asm('b', 'Schubkasten unten', [board('y')]), asm('c', 'Leer', [])]
  })
  assert.deepEqual([...doubledShortNames(p.assemblies)], ['schubkasten'])
})

test('order: assemblies as the parts column lists them, then the number', () => {
  const order = partOrder(ui().project.assemblies)
  const ids = ['e2', 'front', 'sw-l', 'e1', 'boden', 'sk-boden'].sort((a, b) => order.get(a) - order.get(b))
  assert.deepEqual(ids, ['sw-l', 'boden', 'front', 'sk-boden', 'e1', 'e2'])
})

test('several labels in short', () => {
  assert.equal(joinLabels(['Herd 3', 'Herd 1', 'Herd 2', 'Herd 5']), 'Herd 1–3, 5')
  assert.equal(joinLabels(['Herd 1', 'Herd 2']), 'Herd 1, 2')
  assert.equal(joinLabels(['Herd 2', 'Eck 4', 'Herd 1']), 'Herd 1, 2 · Eck 4')
  assert.equal(joinLabels(['Fach 1 3', 'Fach 1 4']), 'Fach 1 3, 4')
  assert.equal(joinLabels(['Herd 2']), 'Herd 2')
  assert.equal(joinLabels([]), '')
})

test('nesting sheet: the label large, the name below as far as it fits, all escaped', async () => {
  const { nestingToSvg } = await import('../../src/renderer/src/utils/nesting.ts')
  const sheet = {
    width: 2800, height: 2070,
    placed: [
      { boardId: 'big', name: 'Seitenwand Herdfach links mit sehr langem Namen', x: 0, y: 0, w: 710, h: 540, rotated: false },
      { boardId: 'strip', name: 'Leiste', x: 800, y: 0, w: 1200, h: 40, rotated: true },
      { boardId: 'xss', name: '<script>alert(1)</script>', x: 0, y: 600, w: 600, h: 600, rotated: false }
    ]
  }
  const labels = new Map([['big', 'Herd 1'], ['strip', 'Unterbau 12'], ['xss', '<b>']])
  const svg = nestingToSvg(sheet, 0.12, labels)
  assert.match(svg, /font-weight="bold"[^>]*>Herd 1<\/text>/)
  assert.match(svg, />Seitenwand Herdfach links mit sehr…<\/text>|>Seitenwand Herdfach[^<]*…<\/text>/)
  // a strip too low for two lines: only the label, turned mark included
  assert.match(svg, />Unterbau 12 ↺<\/text>/)
  assert.ok(!svg.includes('>Leiste<'))
  assert.ok(!svg.includes('<script>') && !svg.includes('<b>'))
  // without labels the sheet is drawn as before
  assert.match(nestingToSvg(sheet, 0.12), />Seitenwand Herdfac<\/text>/)
})

test('DXF: the label in front of the name', async () => {
  const { exportDxf } = await import('../../src/renderer/src/utils/dxf.ts')
  const b = board('sw-l', { name: 'Seitenwand', width: 19, height: 710, depth: 540 })
  assert.match(exportDxf([b], new Map([['sw-l', 'Herd 1']])), /Herd 1 {2}Seitenwand {2}710x540x19mm/)
  assert.match(exportDxf([b]), /\nSeitenwand {2}710x540x19mm/)
})
