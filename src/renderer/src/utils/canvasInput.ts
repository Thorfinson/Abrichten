// Mouse vs. trackpad on the canvas.
//
// A mouse wheel zooms (2D: step towards the cursor, 3D: OrbitControls dolly).
// A trackpad sends the same `wheel` events for very different gestures, so
// they are told apart here:
//   two-finger scroll        → pan          (wheel, no modifier)
//   pinch                    → zoom         (wheel with ctrlKey — Chromium sets it for a pinch)
//   ⌘ + two-finger scroll    → zoom
//   ⌥ + two-finger scroll    → orbit in 3D  (2D: pan)
// and the left button with Option moves the camera like the middle button:
//   ⌥ + drag                 → orbit in 3D  (2D: pan)
//   ⇧ + ⌥ + drag             → pan
//
// The "auto" device decides per scroll gesture whether a mouse wheel or a
// trackpad sent it: a mouse wheel notch is a line/page delta, a delta of a
// whole notch (100 / 120 px on Windows and Linux, 53.3 on GTK) or, on macOS,
// a multiple of Chromium's 4.000244140625 px notch, always vertical only.
// A trackpad sends small pixel deltas, often with a horizontal part; its
// momentum can grow large, so a gesture keeps the kind it started with.

import type { ViewMode } from '../types/measurement'

export type InputDevice = 'auto' | 'mouse' | 'trackpad'
export const INPUT_DEVICES: readonly InputDevice[] = ['auto', 'mouse', 'trackpad']

/** macOS: modifier keys are shown as ⌥ / ⌘, elsewhere as Alt / Ctrl */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const ALT_KEY = IS_MAC ? '⌥' : 'Alt'
export const CMD_KEY = IS_MAC ? '⌘' : 'Ctrl'

export function isInputDevice(v: unknown): v is InputDevice {
  return v === 'auto' || v === 'mouse' || v === 'trackpad'
}

/**
 * What a wheel event does to the camera.
 * - `wheel`: a mouse wheel notch — the behaviour the app always had
 * - `zoom`:  continuous zoom towards the cursor by `zoomFactor(deltaY)`
 * - `pan` / `orbit`: move the view by the scroll delta in screen pixels
 */
export type WheelIntent = 'wheel' | 'zoom' | 'pan' | 'orbit'

/** The fields of a WheelEvent the classifier reads (also lets unit tests pass plain objects). */
export interface WheelLike {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  timeStamp: number
}

/** Events closer than this belong to one gesture (macOS sends momentum every ~16 ms). */
export const GESTURE_GAP_MS = 200

/** Chromium on macOS: one mouse wheel notch is 0.1 Cocoa lines × 40 px. */
const MAC_WHEEL_NOTCH = 4.000244140625
/** Smallest |deltaY| a Windows / Linux mouse notch produces (GTK: 53.3, Windows: 100+). */
const MIN_NOTCH_PX = 50

function isMacWheelNotch(dy: number): boolean {
  const n = Math.abs(dy) / MAC_WHEEL_NOTCH
  return n >= 1 && Math.abs(n - Math.round(n)) < 1e-6
}

/** Whether a single wheel event, on its own, looks like a mouse wheel notch. */
export function looksLikeMouseWheel(e: Pick<WheelLike, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey'>): boolean {
  if (e.deltaMode !== 0) return true // lines or pages: only wheels do that
  // Shift turns a wheel notch into a horizontal one (deltaX instead of deltaY)
  const dx = e.shiftKey && e.deltaY === 0 ? 0 : e.deltaX
  const dy = e.shiftKey && e.deltaY === 0 ? e.deltaX : e.deltaY
  if (dx !== 0) return false // a wheel scrolls one axis; two-finger scroll rarely does
  return isMacWheelNotch(dy) || Math.abs(dy) >= MIN_NOTCH_PX
}

/**
 * Classifies a stream of wheel events. Stateful: a gesture (events less than
 * GESTURE_GAP_MS apart) keeps the device and the pan / orbit choice it
 * started with, so a trackpad's growing momentum isn't taken for a mouse
 * wheel and letting go of ⌥ during the momentum doesn't turn an orbit into a
 * pan. A pinch (ctrlKey) always zooms.
 */
export class WheelClassifier {
  private lastTime = -Infinity
  private trackpad = false
  private latched: WheelIntent | null = null

  classify(e: WheelLike, device: InputDevice, view: ViewMode): WheelIntent {
    const continues = e.timeStamp - this.lastTime < GESTURE_GAP_MS
    this.lastTime = e.timeStamp

    if (device === 'mouse') return 'wheel'

    if (device === 'trackpad') this.trackpad = true
    else if (!continues || !this.trackpad) this.trackpad = !looksLikeMouseWheel(e)

    if (!this.trackpad) {
      this.latched = null
      return 'wheel'
    }

    // A pinch arrives as ctrlKey + deltaY and never has momentum
    if (e.ctrlKey) return 'zoom'

    if (continues && this.latched) return this.latched
    this.latched = e.metaKey ? 'zoom' : e.altKey && view === '3d' ? 'orbit' : 'pan'
    return this.latched
  }
}

/** Zoom step factor for continuous zoom: Chromium's pinch delta is 100·ln(scale), so this follows the fingers 1:1. */
export function zoomFactor(deltaY: number): number {
  const d = Math.max(-30, Math.min(30, deltaY))
  return Math.exp(-d / 100)
}

/** Pixel delta of a wheel event (line / page deltas scaled like OrbitControls does). */
export function wheelPixels(e: Pick<WheelLike, 'deltaX' | 'deltaY' | 'deltaMode'>): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
  return { dx: e.deltaX * k, dy: e.deltaY * k }
}

export type CameraDrag = 'orbit' | 'pan'

/**
 * A left-button drag that moves the camera instead of selecting or moving a
 * board (the mouse's middle / right button for a trackpad): ⌥ orbits in 3D
 * and pans in 2D, ⇧⌥ pans. Off for the "mouse" device, which keeps ⌥-drag
 * as it was (marquee on empty canvas).
 */
export function cameraDragFor(
  e: Pick<PointerEvent, 'button' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  view: ViewMode,
  device: InputDevice
): CameraDrag | null {
  if (device === 'mouse') return null
  if (e.button !== 0 || !e.altKey || e.ctrlKey || e.metaKey) return null
  if (view !== '3d') return 'pan'
  return e.shiftKey ? 'pan' : 'orbit'
}
