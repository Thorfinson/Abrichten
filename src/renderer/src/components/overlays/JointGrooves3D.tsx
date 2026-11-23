import type { JSX } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { useViewHidden } from '../../hooks/useViewHidden'
import { grooveBox } from '../../utils/geometry'
import { assemblyCounts } from '../../utils/activeParts'

/**
 * Renders visual groove marks for dado and rabbet joints.
 * A dark semi-transparent box is overlaid on the host board (boardA) where
 * boardB is let in — geometry in utils/geometry.ts `grooveBox`.
 */
export function JointGrooves3D() {
  const showJointMarkers = useUIStore((s) => s.showJointMarkers)
  const project = useProjectStore((s) => s.project)
  const hidden = useViewHidden()

  if (!showJointMarkers) return null

  const grooves: JSX.Element[] = []

  // Joints may connect boards of different assemblies, so look boards up project-wide
  const boardMap = new Map(project.assemblies.flatMap((a) => a.boards).map((b) => [b.id, b]))

  for (const assembly of project.assemblies) {
    if (!assemblyCounts(assembly)) continue

    for (const joint of assembly.joints) {
      if (joint.type !== 'dado' && joint.type !== 'rabbet') continue

      const boardA = boardMap.get(joint.boardA)
      const boardB = boardMap.get(joint.boardB)
      // a groove of a part the assembly step view hides is not drawn
      if (!boardA || !boardB || hidden.has(boardA.id) || hidden.has(boardB.id)) continue

      const { centre, size } = grooveBox(joint.position, boardA, boardB)
      grooves.push(
        <mesh
          key={joint.id}
          position={centre as [number, number, number]}
          renderOrder={1}
        >
          <boxGeometry args={size as [number, number, number]} />
          <meshStandardMaterial
            color="#3b1e0a"
            transparent
            opacity={0.65}
            depthTest={false}
          />
        </mesh>
      )
    }
  }

  return <>{grooves}</>
}
