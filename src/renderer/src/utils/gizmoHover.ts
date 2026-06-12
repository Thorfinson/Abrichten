// Tracks whether the user's cursor is currently over a three.js
// TransformControls gizmo handle (a translate arrow, rotate ring, or scale
// cube). drei's <TransformControls/> exposes the hovered axis on its
// `axis` property; we mirror that into a module-level flag here so any
// component can ask "is the user about to grab a gizmo?".
//
// Used to prevent board selection from firing when the user clicks on a
// gizmo handle that visually sits in front of another board: R3F's raycast
// hits the board (the gizmo's own meshes have no R3F pointer handlers), so
// board.onPointerDown would otherwise steal the click.

let hovering = false

export function setHoveringGizmo(value: boolean): void {
  hovering = value
}

export function isHoveringGizmo(): boolean {
  return hovering
}
