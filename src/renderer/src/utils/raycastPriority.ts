import * as THREE from 'three'

/**
 * Force a mesh to win the raycast against any other geometry it overlaps with.
 *
 * Use case: small overlay handles (resize cubes, rotation sphere) that sit
 * inside or behind the bounding box of the board they edit. Without this,
 * R3F's pointer-event dispatch hits the underlying board first because the
 * board's geometry is closer to the camera at that pixel.
 *
 * Implementation: wrap mesh.raycast so any hit it produces is rewritten to
 * distance 0. R3F sorts intersections by distance, so distance-0 hits sort
 * to the front and receive the pointer event first. The mesh's own
 * stopPropagation() then keeps the event from reaching the board.
 *
 * Idempotent — safe to call repeatedly (e.g. from a ref-callback).
 */
export function prioritizeRaycast(mesh: THREE.Mesh | null): void {
  if (!mesh) return
  const tagged = mesh as THREE.Mesh & { __priorityRaycast?: boolean }
  if (tagged.__priorityRaycast) return
  tagged.__priorityRaycast = true
  const base = THREE.Mesh.prototype.raycast
  mesh.raycast = function (raycaster, intersects) {
    const before = intersects.length
    base.call(this, raycaster, intersects)
    for (let i = before; i < intersects.length; i++) {
      intersects[i].distance = 0
    }
  }
}

/**
 * Opposite of prioritizeRaycast: push this mesh to the BACK of the raycast
 * intersection list by setting its hit distance to a huge value. Useful for
 * a selected board in 3D — when the user clicks anywhere on the board, the
 * underlying TransformControls pickers should win, so the gizmo (not the
 * board itself) handles the drag.
 *
 * Returns a cleanup function that restores the original raycast.
 */
export function deprioritizeRaycast(mesh: THREE.Mesh | null): () => void {
  if (!mesh) return () => {}
  const original = mesh.raycast
  const base = THREE.Mesh.prototype.raycast
  mesh.raycast = function (raycaster, intersects) {
    const before = intersects.length
    base.call(this, raycaster, intersects)
    for (let i = before; i < intersects.length; i++) {
      intersects[i].distance = 1e9
    }
  }
  return () => {
    mesh.raycast = original
  }
}
