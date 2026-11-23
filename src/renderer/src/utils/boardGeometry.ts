import * as THREE from 'three'
import type { Board } from '../types/furniture'
import { boardFace, type BoardAxis } from './boardFace'
import { clampCutouts, isNotch, notchedOutline } from './geometry'

const AXIS_DIR: Record<BoardAxis, THREE.Vector3> = {
  width: new THREE.Vector3(1, 0, 0),
  height: new THREE.Vector3(0, 1, 0),
  depth: new THREE.Vector3(0, 0, 1)
}

/**
 * Board mesh geometry, centred like BoxGeometry: a plain box, or an extruded outline
 * when the board has cutouts (holes inside, notches at the edge, round holes). The
 * outline is drawn on the board's face (utils/boardFace, u × v, as the cutouts are
 * given), extruded through the thickness and turned into place — the same for lying
 * and standing boards.
 */
export function buildBoardGeometry(board: Board): THREE.BufferGeometry {
  const cuts = clampCutouts(board)
  if (cuts.length === 0) return new THREE.BoxGeometry(board.width, board.height, board.depth)
  const face = boardFace(board)
  const notches = cuts.filter((c) => isNotch(board, c))
  const outline = notchedOutline(face.u, face.v, notches)
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)))
  for (const c of cuts) {
    if (notches.includes(c)) continue
    if (c.shape === 'circle') {
      const r = c.width / 2
      shape.holes.push(new THREE.Path().absarc(c.x + r, c.z + r, r, 0, Math.PI * 2, true))
      continue
    }
    const u0 = c.x, v0 = c.z, u1 = c.x + c.width, v1 = c.z + c.depth
    shape.holes.push(new THREE.Path().moveTo(u0, v0).lineTo(u0, v1).lineTo(u1, v1).lineTo(u1, v0).closePath())
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: face.thickness, bevelEnabled: false, curveSegments: 24 })
  // shape x → face u, shape y → face v, extrusion → thickness; a proper rotation (the
  // extrusion runs the other way where the three axes would mirror), then centred
  const u = AXIS_DIR[face.uAxis], v = AXIS_DIR[face.vAxis], t = AXIS_DIR[face.thicknessAxis].clone()
  const basis = new THREE.Matrix4().makeBasis(u, v, t)
  if (basis.determinant() < 0) basis.makeBasis(u, v, t.negate())
  geo.applyMatrix4(basis)
  // centred on the whole board (as BoxGeometry), whatever the cutouts take away
  const centre = u.clone().multiplyScalar(face.u / 2).add(v.clone().multiplyScalar(face.v / 2)).add(t.clone().multiplyScalar(face.thickness / 2))
  geo.translate(-centre.x, -centre.y, -centre.z)
  return geo
}
