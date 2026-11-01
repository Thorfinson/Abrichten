// Cross-event-system bridge for TransformControls drags.
//
// drei's <TransformControls/> uses three.js's pointer handling, while R3F has
// its own synthetic event system on the same canvas. Both receive the native
// pointerup at end of a drag; R3F may then dispatch onPointerMissed /
// ground-plane onClick to deselect — which we want to suppress if the
// pointer-up was actually the end of a gizmo drag.
//
// Timestamp-based rather than flag-based on purpose: a flag cleared via
// queueMicrotask/setTimeout/rAF still races with R3F's event dispatch
// (whichever runs first wins). A timestamp + small grace window doesn't care
// about ordering — it just asks "did a drag end in the last 250 ms?"
//
// 250 ms is well under any conscious user re-click delay (>300 ms feels slow),
// and well over any plausible deferred event dispatch.

const GRACE_MS = 250

let dragging = false
let lastDragEnd = -Infinity
let cancelActive: (() => void) | null = null

/** Start a drag. `onCancel` lets the dragging handle drop its own drag state when Esc cancels. */
export function beginTransform(onCancel?: () => void): void {
  dragging = true
  cancelActive = onCancel ?? null
}

export function endTransform(): void {
  dragging = false
  cancelActive = null
  lastDragEnd = performance.now()
}

/** True during a drag and for a short grace window after it (see above). */
export function isTransforming(): boolean {
  return dragging || performance.now() - lastDragEnd < GRACE_MS
}

/** True only while a drag is actually in progress (no grace window). */
export function isDragActive(): boolean {
  return dragging
}

/** Esc during a drag: let the dragging handle reset itself, then end the drag.
 *  Returns false when no drag is in progress. */
export function cancelTransform(): boolean {
  if (!dragging) return false
  const onCancel = cancelActive
  cancelActive = null
  onCancel?.()
  endTransform()
  return true
}
