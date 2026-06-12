import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import type { Board, Joint } from '../../types/furniture'

const JOINT_COLORS: Record<string, string> = {
  dowel: '#6366f1',    // indigo
  screw: '#f59e0b',    // amber
  biscuit: '#10b981',  // emerald
  domino: '#3b82f6',   // blue
  pocket: '#8b5cf6',   // violet
  mortise: '#ec4899'   // pink
}

/**
 * Find the contact point between two axis-aligned boards.
 * For each board, clamp the other board's center to this board's AABB face,
 * then return the midpoint of the two clamped face points.
 * This places the marker at the actual joint interface instead of
 * in the air between board centers.
 */
function contactPoint(a: Board, b: Board): [number, number, number] {
  const aMinX = a.position.x, aMaxX = a.position.x + a.width
  const aMinY = a.position.y, aMaxY = a.position.y + a.height
  const aMinZ = a.position.z, aMaxZ = a.position.z + a.depth

  const bMinX = b.position.x, bMaxX = b.position.x + b.width
  const bMinY = b.position.y, bMaxY = b.position.y + b.height
  const bMinZ = b.position.z, bMaxZ = b.position.z + b.depth

  const aCx = (aMinX + aMaxX) / 2, aCy = (aMinY + aMaxY) / 2, aCz = (aMinZ + aMaxZ) / 2
  const bCx = (bMinX + bMaxX) / 2, bCy = (bMinY + bMaxY) / 2, bCz = (bMinZ + bMaxZ) / 2

  // Closest point on A's surface to B's center
  const pAx = Math.max(aMinX, Math.min(aMaxX, bCx))
  const pAy = Math.max(aMinY, Math.min(aMaxY, bCy))
  const pAz = Math.max(aMinZ, Math.min(aMaxZ, bCz))

  // Closest point on B's surface to A's center
  const pBx = Math.max(bMinX, Math.min(bMaxX, aCx))
  const pBy = Math.max(bMinY, Math.min(bMaxY, aCy))
  const pBz = Math.max(bMinZ, Math.min(bMaxZ, aCz))

  return [(pAx + pBx) / 2, (pAy + pBy) / 2, (pAz + pBz) / 2]
}

function JointMarker({ joint, allBoards }: { joint: Joint; allBoards: Board[] }) {
  const boardA = allBoards.find((b) => b.id === joint.boardA)
  const boardB = allBoards.find((b) => b.id === joint.boardB)
  if (!boardA || !boardB) return null

  const pos = contactPoint(boardA, boardB)
  const color = JOINT_COLORS[joint.type] ?? '#94a3b8'

  return (
    <mesh position={pos}>
      <sphereGeometry args={[8, 12, 12]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

/**
 * Renders colored sphere markers at the midpoint between joined boards.
 * Shown when showJointMarkers is enabled in UIStore.
 */
export function JointMarkers3D() {
  const project = useProjectStore((s) => s.project)
  const showJointMarkers = useUIStore((s) => s.showJointMarkers)

  if (!showJointMarkers) return null

  const allBoards = project.assemblies
    .filter((a) => a.visible !== false)
    .flatMap((a) => a.boards)

  const allJoints = project.assemblies
    .filter((a) => a.visible !== false)
    .flatMap((a) => a.joints)

  if (allJoints.length === 0) return null

  return (
    <>
      {allJoints.map((joint) => (
        <JointMarker key={joint.id} joint={joint} allBoards={allBoards} />
      ))}
    </>
  )
}
