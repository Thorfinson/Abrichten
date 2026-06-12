import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'

/**
 * Renders visual groove marks for dado and rabbet joints.
 * A dark semi-transparent box is overlaid on the host board (boardA) at the
 * position where boardB would be let in.
 *
 * Position heuristic:
 *   - The groove runs perpendicular to boardA's width axis.
 *   - Groove X centre = joint.position.x (world space, snapped to boardA's face)
 *   - Groove width = boardB.depth (the panel's thickness sitting in the dado)
 *   - Groove depth = min(boardA.depth * 0.35, 14) mm (into the face)
 *   - Groove height = boardA.height (spans full height of the host panel)
 */
export function JointGrooves3D() {
  const showJointMarkers = useUIStore((s) => s.showJointMarkers)
  const project = useProjectStore((s) => s.project)

  if (!showJointMarkers) return null

  const grooves: JSX.Element[] = []

  for (const assembly of project.assemblies) {
    if (assembly.visible === false) continue
    const boardMap = new Map(assembly.boards.map((b) => [b.id, b]))

    for (const joint of assembly.joints) {
      if (joint.type !== 'dado' && joint.type !== 'rabbet') continue

      const boardA = boardMap.get(joint.boardA)
      if (!boardA) continue
      const boardB = boardMap.get(joint.boardB)

      // grooveWidth = boardB's smallest dimension = its thickness (e.g. 18mm)
      const grooveWidth = boardB ? Math.min(boardB.depth, boardB.width, boardB.height) : 18
      const grooveDepth = Math.min(boardA.depth * 0.35, 14)

      // Position: joint.position gives the groove centre in world space.
      // Use joint.position.y so shelf dados show at the correct shelf height,
      // not always at boardA's vertical centre.
      // gz at the FRONT face (z = position.z + half grooveDepth) — most dados
      // are cut from the visible/inside face.
      const gx = joint.position.x
      const gy = joint.position.y !== 0 ? joint.position.y : boardA.position.y + boardA.height / 2
      const gz = joint.type === 'rabbet'
        ? boardA.position.z + boardA.depth - grooveDepth / 2  // rabbet → back face
        : boardA.position.z + grooveDepth / 2                 // dado → front face

      grooves.push(
        <mesh
          key={joint.id}
          position={[gx, gy, gz]}
          renderOrder={1}
        >
          <boxGeometry args={[grooveWidth, boardA.height + 1, grooveDepth + 0.5]} />
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
