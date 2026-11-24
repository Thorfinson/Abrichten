import { useRef, useEffect, useState, type JSX } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore, useCanvasView, snapTargets } from '../../store/useUIStore'
import { snapToGrid } from '../../utils/geometry'
import { snapBoardToBoards, FACE_SNAP_PX } from '../../utils/snap'
import { prioritizeRaycast } from '../../utils/raycastPriority'
import { computeWorldSizeForPixels } from '../../utils/screenSize'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import { beginTransform, endTransform } from '../../utils/transformLock'
import type { Board } from '../../types/furniture'
import { useDesignLocked } from '../../hooks/useDesignLocked'
import { assemblyCounts } from '../../utils/activeParts'

// Blender-style translate gizmo — 6 arrows (3 axes × 2 directions).
const ARROW_SHAFT_LEN = 20
const ARROW_SHAFT_RADIUS = 2
const ARROW_TIP_LEN = 10
const ARROW_TIP_RADIUS = 4.5
const ARROW_OFFSET = 16
const HANDLE_PIXELS = 60

type Axis = 'x' | 'y' | 'z'

const AXIS_COLOR: Record<Axis, string> = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' }
const AXIS_HOVER: Record<Axis, string> = { x: '#dc2626', y: '#16a34a', z: '#2563eb' }

interface ArrowDef {
  axis: Axis
  sign: -1 | 1
  /** Euler rotation that points a +Y-aligned shape along the desired direction */
  rotation: [number, number, number]
}

const ARROWS: ArrowDef[] = [
  // +X / -X
  { axis: 'x', sign:  1, rotation: [0, 0, -Math.PI / 2] },
  { axis: 'x', sign: -1, rotation: [0, 0,  Math.PI / 2] },
  // +Y / -Y
  { axis: 'y', sign:  1, rotation: [0, 0, 0] },
  { axis: 'y', sign: -1, rotation: [Math.PI, 0, 0] },
  // +Z / -Z
  { axis: 'z', sign:  1, rotation: [ Math.PI / 2, 0, 0] },
  { axis: 'z', sign: -1, rotation: [-Math.PI / 2, 0, 0] }
]

/** World direction vector for an arrow's axis */
const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
}

interface ArrowProps {
  arrow: ArrowDef
  centre: [number, number, number]
  board: Board
  assemblyId: string
}

// design-lock-ok: drawn only by TranslateHandles3D, which the assembly workspace leaves out
function TranslateArrow({ arrow, centre, board, assemblyId }: ArrowProps): JSX.Element {
  const groupRef = useRef<THREE.Group>(null)
  const visibleRef = useRef<THREE.Mesh>(null)
  const { camera, gl, raycaster } = useThree()
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const snapSize = useUIStore((s) => s.snapSize)
  const [hover, setHover] = useState(false)

  const drag = useRef<{
    active: boolean
    startWorld: THREE.Vector3
    startBoardPos: { x: number; y: number; z: number }
    plane: THREE.Plane
    /** Visible boards the dragged one can snap to, collected at drag start */
    others: Board[]
  }>({
    active: false,
    startWorld: new THREE.Vector3(),
    startBoardPos: { x: 0, y: 0, z: 0 },
    plane: new THREE.Plane(),
    others: []
  })

  // Live values read by the pointer handler — kept in a ref so deps stay
  // stable. updateBoard on every move would otherwise tear the listeners
  // down after the first pointermove. See ResizeHandles3D for the pattern.
  const liveRef = useRef({ board, assemblyId, snapEnabled, snapSize, updateBoard, arrow })
  liveRef.current = { board, assemblyId, snapEnabled, snapSize, updateBoard, arrow }

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

  // Per-frame: scale to a constant pixel length
  useFrame(() => {
    if (!groupRef.current) return
    const centreVec = new THREE.Vector3(...centre)
    const target = computeWorldSizeForPixels(
      HANDLE_PIXELS, centreVec, camera, gl.domElement.clientHeight
    )
    const baseLen = ARROW_OFFSET + ARROW_SHAFT_LEN + ARROW_TIP_LEN
    groupRef.current.scale.setScalar(target / baseLen)
  })

  useEffect(() => {
    const canvas = gl.domElement
    const onMove = (e: PointerEvent): void => {
      if (!drag.current.active) return
      const live = liveRef.current
      const w = intersectPlane(e.clientX, e.clientY)
      if (!w) return
      const axis = live.arrow.axis
      const delta = w[axis] - drag.current.startWorld[axis]
      const raw = { ...live.board.position, [axis]: drag.current.startBoardPos[axis] + delta }
      // Face snap to other boards first (Alt turns it off), else grid snap / whole mm
      const face = e.altKey ? null : snapBoardToBoards(
        { ...live.board, position: raw }, drag.current.others, [axis],
        computeWorldSizeForPixels(FACE_SNAP_PX, w, camera, canvas.clientHeight)
      )
      const newPos = face?.snapped.length
        ? face.position
        : { ...raw, [axis]: live.snapEnabled ? snapToGrid(raw[axis], live.snapSize) : Math.round(raw[axis]) }
      useUIStore.getState().setSnapIndicatorPos(face?.indicator ?? null)
      live.updateBoard(live.assemblyId, live.board.id, { position: newPos })
    }
    const onUp = (): void => {
      if (!drag.current.active) return
      drag.current.active = false
      canvas.style.cursor = 'default'
      useUIStore.getState().setSnapIndicatorPos(null)
      endTransform()
      endDragHistory()
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      // Deps are stable, so this only runs on real unmount. Unmounted mid-drag
      // (board deleted, view switched …) the pointerup never arrives: end the
      // drag here, keeping the move made so far as one undo step.
      onUp()
    }
  }, [gl, camera, raycaster])

  const startDrag = (clientX: number, clientY: number, pointerId: number): void => {
    // Choose a drag-plane that contains the arrow axis and faces the camera as
    // squarely as possible. We use a plane through the centre whose normal is
    // (camera direction × arrow axis) × arrow axis — perpendicular to the
    // arrow axis but tilted toward the camera.
    const camDir = new THREE.Vector3()
    camera.getWorldDirection(camDir)
    const ax = AXIS_VEC[arrow.axis]
    const tmp = new THREE.Vector3().crossVectors(camDir, ax)
    const planeNormal = new THREE.Vector3().crossVectors(tmp, ax).normalize()
    drag.current.plane.setFromNormalAndCoplanarPoint(planeNormal, new THREE.Vector3(...centre))
    const w = intersectPlane(clientX, clientY)
    if (!w) return
    drag.current.startWorld = w.clone()
    drag.current.startBoardPos = { ...board.position }
    drag.current.others = snapTargets(useProjectStore.getState().project, useUIStore.getState(), [board.id])
    drag.current.active = true
    // Esc cancels: drop the drag state; the caller restores the pre-drag project
    beginTransform(() => {
      drag.current.active = false
      gl.domElement.style.cursor = 'default'
      useUIStore.getState().setSnapIndicatorPos(null)
    })
    beginDragHistory()
    gl.domElement.setPointerCapture(pointerId)
    gl.domElement.style.cursor = 'grabbing'
  }

  const color = hover ? AXIS_HOVER[arrow.axis] : AXIS_COLOR[arrow.axis]
  const shaftCenterY = ARROW_OFFSET + ARROW_SHAFT_LEN / 2
  const tipCenterY = ARROW_OFFSET + ARROW_SHAFT_LEN + ARROW_TIP_LEN / 2

  return (
    <group ref={groupRef} position={centre} rotation={arrow.rotation}>
      {/* Shaft */}
      <mesh
        ref={(m) => prioritizeRaycast(m)}
        position={[0, shaftCenterY, 0]}
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
        <cylinderGeometry args={[ARROW_SHAFT_RADIUS, ARROW_SHAFT_RADIUS, ARROW_SHAFT_LEN, 12]} />
        <meshStandardMaterial
          color={color} metalness={0.4} roughness={0.25}
          emissive={color} emissiveIntensity={0.2}
          depthTest={false} depthWrite={false}
        />
      </mesh>
      {/* Tip */}
      <mesh
        ref={(m) => {
          visibleRef.current = m
          prioritizeRaycast(m)
        }}
        position={[0, tipCenterY, 0]}
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
        <coneGeometry args={[ARROW_TIP_RADIUS, ARROW_TIP_LEN, 16]} />
        <meshStandardMaterial
          color={color} metalness={0.4} roughness={0.25}
          emissive={color} emissiveIntensity={hover ? 0.4 : 0.2}
          depthTest={false} depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/**
 * 6 axis-constrained translate arrows (X, Y, Z in both ±) around the board
 * centre — Blender-style. Shown in any ortho view; the third-axis arrows
 * appear edge-on or in front of the board with depthTest=false.
 */
export function TranslateHandles3D(): JSX.Element | null {
  // the assembly workspace does not move, size or turn parts (store/designLock.ts)
  const locked           = useDesignLocked()
  const project          = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const activeView       = useCanvasView()
  const activeTool       = useUIStore((s) => s.activeTool)
  const transformMode    = useUIStore((s) => s.transformMode)

  if (locked) return null
  if (activeView === '3d') return null
  if (activeTool !== 'select') return null
  if (transformMode !== 'translate') return null
  if (selectedBoardIds.length !== 1) return null

  const item = project.assemblies
    .filter(assemblyCounts)
    .flatMap((a) => a.boards.map((b) => ({ board: b, assemblyId: a.id })))
    .find((x) => x.board.id === selectedBoardIds[0])
  if (!item) return null

  const { board, assemblyId } = item
  const cx = board.position.x + board.width / 2
  const cy = board.position.y + board.height / 2
  const cz = board.position.z + board.depth / 2
  const centre: [number, number, number] = [cx, cy, cz]

  return (
    <>
      {ARROWS.map((a, i) => (
        <TranslateArrow
          key={i}
          arrow={a}
          centre={centre}
          board={board}
          assemblyId={assemblyId}
        />
      ))}
    </>
  )
}
