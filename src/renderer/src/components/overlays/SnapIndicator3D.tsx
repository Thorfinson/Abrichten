import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useUIStore } from '../../store/useUIStore'
import * as THREE from 'three'

/**
 * Renders an amber pulsing cross at the snap position when snap is active and dragging.
 * Reads snapIndicatorPos from UIStore (set by Board3D during ortho drags).
 */
export function SnapIndicator3D() {
  const snapIndicatorPos = useUIStore((s) => s.snapIndicatorPos)
  const opacityRef = useRef(1)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  // Pulse the opacity
  useFrame(({ clock }) => {
    if (matRef.current && snapIndicatorPos) {
      matRef.current.opacity = 0.5 + 0.5 * Math.abs(Math.sin(clock.elapsedTime * 4))
    }
  })

  if (!snapIndicatorPos) return null

  const { x, y, z } = snapIndicatorPos
  const R = 6 // cross arm half-length in mm
  const T = 1.5 // cross thickness

  return (
    <group position={[x, y, z]}>
      {/* Horizontal arm */}
      <mesh>
        <boxGeometry args={[R * 2, T, T]} />
        <meshBasicMaterial ref={matRef} color="#f59e0b" transparent opacity={0.9} depthTest={false} />
      </mesh>
      {/* Vertical arm */}
      <mesh>
        <boxGeometry args={[T, R * 2, T]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.9} depthTest={false} />
      </mesh>
      {/* Center dot */}
      <mesh>
        <sphereGeometry args={[T * 1.5, 8, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.9} depthTest={false} />
      </mesh>
    </group>
  )
}
