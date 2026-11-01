/** Parameter names follow the UI rule: a letter or underscore, then word characters. */
const PARAM_NAME = /^[A-Za-z_]\w*$/
/** Every identifier in a formula; matching by token avoids building a RegExp from a name. */
const IDENT = /[A-Za-z_]\w*/g
/** A number literal: "18", "18.5", "18,5" (comma decimal) or ".5". */
const NUMBER = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/
/** Nesting limit; deeper input returns null instead of overflowing the stack. */
const MAX_DEPTH = 50

/**
 * Evaluate a simple arithmetic expression with named parameters.
 * Supports: +, -, *, /, (, ), numbers (comma or dot decimal), parameter names,
 * and an optional leading '=' (spreadsheet style).
 * Parameters are treated as mm values (matching how project.parameters are stored).
 * Returns null if the expression is invalid or contains unknown names.
 *
 * Examples:
 *   evalFormula("800 - 2 * 18", {})  → 764
 *   evalFormula("=SCHRANK_H - BODEN_T", { SCHRANK_H: 720, BODEN_T: 18 }) → 702
 */
export function evalFormula(
  expr: string,
  params: Record<string, number> = {}
): number | null {
  const str = expr.trim().replace(/^=/, '')
  if (!str.trim()) return null
  let pos = 0
  let depth = 0

  const peek = (): string => str[pos] ?? ''
  const consume = (): string => str[pos++]
  const skipWs = () => { while (pos < str.length && /\s/.test(str[pos])) pos++ }

  function parseExpr(): number | null { return parseAddSub() }

  function parseAddSub(): number | null {
    let left = parseMulDiv()
    if (left === null) return null
    skipWs()
    while (peek() === '+' || peek() === '-') {
      const op = consume()
      skipWs()
      const right = parseMulDiv()
      if (right === null) return null
      left = op === '+' ? left + right : left - right
      skipWs()
    }
    return left
  }

  function parseMulDiv(): number | null {
    let left = parseUnary()
    if (left === null) return null
    skipWs()
    while (peek() === '*' || peek() === '/') {
      const op = consume()
      skipWs()
      const right = parseUnary()
      if (right === null) return null
      if (op === '/' && right === 0) return null
      left = op === '*' ? left * right : left / right
      skipWs()
    }
    return left
  }

  function parseUnary(): number | null {
    skipWs()
    if (peek() === '-') { consume(); const v = parseAtom(); return v === null ? null : -v }
    if (peek() === '+') { consume(); return parseAtom() }
    return parseAtom()
  }

  function parseAtom(): number | null {
    skipWs()
    // Parenthesised sub-expression
    if (peek() === '(') {
      if (++depth > MAX_DEPTH) return null
      consume()
      const v = parseExpr()
      skipWs()
      if (v === null || peek() !== ')') return null
      consume()
      depth--
      return v
    }
    // Numeric literal
    if (/[0-9.,]/.test(peek())) {
      let numStr = ''
      while (/[0-9.,]/.test(peek())) numStr += consume()
      return NUMBER.test(numStr) ? parseFloat(numStr.replace(',', '.')) : null
    }
    // Parameter identifier
    if (/[A-Za-z_]/.test(peek())) {
      let name = ''
      while (/[A-Za-z0-9_]/.test(peek())) name += consume()
      return Object.hasOwn(params, name) ? params[name] : null
    }
    return null
  }

  const result = parseExpr()
  skipWs()
  // Fail if we didn't consume the whole string
  if (pos !== str.length) return null
  return result
}

/** Returns true when the string is not a plain number (i.e. it is a formula). Comma decimals count as numbers. */
export function isFormula(s: string): boolean {
  return !/^-?\d*[.,]?\d+$/.test(s.trim())
}

/** True when the name may be used as a parameter, i.e. a formula can reference it. */
export function isParamName(name: string): boolean {
  return PARAM_NAME.test(name)
}

/** Parameter names referenced by a formula (in order, with repeats). */
export function formulaParams(expr: string): string[] {
  return expr.match(IDENT) ?? []
}

/** The formula with every reference to parameter `from` renamed to `to`. */
export function renameFormulaParam(expr: string, from: string, to: string): string {
  return expr.replace(IDENT, (id) => (id === from ? to : id))
}
