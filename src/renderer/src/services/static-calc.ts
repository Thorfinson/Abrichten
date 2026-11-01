// Rating rules and the utilisation colour scale of the load simulation (services/static-sim.ts).
// The 3D heat map, its legend, the static summary and the AI context all use these.

export type StaticRating = 'ok' | 'warning' | 'critical'
/** A rating, or one of the two states that are not rated: no adequate support, wall-hung. */
export type StaticStatus = StaticRating | 'unsupported' | 'wallHung'

export const GRAVITY = 9.81
/** Load factor k for the minimum thickness: a 20 % load margin. */
export const LOAD_FACTOR = 1.2
/** Furniture deflection limit: span/300; beyond span/200 a shelf visibly sags. */
export const DEFLECTION_WARNING_RATIO = 300
export const DEFLECTION_CRITICAL_RATIO = 200

/**
 * Rating from the maximum utilisation u = σ/f (1 = breaks) and the deflection as a share
 * of the span it occurs in:
 *  - critical: u ≥ 1, or deflection > span/200
 *  - warning:  u ≥ 1/γ_M (the material safety margin is used up), or deflection > span/300
 */
export function rateMember(uMax: number, deflectionPerSpan: number, gammaM: number): StaticRating {
  if (uMax >= 1 || deflectionPerSpan > 1 / DEFLECTION_CRITICAL_RATIO) return 'critical'
  if (uMax >= 1 / gammaM || deflectionPerSpan > 1 / DEFLECTION_WARNING_RATIO) return 'warning'
  return 'ok'
}

/**
 * Thickness that passes with a 20 % load margin, rounded up to whole mm; null when the
 * current one does. Stress scales with 1/h², deflection with 1/h³. The self-weight is
 * held constant although a thicker board weighs more; the margin covers that for the
 * usual furniture loads.
 */
export function minBeamThickness(h: number, uMax: number, gammaM: number, deflectionMm: number, allowableMm: number): number | null {
  const byStress = Math.sqrt(LOAD_FACTOR * uMax * gammaM)
  const byDeflection = allowableMm > 0 ? Math.cbrt((LOAD_FACTOR * deflectionMm) / allowableMm) : 0
  const factor = Math.max(byStress, byDeflection)
  return factor > 1 ? Math.ceil(h * factor - 1e-9) : null
}

/**
 * Minimum thickness of a standing panel, post or rail on edge: stresses in its plane
 * (compression, in-plane bending) scale with 1/t, Euler buckling about the weak axis
 * with 1/t³, the in-plane deflection with 1/t. Self-weight held constant, as above.
 */
export function minPanelThickness(
  t: number, uCompression: number, uBuckling: number, gammaM: number, deflectionMm = 0, allowableMm = 0
): number | null {
  const byDeflection = allowableMm > 0 ? (LOAD_FACTOR * deflectionMm) / allowableMm : 0
  const factor = Math.max(LOAD_FACTOR * uCompression * gammaM, Math.cbrt(LOAD_FACTOR * uBuckling * gammaM), byDeflection)
  return factor > 1 ? Math.ceil(t * factor - 1e-9) : null
}

// ── Colour scale (the one place it is defined) ─────────────────────────────

/** Utilisation → colour: green 0 % → yellow 50 % → orange 80 % → red from 100 % (breaks). */
export const UTILISATION_STOPS: readonly { at: number; color: string }[] = [
  { at: 0, color: '#22c55e' },
  { at: 0.5, color: '#facc15' },
  { at: 0.8, color: '#f97316' },
  { at: 1, color: '#ef4444' }
]

/** Boards without adequate support; not on the utilisation scale. */
export const UNSUPPORTED_COLOR = '#a855f7'
/** Supports of the selected board: resting contacts (cones) and joints (squares). */
export const SUPPORT_COLOR = '#38bdf8'
export const JOINT_COLOR = '#f472b6'

/** Wall-hung boards (no support found, not checked): neutral. */
export const NEUTRAL_COLOR = '#71717a'

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const STOP_RGB = UTILISATION_STOPS.map((s) => ({ at: s.at, rgb: hexRgb(s.color) }))

/** sRGB colour (0…1 per channel) for a utilisation; values beyond 100 % stay red. */
export function utilisationRgb(u: number): [number, number, number] {
  const v = Math.max(0, Number.isFinite(u) ? u : 1)
  for (let i = 1; i < STOP_RGB.length; i++) {
    const a = STOP_RGB[i - 1], b = STOP_RGB[i]
    if (v <= b.at) {
      const f = (v - a.at) / (b.at - a.at)
      return [0, 1, 2].map((k) => a.rgb[k] + (b.rgb[k] - a.rgb[k]) * f) as [number, number, number]
    }
  }
  return STOP_RGB[STOP_RGB.length - 1].rgb
}

/** CSS colour for a utilisation (labels, table cells). */
export function utilisationCss(u: number): string {
  const [r, g, b] = utilisationRgb(u).map((c) => Math.round(c * 255))
  return `rgb(${r}, ${g}, ${b})`
}

/** The same scale as a CSS gradient over 0…100 % (legend bar). */
export const UTILISATION_GRADIENT_CSS =
  `linear-gradient(to right, ${UTILISATION_STOPS.map((s) => `${s.color} ${s.at * 100}%`).join(', ')})`
