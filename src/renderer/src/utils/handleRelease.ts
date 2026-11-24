/**
 * What a handle writes back when released. Rule: the distance moved is rounded, never the place.
 * An axis the handle did not move keeps its exact value, also half millimetres (1116.5) and thin
 * boards (6.5); a bare click or a tremble below half a unit changes nothing. With the grid on, the
 * moved axis snaps to the grid, as a grid is meant to. Findings 23.11.2026 (review geometry 1, second
 * review): the release rounded the place on all axes, so a click turned 1116.5 into 1117 and 6.5 mm into 7.
 */
type Vec3 = { x: number; y: number; z: number }
type Dims = { width: number; height: number; depth: number }
export type Axis = 'x' | 'y' | 'z'

/** Below this a handle did not move an axis (float noise of the gizmo), in mm, degrees or scale. */
const MOVED = 1e-6
const AXES = ['x', 'y', 'z'] as const

/** One axis: unchanged when not moved, else start + whole units moved, or the grid when it is on. */
export function moveAxis(start: number, delta: number, grid: number | null): number {
  if (Math.abs(delta) <= MOVED) return start
  if (grid) return Math.round((start + delta) / grid) * grid
  return start + Math.round(delta)
}

/** New position from a move: each axis by moveAxis. */
export function releaseMove(start: Vec3, delta: Vec3, grid: number | null): Vec3 {
  return { x: moveAxis(start.x, delta.x, grid), y: moveAxis(start.y, delta.y, grid), z: moveAxis(start.z, delta.z, grid) }
}

/** New size from the scale handle: each scaled axis grows by whole mm (at least 1 mm), the others stay. */
export function releaseScale(start: Dims, scale: Vec3): Dims {
  const pick = (v: number, s: number) => Math.abs(s - 1) > MOVED ? Math.max(1, v + Math.round(v * (s - 1))) : v
  return { width: pick(start.width, scale.x), height: pick(start.height, scale.y), depth: pick(start.depth, scale.z) }
}

/**
 * New rotation in degrees. The axis the handle turned changes by whole degrees; an axis it did not
 * turn keeps its value, unless the 3D library had to write the same orientation with other angles
 * (Euler angles): then that axis takes the new angle as it is, not rounded, so no half degree is lost.
 * Without the turned axis (unknown handle) every changed axis is rounded, as before.
 */
export function releaseRotate(startDeg: Vec3, nowDeg: Vec3, turned: Axis | null = null): Vec3 {
  const out = { ...startDeg }
  for (const a of AXES) {
    const d = nowDeg[a] - startDeg[a]
    if (Math.abs(d) <= MOVED) continue
    if (turned === null) out[a] = Math.round(nowDeg[a])
    else if (a === turned) out[a] = startDeg[a] + Math.round(d)
    else out[a] = Math.round(nowDeg[a] * 1e6) / 1e6
  }
  return out
}
