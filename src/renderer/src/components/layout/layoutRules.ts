/** Pure layout rules of the canvas chrome — kept free of React so unit tests can import them. */

/** Below this canvas width (px) the shortcut HUD shows only its overlay row. */
export const HUD_COMPACT_BELOW_PX = 1200

/** The HUD is compact in the quad layout and on narrow canvases. */
export function isHudAutoCompact(canvasWidth: number, layout: 'single' | 'quad'): boolean {
  return layout === 'quad' || canvasWidth < HUD_COMPACT_BELOW_PX
}

/** Snap grid sizes offered in the status bar (mm). */
export const SNAP_SIZES = [1, 5, 10, 25, 50, 100] as const

export interface Size2D { width: number; height: number }

/**
 * Clamps the centre of a `box`-sized element so the whole element stays
 * `margin` px inside `area`. When the element is larger than the area it is
 * centred on that axis.
 */
export function clampCentre(
  x: number, y: number, box: Size2D, area: Size2D, margin = 8
): [number, number] {
  const clampAxis = (v: number, half: number, extent: number): number => {
    const lo = half + margin
    const hi = extent - half - margin
    return lo > hi ? extent / 2 : Math.min(hi, Math.max(lo, v))
  }
  return [clampAxis(x, box.width / 2, area.width), clampAxis(y, box.height / 2, area.height)]
}

export interface Bounds3D {
  minX: number; maxX: number
  minY: number; maxY: number
  minZ: number; maxZ: number
}

interface BoxLike {
  position: { x: number; y: number; z: number }
  width: number; height: number; depth: number
}

/** What "fit view" frames in an empty project: one metre from the origin. */
export const EMPTY_FIT_BOUNDS: Bounds3D = { minX: 0, maxX: 1000, minY: 0, maxY: 1000, minZ: 0, maxZ: 1000 }

/** Bounding box of the given boards (unrotated extents), or EMPTY_FIT_BOUNDS for none. */
export function fitBounds(boards: readonly BoxLike[]): Bounds3D {
  if (boards.length === 0) return EMPTY_FIT_BOUNDS
  const b: Bounds3D = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (const { position: p, width, height, depth } of boards) {
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x + width)
    b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y + height)
    b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z + depth)
  }
  return b
}
