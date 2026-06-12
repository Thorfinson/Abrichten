import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { detectCollisions3D } from '../../utils/collision'

/**
 * 3D collision overlay — renders a red box at the AABB intersection
 * of each colliding board pair detected via sweep-and-prune + SAT OBB.
 */
export function CollisionOverlay3D() {
  const project = useProjectStore((s) => s.project)
  const showCollisionOverlay = useUIStore((s) => s.showCollisionOverlay)
  const setCollisionPairs = useUIStore((s) => s.setCollisionPairs)

  const collisions = useMemo(() => {
    if (!showCollisionOverlay) return []

    const allBoards = project.assemblies
      .filter((a) => a.visible !== false)
      .flatMap((a) => a.boards)

    return detectCollisions3D(allBoards)
  }, [showCollisionOverlay, project.assemblies])

  useEffect(() => {
    setCollisionPairs(collisions.map((c) => ({ boardIdA: c.boardIdA, boardIdB: c.boardIdB })))
    return () => setCollisionPairs([])
  }, [collisions.length])

  if (!showCollisionOverlay || collisions.length === 0) return null

  return (
    <>
      {collisions.map(({ boardIdA, boardIdB, overlapAABB }, idx) => {
        const cx = (overlapAABB.minX + overlapAABB.maxX) / 2
        const cy = (overlapAABB.minY + overlapAABB.maxY) / 2
        const cz = (overlapAABB.minZ + overlapAABB.maxZ) / 2
        const sx = overlapAABB.maxX - overlapAABB.minX
        const sy = overlapAABB.maxY - overlapAABB.minY
        const sz = overlapAABB.maxZ - overlapAABB.minZ

        return (
          <group key={`collision-${boardIdA}-${boardIdB}-${idx}`}>
            <mesh position={[cx, cy, cz]}>
              <boxGeometry args={[sx, sy, sz]} />
              <meshBasicMaterial
                color={0xef4444}
                transparent
                opacity={0.3}
                depthWrite={false}
              />
            </mesh>
            <lineSegments position={[cx, cy, cz]}>
              <edgesGeometry args={[new THREE.BoxGeometry(sx, sy, sz)]} />
              <lineBasicMaterial color={0xef4444} />
            </lineSegments>
            {/* Warning indicator */}
            <Html position={[cx, cy + sy / 2 + 10, cz]} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
              <span style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#ef4444',
                background: 'rgba(255,255,255,0.85)',
                padding: '0 4px',
                borderRadius: '2px'
              }}>!</span>
            </Html>
          </group>
        )
      })}
    </>
  )
}
