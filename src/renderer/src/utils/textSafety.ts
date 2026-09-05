/** Escape text for interpolation into HTML/SVG markup strings. */
export function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return s.replace(/[&<>"']/g, (c) => map[c])
}

/** Quote a CSV cell; text starting with = + - @ gets a leading apostrophe so
 *  spreadsheets do not evaluate it as a formula (CSV injection). */
export function csvCell(v: unknown): string {
  if (typeof v === 'number') return String(v)
  const s = String(v)
  const safe = /^[=+@-]/.test(s) ? "'" + s : s
  return '"' + safe.replace(/"/g, '""') + '"'
}
