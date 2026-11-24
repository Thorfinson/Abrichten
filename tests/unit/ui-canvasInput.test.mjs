// Guards mouse-vs-trackpad handling of the canvas (utils/canvasInput.ts): a mouse
// wheel keeps zooming, two-finger scroll pans, a pinch zooms, ⌥ orbits in 3D,
// and a gesture keeps what it started as through its momentum.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WheelClassifier, looksLikeMouseWheel, zoomFactor, wheelPixels, cameraDragFor, GESTURE_GAP_MS
} from '../../src/renderer/src/utils/canvasInput.ts'

const wheel = (over = {}) => ({
  deltaX: 0, deltaY: 0, deltaMode: 0,
  ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  timeStamp: 0, ...over
})

test('mouse wheel notches are recognised on every platform', () => {
  assert.ok(looksLikeMouseWheel(wheel({ deltaY: 100 })), 'Windows notch')
  assert.ok(looksLikeMouseWheel(wheel({ deltaY: -120 })), 'e2e / Windows hi-dpi notch')
  assert.ok(looksLikeMouseWheel(wheel({ deltaY: 53.333 })), 'GTK notch')
  assert.ok(looksLikeMouseWheel(wheel({ deltaY: 4.000244140625 })), 'macOS Chromium notch')
  assert.ok(looksLikeMouseWheel(wheel({ deltaY: -12.000732421875 })), 'accelerated macOS notch')
  assert.ok(looksLikeMouseWheel(wheel({ deltaY: 3, deltaMode: 1 })), 'line mode')
  assert.ok(looksLikeMouseWheel(wheel({ deltaX: 4.000244140625, shiftKey: true })), 'shift turns a notch horizontal')
})

test('two-finger scroll deltas are not taken for a wheel', () => {
  assert.ok(!looksLikeMouseWheel(wheel({ deltaY: 3 })))
  assert.ok(!looksLikeMouseWheel(wheel({ deltaY: 4 })), 'an even 4 px is not the macOS notch')
  assert.ok(!looksLikeMouseWheel(wheel({ deltaY: 1.5, deltaX: -0.5 })))
  assert.ok(!looksLikeMouseWheel(wheel({ deltaX: 120, deltaY: 120 })), 'a wheel scrolls one axis')
})

test('auto: wheel zooms as before, trackpad pans, pinch zooms, ⌥ orbits in 3D only', () => {
  const c = new WheelClassifier()
  assert.equal(c.classify(wheel({ deltaY: 120, timeStamp: 0 }), 'auto', 'front'), 'wheel')
  assert.equal(c.classify(wheel({ deltaY: 6, timeStamp: 1000 }), 'auto', 'front'), 'pan')
  assert.equal(c.classify(wheel({ deltaY: -3, ctrlKey: true, timeStamp: 2000 }), 'auto', 'front'), 'zoom')
  assert.equal(c.classify(wheel({ deltaY: 100, ctrlKey: true, timeStamp: 3000 }), 'auto', 'front'), 'wheel', 'Ctrl + wheel notch')
  assert.equal(c.classify(wheel({ deltaX: 5, altKey: true, timeStamp: 4000 }), 'auto', '3d'), 'orbit')
  assert.equal(c.classify(wheel({ deltaX: 5, altKey: true, timeStamp: 5000 }), 'auto', 'top'), 'pan')
  assert.equal(c.classify(wheel({ deltaY: 5, metaKey: true, timeStamp: 6000 }), 'auto', '3d'), 'zoom')
})

test('a trackpad gesture keeps its kind through momentum and a released ⌥', () => {
  const c = new WheelClassifier()
  let t = 0
  assert.equal(c.classify(wheel({ deltaY: 4, altKey: true, timeStamp: t }), 'auto', '3d'), 'orbit')
  // momentum grows past a wheel notch, ⌥ already let go — still the same orbit
  for (const dy of [30, 80, 120, 60, 10]) {
    t += 16
    assert.equal(c.classify(wheel({ deltaY: dy, timeStamp: t }), 'auto', '3d'), 'orbit')
  }
  // a pinch in between always zooms
  assert.equal(c.classify(wheel({ deltaY: 2, ctrlKey: true, timeStamp: t + 16 }), 'auto', '3d'), 'zoom')
  // after a pause a new gesture starts fresh
  t += GESTURE_GAP_MS + 50
  assert.equal(c.classify(wheel({ deltaY: 120, timeStamp: t }), 'auto', '3d'), 'wheel')
})

test('the device setting overrides detection', () => {
  const c = new WheelClassifier()
  assert.equal(c.classify(wheel({ deltaY: 2, timeStamp: 0 }), 'mouse', 'front'), 'wheel')
  assert.equal(c.classify(wheel({ deltaY: 2, ctrlKey: true, timeStamp: 1000 }), 'mouse', '3d'), 'wheel')
  assert.equal(c.classify(wheel({ deltaY: 120, timeStamp: 2000 }), 'trackpad', 'front'), 'pan')
  assert.equal(c.classify(wheel({ deltaY: 100, ctrlKey: true, timeStamp: 3000 }), 'trackpad', 'front'), 'zoom')
})

test('continuous zoom follows the pinch and is bounded per event', () => {
  assert.ok(Math.abs(zoomFactor(-100 * Math.log(1.05)) - 1.05) < 1e-9, 'pinch delta is 100·ln(scale)')
  assert.ok(zoomFactor(10) < 1 && zoomFactor(-10) > 1)
  assert.equal(zoomFactor(1000), zoomFactor(30))
  assert.deepEqual(wheelPixels({ deltaX: 1, deltaY: 2, deltaMode: 1 }), { dx: 16, dy: 32 })
})

test('⌥-drag moves the camera except in mouse mode; other modifiers stay with the tools', () => {
  const press = (over = {}) => ({ button: 0, altKey: true, shiftKey: false, ctrlKey: false, metaKey: false, ...over })
  assert.equal(cameraDragFor(press(), '3d', 'auto'), 'orbit')
  assert.equal(cameraDragFor(press({ shiftKey: true }), '3d', 'trackpad'), 'pan')
  assert.equal(cameraDragFor(press(), 'front', 'auto'), 'pan')
  assert.equal(cameraDragFor(press(), '3d', 'mouse'), null)
  assert.equal(cameraDragFor(press({ altKey: false }), '3d', 'trackpad'), null)
  assert.equal(cameraDragFor(press({ altKey: false, shiftKey: true }), '3d', 'trackpad'), null, 'Shift alone is not a camera drag')
  assert.equal(cameraDragFor(press({ ctrlKey: true }), '3d', 'auto'), null)
  assert.equal(cameraDragFor(press({ button: 1 }), '3d', 'auto'), null)
})
