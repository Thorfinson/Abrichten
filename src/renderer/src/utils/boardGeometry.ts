import * as THREE from 'three'
import type { Board } from '../types/furniture'
import { clampCutouts, isNotch, notchedOutline } from './geometry'

/**
 * Board mesh geometry, centred like BoxGeometry: a plain box, or an extruded outline
 * when the board has cutouts (holes inside, notches at the edge). Cutout x/z are
 * measured from the board's min-x / min-z corner.
 */
export function buildBoardGeometry(board: Board): THREE.BufferGeometry {
  const cuts = clampCutouts(board)
  if (cuts.length === 0) return new THREE.BoxGeometry(board.width, board.height, board.depth)
  const notches = cuts.filter((c) => isNotch(board, c))
  const outline = notchedOutline(board.width, board.depth, notches)
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)))
  for (const c of cuts) {
    if (notches.includes(c)) continue
    const x0 = c.x, z0 = c.z, x1 = c.x + c.width, z1 = c.z + c.depth
    shape.holes.push(new THREE.Path().moveTo(x0, z0).lineTo(x0, z1).lineTo(x1, z1).lineTo(x1, z0).closePath())
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: board.height, bevelEnabled: false })
  // Turn the extrusion into the y-axis with shape-y pointing to +z (a −π/2 turn mirrored
  // the cutouts in depth), then centre like BoxGeometry.
  geo.rotateX(Math.PI / 2)
  geo.translate(-board.width / 2, board.height / 2, -board.depth / 2)
  return geo
}
