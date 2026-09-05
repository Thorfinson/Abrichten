import { useRef, useEffect, useState, type JSX } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { snapToGrid } from '../../utils/geometry'
import { prioritizeRaycast } from '../../utils/raycastPriority'
import { computeWorldSizeForPixels } from '../../utils/screenSize'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import { beginTransform, endTransform } from '../../utils/transformLock'
import type { Board } from '../../types/furniture'

// 6 face-anchored resize cubes (3 axes × 2 directions) — Blender-style.
// Dragging a cube moves that single face outward/inward while the opposite
// face stays fixed (edge-anchored resize).
const HANDLE_SIZE = 16
const HANDLE_HIT_SIZE = 32
const HANDLE_PIXELS = 14
const HIT_PIXELS = 26

type Axis = 'x' | 'y' | 'z'
type DimKey = 'width' | 'height' | 'depth'

const AXIS_TO_DIM: Record<Axis, DimKey> = { x: 'width', y: 'height', z: 'depth' }
const AXIS_COLOR: Record<Axis, string> = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' }
const AXIS_HOVER: Record<Axis, string> = { x: '#dc2626', y: '#16a34a', z: '#2563eb' }

interface FaceDef {
  axis: Axis
  sign: -1 | 1
}

const FACES: FaceDef[] = [
  { axis: 'x', sign:  1 }, { axis: 'x', sign: -1 },
  { axis: 'y', sign:  1 }, { axis: 'y', sign: -1 },
  { axis: 'z', sign:  1 }, { axis: 'z', sign: -1 }
]

function faceCenter(board: Board, face: FaceDef): [number, number, number] {
  const cx = board.position.x + board.width / 2
  const cy = board.position.y + board.height / 2
  const cz = board.position.z + board.depth / 2
  if (face.axis === 'x') return [board.position.x + (face.sign > 0 ? board.width : 0), cy, cz]
  if (face.axis === 'y') return [cx, board.position.y + (face.sign > 0 ? board.height : 0), cz]
  return [cx, cy, board.position.z + (face.sign > 0 ? board.depth : 0)]
}

interface CubeProps {
  face: FaceDef
  board: Board
  assemblyId: string
}

function ResizeCube({ face, board, assemblyId }: CubeProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null)
  const hitRef = useRef<THREE.Mesh>(null)
  const { camera, gl, raycaster } = useThree()
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const snapSize = useUIStore((s) => s.snapSize)
  const [label, setLabel] = useState<string | null>(null)
  const [hover, setHover] = useState(false)

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

  // Live values read inside the pointer handler — refs survive re-renders, so
  // updates to `board`, snap settings, etc. don't tear the listener down.
  // Without this the useEffect deps include `board`, and onMove calls
  // updateBoard which mutates the board → re-render → useEffect cleanup →
  // drag self-terminates after the first pointermove.
  const liveRef = useRef({ board, assemblyId, snapEnabled, snapSize, updateBoard, face })
  liveRef.current = { board, assemblyId, snapEnabled, snapSize, updateBoard, face }

  const position = faceCenter(board, face)
  const color = hover ? AXIS_HOVER[face.axis] : AXIS_COLOR[face.axis]

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

  useFrame(() => {
    if (!meshRef.current && !hitRef.current) return
    const worldPos = new THREE.Vector3(position[0], position[1], position[2])
    const target = computeWorldSizeForPixels(
      HANDLE_PIXELS, worldPos, camera, gl.domElement.clientHeight
    )
    const visibleScale = target / HANDLE_SIZE
    const hitScale = (target * (HIT_PIXELS / HANDLE_PIXELS)) / HANDLE_HIT_SIZE
    if (meshRef.current) meshRef.current.scale.setScalar(visibleScale)
    if (hitRef.current)  hitRef.current.scale.setScalar(hitScale)
  })

  useEffect(() => {
    const canvas = gl.domElement

    const onMove = (e: PointerEvent): void => {
      if (!drag.current.active) return
      const live = liveRef.current
      const w = intersectAt(e.clientX, e.clientY)
      if (!w) return
      const rawDelta = (w[live.face.axis] - drag.current.startAxisWorld) * live.face.sign
      let newDim = drag.current.startDim + rawDelta
      newDim = live.snapEnabled ? snapToGrid(newDim, live.snapSize) : Math.round(newDim)
      newDim = Math.max(1, newDim)
      setLabel(`${newDim}mm`)
      const updates: Partial<Board> = { [AXIS_TO_DIM[live.face.axis]]: newDim }
      if (live.face.sign < 0) {
        const dimDelta = newDim - drag.current.startDim
        updates.position = {
          ...live.board.position,
          [live.face.axis]: drag.current.startPos - dimDelta
        }
      }
      live.updateBoard(live.assemblyId, live.board.id, updates)
    }

    const onUp = (): void => {
      if (!drag.current.active) return
      drag.current.active = false
      canvas.style.cursor = 'default'
      setLabel(null)
      endTransform()
      endDragHistory()
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      // No drag-abort here: this cleanup only fires on true unmount because
      // deps are stable. If we cleared drag.current.active in a deps-change
      // teardown, every store update would kill the active drag.
    }
  }, [gl, camera, raycaster])

  const startDrag = (clientX: number, clientY: number, pointerId: number): void => {
    const camForward = new THREE.Vector3()
    camera.getWorldDirection(camForward)
    drag.current.plane.setFromNormalAndCoplanarPoint(
      camForward.negate(),
      new THREE.Vector3(...position)
    )
    drag.current.startDim = board[AXIS_TO_DIM[face.axis]]
    drag.current.startPos = board.position[face.axis]
    drag.current.active = true
    const start = intersectAt(clientX, clientY)
    drag.current.startAxisWorld = start
      ? start[face.axis]
      : position[face.axis === 'x' ? 0 : face.axis === 'y' ? 1 : 2]
    beginTransform()
    beginDragHistory()
    gl.domElement.setPointerCapture(pointerId)
    gl.domElement.style.cursor = 'grabbing'
  }

  const labelPos: [number, number, number] = [position[0], position[1] + 22, position[2]]

  return (
    <>
      {label && (
        <Html position={labelPos} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
          <div style={{
            background: color, color: '#fff', fontSize: '10px',
            fontFamily: 'monospace', padding: '2px 6px', borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)', whiteSpace: 'nowrap'
          }}>{label}</div>
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
          e.nativeEvent.stopPropagation() // keep MarqueeSelect from starting
          startDrag(e.nativeEvent.clientX, e.nativeEvent.clientY, e.nativeEvent.pointerId)
        }}
      >
        <boxGeometry args={[HANDLE_HIT_SIZE, HANDLE_HIT_SIZE, HANDLE_HIT_SIZE]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* Visible cube */}
      <mesh
        ref={(m) => {
          meshRef.current = m
          prioritizeRaycast(m)
        }}
        position={position}
        renderOrder={999}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0) return
          e.stopPropagation()
          e.nativeEvent.stopPropagation() // keep MarqueeSelect from starting
          startDrag(e.nativeEvent.clientX, e.nativeEvent.clientY, e.nativeEvent.pointerId)
        }}
        onPointerEnter={() => { setHover(true); gl.domElement.style.cursor = 'grab' }}
        onPointerLeave={() => {
          setHover(false)
          if (!drag.current.active) gl.domElement.style.cursor = 'default'
        }}
      >
        <boxGeometry args={[HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE]} />
        <meshStandardMaterial
          color={color}
          metalness={0.3}
          roughness={0.25}
          emissive={color}
          emissiveIntensity={hover ? 0.35 : 0.15}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

/**
 * 6 face-anchored resize cubes (all 3 axes × ±) — Blender-style.
 * Shown in any ortho view in T-mode. In a given view, two cubes per axis are
 * visible at the face centres; the third axis's pair of cubes appears at the
 * board centre overlapping (perpendicular to view).
 */
export function ResizeHandles3D(): JSX.Element | null {
  const project          = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const activeView       = useUIStore((s) => s.activeView)
  const activeTool       = useUIStore((s) => s.activeTool)
  const transformMode    = useUIStore((s) => s.transformMode)

  if (activeView === '3d') return null
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
        <ResizeCube
          key={`${face.axis}${face.sign}`}
          face={face}
          board={item.board}
          assemblyId={item.assemblyId}
        />
      ))}
    </>
  )
}
