// Guards the keyboard shortcut helpers (utils/shortcutKeys.ts): ⌘ is Ctrl on a Mac
// but the Windows key elsewhere is not, Option+digit / Option+G are found by the
// physical key, and labels read ⌘ / ⌥ on macOS and Ctrl / Alt elsewhere.
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

const { isCmdKey, noCmdKey, keyName, digitOf, isLetterKey, keyCombo } =
  await import('../../src/renderer/src/utils/shortcutKeys.ts')

const key = (over = {}) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, ...over })

test('Ctrl counts everywhere, ⌘ only on macOS', () => {
  assert.ok(isCmdKey(key({ ctrlKey: true }), true))
  assert.ok(isCmdKey(key({ ctrlKey: true }), false))
  assert.ok(isCmdKey(key({ metaKey: true }), true), '⌘ on a Mac')
  assert.ok(!isCmdKey(key({ metaKey: true }), false), 'the Windows key is not Ctrl')
  assert.ok(!isCmdKey(key({ altKey: true }), true))
})

test('a plain-letter shortcut needs neither Ctrl nor ⌘', () => {
  assert.ok(noCmdKey(key()))
  assert.ok(noCmdKey(key({ altKey: true })))
  assert.ok(!noCmdKey(key({ ctrlKey: true })))
  assert.ok(!noCmdKey(key({ metaKey: true })))
})

test('letters compare in lower case, key names stay as they are', () => {
  assert.equal(keyName(key({ key: 'Z' })), 'z', '⇧ or Caps Lock')
  assert.equal(keyName(key({ key: 's' })), 's')
  assert.equal(keyName(key({ key: 'ArrowLeft' })), 'ArrowLeft')
  assert.equal(keyName(key({ key: 'Escape' })), 'Escape')
})

test('Option+digit and Option+G go by the physical key', () => {
  assert.equal(digitOf(key({ key: '¡', code: 'Digit1' })), '1', '⌥1 on a Mac')
  assert.equal(digitOf(key({ key: '¢', code: 'Digit4' })), '4')
  assert.equal(digitOf(key({ key: '1', code: 'Numpad1' })), '1')
  assert.equal(digitOf(key({ key: 'q', code: 'KeyQ' })), null)
  assert.ok(isLetterKey(key({ key: '©', code: 'KeyG' }), 'g'), '⌥G on a Mac')
  assert.ok(isLetterKey(key({ key: 'G', code: 'KeyG' }), 'g'))
  assert.ok(!isLetterKey(key({ key: 'h', code: 'KeyH' }), 'g'))
})

test('labels: ⌘ / ⌥ / ⇧ in macOS order, Ctrl+Alt+⇧ elsewhere', () => {
  assert.equal(keyCombo('S', ['cmd'], true), '⌘S')
  assert.equal(keyCombo('S', ['cmd'], false), 'Ctrl+S')
  assert.equal(keyCombo('Z', ['cmd', 'shift'], true), '⇧⌘Z')
  assert.equal(keyCombo('Z', ['shift', 'cmd'], false), 'Ctrl+⇧+Z')
  assert.equal(keyCombo('1', ['alt'], true), '⌥1')
  assert.equal(keyCombo('G', ['alt'], false), 'Alt+G')
  assert.equal(keyCombo('F'), 'F')
})
