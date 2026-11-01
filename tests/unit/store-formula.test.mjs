// Guards the formula input (utils/formulaEval.ts): comma decimals, a leading '=',
// malformed numbers, nesting depth, and the identifier helpers used for rename/usage.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evalFormula, isFormula, isParamName, formulaParams, renameFormulaParam } from '../../src/renderer/src/utils/formulaEval.ts'

test('comma decimals are plain numbers, not formulas', () => {
  assert.equal(isFormula('1,5'), false)
  assert.equal(isFormula('-18,5'), false)
  assert.equal(isFormula('720'), false)
  assert.equal(isFormula('H+20'), true)
  assert.equal(evalFormula('H - 1,5', { H: 720 }), 718.5)
})

test('a leading "=" is accepted (the tooltip example)', () => {
  assert.equal(evalFormula('=H+20', { H: 700 }), 720)
  assert.equal(evalFormula(' = 2 * 9', {}), 18)
  assert.equal(isFormula('=720'), true)
  assert.equal(evalFormula('==H', { H: 1 }), null)
})

test('malformed numbers are rejected', () => {
  assert.equal(evalFormula('1.2.3', {}), null)
  assert.equal(evalFormula('1,2,3', {}), null)
  assert.equal(evalFormula('1.', {}), null)
  assert.equal(evalFormula('.', {}), null)
  assert.equal(evalFormula('.5 + 1', {}), 1.5)
})

test('deep nesting returns null instead of throwing', () => {
  const deep = '('.repeat(100_000) + '1' + ')'.repeat(100_000)
  assert.equal(evalFormula(deep, {}), null)
  assert.equal(evalFormula('((1 + 2)) * 3', {}), 9)
})

test('identifier helpers follow the UI rule and never build a RegExp from a name', () => {
  assert.equal(isParamName('SCHRANK_H'), true)
  assert.equal(isParamName('_x1'), true)
  assert.equal(isParamName('1x'), false)
  assert.equal(isParamName('(\\w|\\w)*!'), false)
  assert.equal(isParamName('constructor'), true)
  assert.deepEqual(formulaParams('H - 2*B + H'), ['H', 'B', 'H'])
  assert.equal(renameFormulaParam('H - HB + H*2', 'H', 'X'), 'X - HB + X*2')
  assert.equal(renameFormulaParam('B', '(', 'X'), 'B')
})
