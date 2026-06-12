import { useRef, useEffect, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { snapToGrid } from '../../utils/geometry'
import { prioritizeRaycast } from '../../utils/raycastPriority'
import { beginTransform, endTransform } from '../../utils/transformLock'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import { computeWorldSizeForPixels } from '../../utils/screenSize'
import type { Board } from '../../types/furniture'

// Baseline mm — rescaled per frame to HANDLE_PIXELS / HIT_PIXELS on screen.
const HANDLE_SIZE = 18
const HANDLE_HIT_SIZE = 32
const HANDLE_PIXELS = 16
const HIT_PIXELS = 28
const HANDLE_COLOR = '#22c55e'
const HANDLE_HOVER = '#16a34a'

type Axis = 'x' | 'y' | 'z'
type DimKey = 'width' | 'height' | 'depth'

interface FaceDef {
  axis: Axis
  sign: -1 | 1
  dim: DimKey
}

const FACES: FaceDef[] = [
  { axis: 'x', sign: -1, dim: 'width'  },
  { axis: 'x', sign:  1, dim: 'width'  },
  { axis: 'y', sign: -1, dim: 'height' },
  { axis: 'y', sign:  1, dim: 'height' },
  { axis: 'z', sign: -1, dim: 'depth'  },
  { axis: 'z', sign:  1, dim: 'depth'  }
]

function faceCenter(board: Board, face: FaceDef): [number, number, number] {
  const cx = board.position.x + board.width / 2
  const cy = board.position.y + board.height / 2
  const cz = board.position.z + board.depth / 2
  if (face.axis === 'x') {
    return [board.position.x + (face.sign > 0 ? board.width : 0), cy, cz]
  }
  if (face.axis === 'y') {
    return [cx, board.position.y + (face.sign > 0 ? board.height : 0), cz]
  }
  return [cx, cy, board.position.z + (face.sign > 0 ? board.depth : 0)]
}

interface FaceHandleProps {
  board: Board
  assemblyId: string
  face: FaceDef
}

function FaceHandle({ board, assemblyId, face }: FaceHandleProps): JSX.Element {
  const { camera, gl, raycaster } = useThree()
  // OrbitControls registers itself as the default controls when makeDefault
  // is set (see UnifiedCanvas). We toggle .enabled around our own drag so
  // the camera doesn't orbit while the user pulls a face.
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const snapSize   = useUIStore((s) => s.snapSize)
  const [label, setLabel] = useState<string | null>(null)

  const visibleRef = useRef<THREE.Mesh>(null)
  const hitRef = useRef<THREE.Mesh>(null)
  const drag = useRef<{
    active: boolean
    startAxisWorld: number
    startDim: number
    startPos: number
    plane: THREE.Plane
  }>({
    active: false,
    startAxisWorld: 0,
    startDim: 0,
    startPos: 0,
    plane: new THREE.Plane()
  })

  const position = faceCenter(board, face)

  const intersectAt = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
    const out = new THREE.Vector3()
    return raycaster.ray.intersectPlane(drag.current.plane, out)
  }

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerMove = (e: PointerEvent): void => {
      if (!drag.current.active) return
      const world = intersectAt(e.clientX, e.clientY)
      if (!world) return
      const rawDelta = (world[face.axis] - drag.current.startAxisWorld) * face.sign
      let newDim = drag.current.startDim + rawDelta
      newDim = snapEnabled ? snapToGrid(newDim, snapSize) : Math.round(newDim)
      newDim = Math.max(1, newDim)
      setLabel(`${newDim}mm`)

      const updates: Partial<Board> = { [face.dim]: newDim }
      if (face.sign < 0) {
        // Dragging the negative-side face: the opposite (positive) side stays
        // fixed, so board.position on this axis shifts opposite to the growth.
        const dimDelta = newDim - drag.current.startDim
        updates.position = {
          ...board.position,
          [face.axis]: drag.current.startPos - dimDelta
        }
      }
      updateBoard(assemblyId, board.id, updates)
    }

    const onPointerUp = (): void => {
      if (!drag.current.active) return
      drag.current.active = false
      canvas.style.cursor = 'default'
      setLabel(null)
      if (controls) controls.enabled = true
      endTransform()
      endDragHistory()
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      // If the component unmounts mid-drag (mode/selection change, etc.),
      // restore orbit + cursor so the canvas isn't left in a broken state.
      if (drag.current.active) {
        drag.current.active = false
        canvas.style.cursor = 'default'
        if (controls) controls.enabled = true
        endTransform()
        endDragHistory()
      }
    }
  }, [board, assemblyId, face, gl, camera, raycaster, snapEnabled, snapSize, updateBoard, controls])

  // Per-frame: rescale only — keep position at the face centre from props.
  useFrame(() => {
    if (!visibleRef.current && !hitRef.current) return
    const worldPos = new THREE.Vector3(position[0], position[1], position[2])
    const targetWorld = computeWorldSizeForPixels(
      HANDLE_PIXELS, worldPos, camera, gl.domElement.clientHeight
    )
    const visibleScale = targetWorld / HANDLE_SIZE
    const hitScale = (targetWorld * (HIT_PIXELS / HANDLE_PIXELS)) / HANDLE_HIT_SIZE
    if (visibleRef.current) visibleRef.current.scale.setScalar(visibleScale)
    if (hitRef.current)     hitRef.current.scale.setScalar(hitScale)
  })

  const startDrag = (clientX: number, clientY: number, pointerId: number): void => {
    const camForward = new THREE.Vector3()
    camera.getWorldDirection(camForward)
    drag.current.plane.setFromNormalAndCoplanarPoint(
      camForward.negate(),
      new THREE.Vector3(...position)
    )
    drag.current.startDim = board[face.dim]
    drag.current.startPos = board.position[face.axis]
    drag.current.active = true
    const start = intersectAt(clientX, clientY)
    drag.current.startAxisWorld = start ? start[face.axis] : position[
      face.axis === 'x' ? 0 : face.axis === 'y' ? 1 : 2
    ]
    if (controls) controls.enabled = false
    beginTransform()
    beginDragHistory()
    gl.domElement.setPointerCapture(pointerId)
    gl.domElement.style.cursor = 'grabbing'
  }

  const labelPos: [number, number, number] = [position[0], position[1] + 22, position[2]]

  return (
    <>
      {label && (
        <Html
          position={labelPos}
          center
          style={{ pointerEvents: 'none' }}
          zIndexRange={[100, 0]}
        >
          <div
            style={{
              background: HANDLE_COLOR,
              color: '#fff',
              fontSize: '10px',
              fontFamily: 'monospace',
              padding: '2px 6px',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap'
            }}
          >
            {label}
          </div>
        </Html>
      )}
      {/* Invisible larger hit area */}
      <mesh
        position={position}
        ref={(m) => {
          hitRef.current = m
          prioritizeRaycast(m)
        }}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0) return
          e.stopPropagation()
          startDrag(e.nativeEvent.clientX, e.nativeEvent.clientY, e.nativeEvent.pointerId)
        }}
      >
        <boxGeometry args={[HANDLE_HIT_SIZE, HANDLE_HIT_SIZE, HANDLE_HIT_SIZE]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Visible handle cube */}
      <mesh
        ref={(m) => {
          visibleRef.current = m
          prioritizeRaycast(m)
        }}
        position={position}
        renderOrder={999}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0) return
          e.stopPropagation()
          startDrag(e.nativeEvent.clientX, e.nativeEvent.clientY, e.nativeEvent.pointerId)
        }}
        onPointerEnter={() => {
          gl.domElement.style.cursor = 'grab'
          if (visibleRef.current) {
            (visibleRef.current.material as THREE.MeshStandardMaterial).color.set(HANDLE_HOVER)
          }
        }}
        onPointerLeave={() => {
          if (!drag.current.active) gl.domElement.style.cursor = 'default'
          if (visibleRef.current) {
            (visibleRef.current.material as THREE.MeshStandardMaterial).color.set(HANDLE_COLOR)
          }
        }}
      >
        <boxGeometry args={[HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE]} />
        <meshStandardMaterial
          color={HANDLE_COLOR}
          metalness={0.3}
          roughness={0.25}
          emissive={HANDLE_COLOR}
          emissiveIntensity={0.15}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

/**
 * 3D face-resize handles: 6 cubes (one per box face) on the selected board.
 * Dragging a handle moves that single face outward/inward while the opposite
 * face stays fixed. Always visible in 3D when a single board is selected —
 * mirrors the always-on resize handles in 2D ortho views.
 *
 * TransformControls' own scale gizmo is hidden in T-mode (see Board3D.tsx)
 * so the two don't compete. G/R modes show TC's translate/rotate gizmo
 * alongside the face handles — they don't overlap visually.
 */
export function FaceHandles3D(): JSX.Element | null {
  const project          = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const activeView       = useUIStore((s) => s.activeView)
  const activeTool       = useUIStore((s) => s.activeTool)
  const transformMode    = useUIStore((s) => s.transformMode)

  if (activeView !== '3d') return null
  if (activeTool !== 'select') return null
  if (transformMode !== 'scale') return null
  if (selectedBoardIds.length !== 1) return null

  const item = project.assemblies
    .filter((a) => a.visible !== false)
    .flatMap((a) => a.boards.map((b) => ({ board: b, assemblyId: a.id })))
    .find((x) => x.board.id === selectedBoardIds[0])

  if (!item) return null

  return (
    <>
      {FACES.map((face) => (
        <FaceHandle
          key={`${face.axis}${face.sign}`}
          board={item.board}
          assemblyId={item.assemblyId}
          face={face}
        />
      ))}
    </>
  )
}
