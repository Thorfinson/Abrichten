import { useRef, useEffect, useState, type JSX } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { boardCorners3D } from '../../utils/projection'
import { prioritizeRaycast } from '../../utils/raycastPriority'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import { beginTransform, endTransform } from '../../utils/transformLock'
import { computeWorldSizeForPixels } from '../../utils/screenSize'
import type { Board } from '../../types/furniture'
import type { ViewMode } from '../../types/measurement'

// Blender-style rotation rings — one per axis (X, Y, Z), centred on the board.
const RING_RADIUS = 30
const RING_TUBE = 1.5
const RING_PIXELS = 90

type Axis = 'x' | 'y' | 'z'

const AXIS_COLOR: Record<Axis, string> = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' }
const AXIS_HOVER: Record<Axis, string> = { x: '#dc2626', y: '#16a34a', z: '#2563eb' }

/** Torus default lies in XY plane (perpendicular to Z). To get a ring AROUND
 *  an axis, the torus must lie in the plane perpendicular to that axis. */
const RING_ROTATION: Record<Axis, [number, number, number]> = {
  x: [0, Math.PI / 2, 0], // ring in YZ plane
  y: [Math.PI / 2, 0, 0], // ring in XZ plane
  z: [0, 0, 0]            // ring in XY plane (default)
}

/** Plane the rotation happens in (used for raycasting drag start/move). */
const ROTATION_PLANE_NORMAL: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0), // YZ plane normal = +X
  y: new THREE.Vector3(0, 1, 0), // XZ plane normal = +Y
  z: new THREE.Vector3(0, 0, 1)  // XY plane normal = +Z
}

/** Project a world point to 2D in the rotation plane (u, v). */
function toPlaneCoords(p: THREE.Vector3, axis: Axis): { u: number; v: number } {
  // u = first axis of plane, v = second
  switch (axis) {
    case 'x': return { u: p.z, v: p.y }   // YZ plane: u=z, v=y
    case 'y': return { u: p.x, v: p.z }   // XZ plane
    case 'z': return { u: p.x, v: p.y }   // XY plane
  }
}

interface RingProps {
  axis: Axis
  centre: [number, number, number]
  board: Board
  assemblyId: string
}

function RotationRing({ axis, centre, board, assemblyId }: RingProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera, gl, raycaster } = useThree()
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const [hover, setHover] = useState(false)
  const [angleDeg, setAngleDeg] = useState<number | null>(null)

  const drag = useRef<{
    active: boolean
    startU: number
    startV: number
    startRotation: number
    plane: THREE.Plane
  }>({
    active: false,
    startU: 0,
    startV: 0,
    startRotation: 0,
    plane: new THREE.Plane()
  })

  // Live values for the pointer handler — kept in a ref so updates don't
  // tear the listeners down mid-drag. See ResizeHandles3D for the same
  // anti-pattern this guards against.
  const liveRef = useRef({ board, assemblyId, snapEnabled, updateBoard, axis })
  liveRef.current = { board, assemblyId, snapEnabled, updateBoard, axis }

  const intersectPlane = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
    const target = new THREE.Vector3()
    return raycaster.ray.intersectPlane(drag.current.plane, target)
  }

  // Per-frame: keep ring at a constant pixel diameter
  useFrame(() => {
    if (!meshRef.current) return
    const targetWorld = computeWorldSizeForPixels(
      RING_PIXELS, meshRef.current.position, camera, gl.domElement.clientHeight
    )
    meshRef.current.scale.setScalar(targetWorld / (RING_RADIUS * 2))
  })

  useEffect(() => {
    const canvas = gl.domElement

    const onMove = (e: PointerEvent): void => {
      if (!drag.current.active) return
      const live = liveRef.current
      const w = intersectPlane(e.clientX, e.clientY)
      if (!w) return
      const coords = toPlaneCoords(w, live.axis)
      const currentAngle = Math.atan2(coords.v - drag.current.startV, coords.u - drag.current.startU) * 180 / Math.PI
      const baseAngle = Math.atan2(0, 1) * 180 / Math.PI // 0
      let deltaAngle = currentAngle - baseAngle
      while (deltaAngle > 180) deltaAngle -= 360
      while (deltaAngle < -180) deltaAngle += 360
      if (live.snapEnabled) deltaAngle = Math.round(deltaAngle / 90) * 90
      const newAngle = Math.round(drag.current.startRotation + deltaAngle)
      live.updateBoard(live.assemblyId, live.board.id, {
        rotation: { ...live.board.rotation, [live.axis]: newAngle }
      })
      setAngleDeg(((newAngle % 360) + 360) % 360)
    }
    const onUp = (): void => {
      if (!drag.current.active) return
      drag.current.active = false
      canvas.style.cursor = 'default'
      setAngleDeg(null)
      endTransform()
      endDragHistory()
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      // No drag-abort: cleanup only fires on real unmount. See ResizeHandles3D.
    }
  }, [gl, camera, raycaster])

  const colorBase  = AXIS_COLOR[axis]
  const colorHover = AXIS_HOVER[axis]

  return (
    <group>
      {angleDeg !== null && (
        <Html position={centre} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
          <div style={{
            background: colorBase, color: '#fff', fontSize: '11px',
            fontFamily: 'monospace', padding: '3px 7px', borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
            transform: 'translateY(-50px)'
          }}>
            {axis.toUpperCase()}: {Math.round(angleDeg)}°
          </div>
        </Html>
      )}
      <mesh
        ref={(m) => {
          meshRef.current = m
          prioritizeRaycast(m)
        }}
        position={centre}
        rotation={RING_ROTATION[axis]}
        renderOrder={999}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0) return
          e.stopPropagation()
          e.nativeEvent.stopPropagation() // keep MarqueeSelect from starting
          drag.current.plane = new THREE.Plane(
            ROTATION_PLANE_NORMAL[axis].clone(),
            -ROTATION_PLANE_NORMAL[axis].dot(new THREE.Vector3(...centre))
          )
          const w = intersectPlane(e.nativeEvent.clientX, e.nativeEvent.clientY)
          if (!w) return
          const centreVec = new THREE.Vector3(...centre)
          const c = toPlaneCoords(centreVec, axis)
          const p = toPlaneCoords(w, axis)
          drag.current.startU = c.u
          drag.current.startV = c.v
          // Set baseline so that current pointer angle = 0 initially
          drag.current.startU = c.u + (p.u - c.u)
          drag.current.startV = c.v + (p.v - c.v)
          drag.current.startRotation = board.rotation[axis]
          drag.current.active = true
          beginTransform()
          beginDragHistory()
          gl.domElement.setPointerCapture(e.nativeEvent.pointerId)
          gl.domElement.style.cursor = 'grabbing'
        }}
        onPointerEnter={() => {
          setHover(true)
          gl.domElement.style.cursor = 'grab'
          if (meshRef.current) (meshRef.current.material as THREE.MeshStandardMaterial).color.set(colorHover)
        }}
        onPointerLeave={() => {
          setHover(false)
          if (!drag.current.active) gl.domElement.style.cursor = 'default'
          if (meshRef.current) (meshRef.current.material as THREE.MeshStandardMaterial).color.set(colorBase)
        }}
      >
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 12, 64]} />
        <meshStandardMaterial
          color={colorBase}
          metalness={0.4}
          roughness={0.25}
          emissive={colorBase}
          emissiveIntensity={hover ? 0.4 : 0.25}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/**
 * Three rotation rings (X, Y, Z) centred on the board — Blender-style.
 * Shown in any ortho view; each ring rotates around its own world axis.
 * In ortho views, two of the three rings appear edge-on (as thin lines)
 * which still acts as a clickable strip for rotating around those axes.
 */
export function RotationHandle3D(): JSX.Element | null {
  const project          = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const activeView       = useUIStore((s) => s.activeView)
  const activeTool       = useUIStore((s) => s.activeTool)
  const transformMode    = useUIStore((s) => s.transformMode)

  if (activeView === '3d') return null
  if (activeTool !== 'select') return null
  if (transformMode !== 'rotate') return null
  if (selectedBoardIds.length !== 1) return null

  const item = project.assemblies
    .filter((a) => a.visible !== false)
    .flatMap((a) => a.boards.map((b) => ({ board: b, assemblyId: a.id })))
    .find((x) => x.board.id === selectedBoardIds[0])
  if (!item) return null

  const { board, assemblyId } = item
  const corners = boardCorners3D(board)
  let cx = 0, cy = 0, cz = 0
  for (const c of corners) { cx += c.x; cy += c.y; cz += c.z }
  cx /= 8; cy /= 8; cz /= 8
  const centre: [number, number, number] = [cx, cy, cz]

  return (
    <>
      <RotationRing axis="x" centre={centre} board={board} assemblyId={assemblyId} />
      <RotationRing axis="y" centre={centre} board={board} assemblyId={assemblyId} />
      <RotationRing axis="z" centre={centre} board={board} assemblyId={assemblyId} />
    </>
  )
}
