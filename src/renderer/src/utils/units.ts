import type { Unit } from '../types/furniture'

const FACTORS: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000
}

/** Convert from mm to display unit */
export function fromMm(valueMm: number, unit: Unit): number {
  return valueMm / FACTORS[unit]
}

/** Convert from display unit to mm */
export function toMm(value: number, unit: Unit): number {
  return value * FACTORS[unit]
}

/** Format a mm value for display in the given unit, with appropriate precision */
export function formatValue(valueMm: number, unit: Unit, lang?: string): string {
  const converted = fromMm(valueMm, unit)
  const locale = lang === 'de' ? 'de-DE' : 'en-US'
  switch (unit) {
    case 'mm':
      // tenths, as the cut list shows them: 6.5 mm must not read "7 mm", 0.4 mm of air not "0 mm"
      return `${(Math.round(converted * 10) / 10 || 0).toLocaleString(locale, { maximumFractionDigits: 1 })} mm`   // || 0: no "-0 mm"
    case 'cm':
      return `${converted.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cm`
    case 'm':
      return `${converted.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m`
  }
}

/**
 * A mm value as a plain number in the given unit, for tables whose header names the unit:
 * mm to 0.1, cm to 0.01, m to 0.0001, no thousands separator (a cut list reads 2660, not 2.660).
 */
export function formatNumber(valueMm: number, unit: Unit, lang?: string): string {
  const digits = unit === 'mm' ? 1 : unit === 'cm' ? 2 : 4
  return fromMm(valueMm, unit).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: digits, useGrouping: false })
}

/** Format a currency value with locale-aware decimal/thousands separators */
export function formatCurrency(value: number, lang?: string): string {
  const locale = lang === 'de' ? 'de-DE' : 'en-US'
  return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * The one rule for reading a number a person typed. Every input field uses it (guard: tests/unit/input-numbers).
 * The number stays what was meant, nothing is rounded or cut off:
 * - comma or dot as decimal separator: "860,3" and "1116.5";
 * - a single dot or comma followed by exactly three digits is ambiguous ("1.200": 1200 in German,
 *   1.2 in English; the app itself shows decimals with a dot) and is refused, never guessed;
 *   a leading "0" makes it a decimal ("0.125", "0,125"); several groups are thousands ("1.234.567");
 * - both separators: the last one is the decimal ("1,234.5", "1.234,5");
 * - spaces as thousands separator, a Unicode minus, and a trailing "mm" are accepted;
 * - anything else ("12abc", "1,2,3", "1e3") is no number: null, so the field can say so.
 */
export function parseNumber(input: string): number | null {
  let s = input.replace(/[\s  ]+/g, '').replace(/−/g, '-').replace(/mm$/i, '')
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const neg = s.startsWith('-')
  if (neg) s = s.slice(1)
  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',')
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? '.' : ','
    const thou = dec === '.' ? ',' : '.'
    const [int, frac, ...rest] = s.split(dec)
    if (rest.length || !new RegExp(`^\\d{1,3}(\\${thou}\\d{3})+$`).test(int) || !/^\d+$/.test(frac)) return null   // thousands groups, then the decimal
    s = int.split(thou).join('') + '.' + frac
  } else if (comma >= 0) {
    if (s.indexOf(',') !== comma) return null           // "1,2,3" or "1,234,567": refused
    if (/^[1-9]\d{0,2},\d{3}$/.test(s)) return null      // "1,000": 1000 or 1.0? refused
    s = s.replace(',', '.')
  } else if (dot >= 0) {
    if (/^[1-9]\d{0,2}(\.\d{3}){2,}$/.test(s)) s = s.split('.').join('')   // several groups: 1.234.567
    else if (/^[1-9]\d{0,2}\.\d{3}$/.test(s)) return null  // "1.200": 1200 or 1.2? refused
    else if (s.indexOf('.') !== dot) return null        // "1.2.3"
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s) || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

/**
 * The value of a browser number field (<input type="number">): the browser has already read the
 * person's input in their locale and hands over a plain "1.2". Empty or invalid gives null, not 0.
 * Text fields use parseNumber instead.
 */
export function numberFieldValue(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Parse a user input string back to mm, with the one rule of parseNumber */
export function parseInput(input: string, unit: Unit): number | null {
  const num = parseNumber(input)
  return num === null ? null : toMm(num, unit)
}
