import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { useStepHidden } from '../../hooks/useStepHidden'
import { computeJointPosition } from '../../utils/geometry'
import type { Board, Joint } from '../../types/furniture'

const JOINT_COLORS: Record<string, string> = {
  dowel: '#6366f1',    // indigo
  screw: '#f59e0b',    // amber
  biscuit: '#10b981',  // emerald
  domino: '#3b82f6',   // blue
  pocket: '#8b5cf6',   // violet
  mortise: '#ec4899'   // pink
}

function JointMarker({ joint, allBoards }: { joint: Joint; allBoards: Board[] }) {
  const boardA = allBoards.find((b) => b.id === joint.boardA)
  const boardB = allBoards.find((b) => b.id === joint.boardB)
  if (!boardA || !boardB) return null

  // Same contact point the joint dialogs store: centre of the touching region
  const p = computeJointPosition(boardA, boardB)
  const pos: [number, number, number] = [p.x, p.y, p.z]
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
  const hidden = useStepHidden()

  if (!showJointMarkers) return null

  // parts the assembly step view hides, and their joints, are not drawn
  const allBoards = project.assemblies
    .filter((a) => a.visible !== false)
    .flatMap((a) => a.boards)
    .filter((b) => !hidden.has(b.id))

  const allJoints = project.assemblies
    .filter((a) => a.visible !== false)
    .flatMap((a) => a.joints)
    .filter((j) => !hidden.has(j.boardA) && !hidden.has(j.boardB))

  if (allJoints.length === 0) return null

  return (
    <>
      {allJoints.map((joint) => (
        <JointMarker key={joint.id} joint={joint} allBoards={allBoards} />
      ))}
    </>
  )
}
