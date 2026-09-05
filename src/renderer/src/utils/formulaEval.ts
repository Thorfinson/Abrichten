/**
 * Evaluate a simple arithmetic expression with named parameters.
 * Supports: +, -, *, /, (, ), numbers, parameter names.
 * Parameters are treated as mm values (matching how project.parameters are stored).
 * Returns null if the expression is invalid or contains unknown names.
 *
 * Examples:
 *   evalFormula("800 - 2 * 18", {})  → 764
 *   evalFormula("SCHRANK_H - BODEN_T", { SCHRANK_H: 720, BODEN_T: 18 }) → 702
 */
export function evalFormula(
  expr: string,
  params: Record<string, number> = {}
): number | null {
  const str = expr.trim()
  if (!str) return null
  let pos = 0

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
      consume()
      const v = parseExpr()
      skipWs()
      if (peek() !== ')') return null
      consume()
      return v
    }
    // Numeric literal
    if (/[0-9.]/.test(peek())) {
      let numStr = ''
      while (/[0-9.]/.test(peek())) numStr += consume()
      const n = parseFloat(numStr)
      return isNaN(n) ? null : n
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

/** Returns true when the string contains non-numeric characters (i.e. it is a formula). */
export function isFormula(s: string): boolean {
  return !/^-?\d*\.?\d+$/.test(s.trim())
}
