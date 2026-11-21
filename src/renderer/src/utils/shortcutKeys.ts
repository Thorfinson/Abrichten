// Keyboard shortcuts on macOS and elsewhere.
//
// The app's Ctrl shortcuts (Ctrl+S, Ctrl+Z …) are ⌘S, ⌘Z on a Mac; Ctrl keeps
// working there too. Elsewhere metaKey is the Windows / Super key, which is
// the system's, so it is no shortcut modifier.
//
// On macOS Option changes the character a key types (⌥1 → "¡", ⌥G → "©"),
// so Alt shortcuts are matched by the physical key (e.code) instead of e.key.
//
// There is no application menu (src/main sets it to null), so no menu
// accelerator handles any of these: hooks/useKeyboard.ts does.

import { IS_MAC } from './canvasInput'

type ModifierState = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>

/** Ctrl, or ⌘ on macOS: the modifier of Ctrl+S / ⌘S style shortcuts. */
export function isCmdKey(e: ModifierState, mac = IS_MAC): boolean {
  return e.ctrlKey || (mac && e.metaKey)
}

/** Neither Ctrl nor ⌘ / the Windows key is held: a plain-letter shortcut may fire. */
export function noCmdKey(e: ModifierState): boolean {
  return !e.ctrlKey && !e.metaKey
}

/**
 * A single-character key in lower case, any other key name as it is.
 * Shift and Caps Lock make Ctrl+S an "S", and ⌘⇧Z reports "z" or "Z"
 * depending on the browser, so letters are compared in lower case.
 */
export function keyName(e: Pick<KeyboardEvent, 'key'>): string {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key
}

/** The digit of a digit key (number row or keypad) by its physical key, or null. */
export function digitOf(e: Pick<KeyboardEvent, 'code'>): string | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)
  return m ? m[1] : null
}

/** Whether the physical letter key is `letter` (a–z), whatever character it typed. */
export function isLetterKey(e: Pick<KeyboardEvent, 'code' | 'key'>, letter: string): boolean {
  return e.code === `Key${letter.toUpperCase()}` || keyName(e) === letter.toLowerCase()
}

export type Modifier = 'cmd' | 'alt' | 'shift'

const MAC_SYMBOL: Record<Modifier, string> = { alt: '⌥', shift: '⇧', cmd: '⌘' }
const PC_NAME: Record<Modifier, string> = { cmd: 'Ctrl', alt: 'Alt', shift: '⇧' }
// The order macOS menus list modifiers in (⌃⌥⇧⌘), and Ctrl+Alt+Shift elsewhere
const MAC_ORDER: Modifier[] = ['alt', 'shift', 'cmd']
const PC_ORDER: Modifier[] = ['cmd', 'alt', 'shift']

/** The label of a shortcut: "⇧⌘Z" / "⌥1" on macOS, "Ctrl+⇧+Z" / "Alt+1" elsewhere. */
export function keyCombo(key: string, mods: readonly Modifier[] = [], mac = IS_MAC): string {
  if (mac) return MAC_ORDER.filter((m) => mods.includes(m)).map((m) => MAC_SYMBOL[m]).join('') + key
  return [...PC_ORDER.filter((m) => mods.includes(m)).map((m) => PC_NAME[m]), key].join('+')
}
