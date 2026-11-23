import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { useViewHidden } from '../../hooks/useViewHidden'
import { detectCollisions3D } from '../../utils/collision'
import { CANVAS, HTML_Z_RANGE, sceneLabelStyle } from '../canvasTheme'
import { assemblyCounts } from '../../utils/activeParts'

/** One red overlap box. The box geometry is memoized (and disposed) so the
 *  edges aren't rebuilt — and a BoxGeometry leaked — on every render. */
function CollisionBox({ cx, cy, cz, sx, sy, sz }: { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number }) {
  const box = useMemo(() => new THREE.BoxGeometry(sx, sy, sz), [sx, sy, sz])
  useEffect(() => () => box.dispose(), [box])

  return (
    <group position={[cx, cy, cz]}>
      <mesh geometry={box}>
        <meshBasicMaterial
          color={0xef4444}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[box]} />
        <lineBasicMaterial color={0xef4444} />
      </lineSegments>
      {/* Warning indicator */}
      <Html position={[0, sy / 2 + 10, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={HTML_Z_RANGE}>
        <span style={{ ...sceneLabelStyle(CANVAS.collision, 12), fontWeight: 'bold' }}>!</span>
      </Html>
    </group>
  )
}

/**
 * 3D collision overlay — renders a red box at the AABB intersection
 * of each colliding board pair detected via sweep-and-prune + SAT OBB.
 */
export function CollisionOverlay3D() {
  const project = useProjectStore((s) => s.project)
  const showCollisionOverlay = useUIStore((s) => s.showCollisionOverlay)
  const setCollisionPairs = useUIStore((s) => s.setCollisionPairs)
  const hidden = useViewHidden()

  const collisions = useMemo(() => {
    if (!showCollisionOverlay) return []

    const visible = project.assemblies.filter(assemblyCounts)

    // joints let a back panel sit in its dado/rabbet without counting as a collision;
    // parts the assembly step view hides take no part
    return detectCollisions3D(visible.flatMap((a) => a.boards).filter((b) => !hidden.has(b.id)), visible.flatMap((a) => a.joints))
  }, [showCollisionOverlay, project.assemblies, hidden])

  // Publish the pairs whenever they change (not just their count — a drag can
  // swap one colliding pair for another), without churning the store while
  // a drag keeps the same pairs.
  const pairsKey = collisions.map((c) => `${c.boardIdA}|${c.boardIdB}`).join(',')
  useEffect(() => {
    setCollisionPairs(collisions.map((c) => ({ boardIdA: c.boardIdA, boardIdB: c.boardIdB })))
    return () => setCollisionPairs([])
  }, [pairsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!showCollisionOverlay || collisions.length === 0) return null

  return (
    <>
      {collisions.map(({ boardIdA, boardIdB, overlapAABB }, idx) => (
        <CollisionBox
          key={`collision-${boardIdA}-${boardIdB}-${idx}`}
          cx={(overlapAABB.minX + overlapAABB.maxX) / 2}
          cy={(overlapAABB.minY + overlapAABB.maxY) / 2}
          cz={(overlapAABB.minZ + overlapAABB.maxZ) / 2}
          sx={overlapAABB.maxX - overlapAABB.minX}
          sy={overlapAABB.maxY - overlapAABB.minY}
          sz={overlapAABB.maxZ - overlapAABB.minZ}
        />
      ))}
    </>
  )
}
