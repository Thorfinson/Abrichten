// Guards the assembly tree helpers (utils/assemblyTree.ts): loading must never
// produce a parent cycle, and paths/subtrees follow parentId.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeParents, subtreeIds, assemblyPath, ancestorIds } from '../../src/renderer/src/utils/assemblyTree.ts'

const asm = (id, parentId) => ({ id, name: id.toUpperCase(), parentId, visible: true, boards: [], joints: [] })
const parents = (list) => Object.fromEntries(list.map((a) => [a.id, a.parentId ?? null]))

test('sanitizeParents drops dangling, self and cyclic links but keeps the rest', () => {
  const out = sanitizeParents([
    asm('k'), asm('g', 'k'), asm('x', 'missing'), asm('s', 's'),
    asm('a', 'b'), asm('b', 'a'), asm('c', 'a'), { ...asm('n'), parentId: 42 }
  ])
  const p = parents(out)
  assert.equal(p.g, 'k')
  assert.equal(p.x, null)
  assert.equal(p.s, null)
  assert.equal(p.n, null)
  assert.equal([p.a, p.b].filter(Boolean).length, 1, 'one link of the a↔b cycle is cut')
  assert.equal(p.c, 'a', 'a group hanging off a cycle keeps its parent')
})

test('subtree, path and ancestors follow parentId', () => {
  const list = [asm('k'), asm('o', 'k'), asm('d', 'o'), asm('s', 'k'), asm('z')]
  assert.deepEqual([...subtreeIds(list, 'k')].sort(), ['d', 'k', 'o', 's'])
  assert.equal(assemblyPath(list, 'd'), 'K › O › D')
  assert.deepEqual(ancestorIds(list, 'd'), ['o', 'k'])
  assert.deepEqual(ancestorIds(list, 'z'), [])
})
