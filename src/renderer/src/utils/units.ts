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
      return `${Math.round(converted).toLocaleString(locale)} mm`
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

/** Parse a user input string back to mm (accepts both . and , as decimal separator) */
export function parseInput(input: string, unit: Unit): number | null {
  const num = parseFloat(input.replace(',', '.'))
  if (isNaN(num)) return null
  return toMm(num, unit)
}
