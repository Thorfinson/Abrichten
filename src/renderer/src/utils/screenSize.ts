import * as THREE from 'three'

/**
 * Compute the world-space size a mesh needs to have to appear roughly
 * `desiredPixels` tall on screen, given the current camera and canvas.
 *
 * Used by overlay handles (resize cubes, rotation sphere, face cubes) so
 * they stay visible and grabbable at any zoom level instead of shrinking
 * to invisibility in quad-layout views.
 *
 * - OrthographicCamera: depends only on zoom + frustum height
 * - PerspectiveCamera: depends on the distance from camera to the handle
 */
export function computeWorldSizeForPixels(
  desiredPixels: number,
  worldPosition: THREE.Vector3,
  camera: THREE.Camera,
  canvasHeightPx: number
): number {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera
    const worldHeight = (ortho.top - ortho.bottom) / ortho.zoom
    return (desiredPixels * worldHeight) / canvasHeightPx
  }
  const persp = camera as THREE.PerspectiveCamera
  const dist = camera.position.distanceTo(worldPosition)
  const visibleWorldHeight = 2 * Math.tan(((persp.fov ?? 50) * Math.PI / 180) / 2) * dist
  return (desiredPixels * visibleWorldHeight) / canvasHeightPx
}
