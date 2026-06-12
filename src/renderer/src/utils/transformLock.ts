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

export function beginTransform(): void {
  dragging = true
}

export function endTransform(): void {
  dragging = false
  lastDragEnd = performance.now()
}

export function isTransforming(): boolean {
  return dragging || performance.now() - lastDragEnd < GRACE_MS
}
