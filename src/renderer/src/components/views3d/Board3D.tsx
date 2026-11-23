import React, { memo, useRef, useEffect, useMemo, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useTranslation } from 'react-i18next'
import { useUIStore, useCanvasView, shownStep, snapTargets } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { TransformControls, Line, Html } from '@react-three/drei'
import { snapToGrid } from '../../utils/geometry'
import { snapBoardToBoards, FACE_SNAP_PX, type SnapAxis } from '../../utils/snap'
import { computeWorldSizeForPixels } from '../../utils/screenSize'
import { buildBoardGeometry } from '../../utils/boardGeometry'
import { boardStepState } from '../../utils/assemblySteps'
import { getMaterialById } from '../../data/materials'
import { beginTransform, endTransform } from '../../utils/transformLock'
import { setHoveringGizmo, isHoveringGizmo } from '../../utils/gizmoHover'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import type { Board, Vec3 } from '../../types/furniture'
import type { ViewMode } from '../../types/measurement'
import * as THREE from 'three'
import { useDesignLocked } from '../../hooks/useDesignLocked'

interface Board3DProps {
  board: Board
  assemblyId: string
  orbitRef?: React.RefObject<any>
  /** X-ray group highlight: edges drawn on top of all other geometry */
  highlight?: boolean
  /** Another assembly is highlighted — ghost this board so it reads through */
  dimmed?: boolean
  /** Joints of this board in visible assemblies (badge when joint markers are on) */
  jointCount?: number
}

/** Pointer travel (px) above which a right-button release is a pan, not a context-menu click */
const CONTEXT_MENU_MAX_DELTA = 4

/** Axis constraints for dragging in each ortho view */
const DRAG_AXES: Record<Exclude<ViewMode, '3d'>, { u: 'x' | 'y' | 'z'; v: 'x' | 'y' | 'z' }> = {
  front: { u: 'x', v: 'y' },
  side:  { u: 'z', v: 'y' },
  top:   { u: 'x', v: 'z' }
}

/** Normal direction for the drag plane in each ortho view */
const DRAG_PLANE_NORMALS: Record<Exclude<ViewMode, '3d'>, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  side:  new THREE.Vector3(1, 0, 0),
  top:   new THREE.Vector3(0, 1, 0)
}

/** Edge line material per board colour: the board colour, much darker, so a
 *  cabinet's parts read apart on light and dark backgrounds. Shared by all
 *  boards of a colour (never disposed: a handful of colours per project). */
const edgeMaterials = new Map<string, THREE.LineBasicMaterial>()
function edgeMaterial(color: string, dimmed: boolean): THREE.LineBasicMaterial {
  const key = `${color}|${dimmed}`
  let m = edgeMaterials.get(key)
  if (!m) {
    m = new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(0.3),
      transparent: dimmed,
      opacity: dimmed ? 0.35 : 1,
      depthWrite: !dimmed
    })
    edgeMaterials.set(key, m)
  }
  return m
}

/** The other visible boards a drag can snap to (not the ones being moved; store snapTargets). */
function snapCandidates(moving: string[]): Board[] {
  return snapTargets(useProjectStore.getState().project, useUIStore.getState(), moving)
}

/** Memoized: the store keeps unchanged boards' object identity, so a drag or
 *  edit re-renders only the board that changed instead of every board. */
/**
 * A board in the scene. In assembly mode (Montage) it follows the step shown:
 * installed in an earlier step → ghosted like an X-ray backdrop, in this step →
 * highlighted like an X-ray group, not installed yet → not drawn. Same rendering
 * as the assembly X-ray, decided per board.
 */
export const Board3D = memo(function Board3D(props: Board3DProps) {
  const current = useUIStore(shownStep)
  const steps = useProjectStore((s) => s.project.assemblySteps)
  const state = boardStepState(steps, current, props.board.id)
  // the eye hides parts in the design workspace only (store/useUIStore viewHiddenIds)
  const eyeHidden = useUIStore((s) => s.workspace !== 'assembly' && s.hiddenParts.includes(props.board.id))
  if (state === 'hidden' || eyeHidden) return null
  if (state === 'normal') return <Board3DBody {...props} />
  return <Board3DBody {...props} highlight={state === 'current'} dimmed={state === 'earlier'} />
})

const Board3DBody = memo(function Board3DBody({ board, assemblyId, orbitRef, highlight = false, dimmed = false, jointCount = 0 }: Board3DProps) {
  const { t } = useTranslation()
  const meshRef = useRef<THREE.Mesh>(null)
  const transformRef = useRef<any>(null)
  /** True while a TransformControls drag of this board is in progress */
  const tcDragRef = useRef(false)
  const dragStartPosRef = useRef<THREE.Vector3>(new THREE.Vector3())
  const dragStartDimsRef = useRef<{ width: number; height: number; depth: number }>({ width: 0, height: 0, depth: 0 })
  const scaleDraggingRef = useRef<boolean>(false)

  const staticGhost = useUIStore((s) => s.showStaticOverlay)

  // Ghost drag preview state
  const [isDragging, setIsDragging] = useState(false)
  const ghostPos = useRef<{ x: number; y: number; z: number } | null>(null)

  // Ortho drag state
  const orthoDrag = useRef<{
    active: boolean
    startWorldPos: THREE.Vector3
    startBoardPos: { x: number; y: number; z: number }
    /** Boards the drag can snap to, collected at drag start */
    others: Board[]
  }>({ active: false, startWorldPos: new THREE.Vector3(), startBoardPos: { x: 0, y: 0, z: 0 }, others: [] })

  // Derived selectors: a selection change re-renders only the boards whose state flips
  const isSelected = useUIStore((s) => s.selectedBoardIds.includes(board.id))
  const isPrimary = useUIStore((s) => s.selectedBoardIds.length === 1 && s.selectedBoardIds[0] === board.id)
  const selectBoard = useUIStore((s) => s.selectBoard)
  const toggleBoardSelection = useUIStore((s) => s.toggleBoardSelection)
  const transformMode = useUIStore((s) => s.transformMode)
  const activeView = useCanvasView()
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const snapSize = useUIStore((s) => s.snapSize)
  const setSnapIndicatorPos = useUIStore((s) => s.setSnapIndicatorPos)
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const nudgeBoards = useProjectStore((s) => s.nudgeBoards)
  // the assembly workspace selects parts, it does not move them (store/designLock.ts)
  const locked = useDesignLocked()
  const showJointMarkers = useUIStore((s) => s.showJointMarkers)
  const customMaterials = useProjectStore((s) => s.project.customMaterials)
  const isOrtho = activeView !== '3d'
  /** TransformControls are shown for the single selected board in the 3D view */
  const showTC = !isOrtho && isPrimary && !locked

  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const raycaster = useThree((s) => s.raycaster)

  // Drag plane for ortho views: positioned at board center, perpendicular to camera
  const dragPlane = useMemo(() => {
    if (!isOrtho) return null
    const normal = DRAG_PLANE_NORMALS[activeView as Exclude<ViewMode, '3d'>]
    if (!normal) return null
    return new THREE.Plane(normal, 0)
  }, [activeView, isOrtho])

  /** Raycast pointer onto the ortho drag plane, returns world position or null.
   *  Reads the *current* dragPlane via orthoLiveRef so listeners that re-use
   *  this function across view switches see the latest plane. */
  const raycastToPlane = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const plane = orthoLiveRef.current?.dragPlane ?? dragPlane
    if (!plane) return null
    const rect = gl.domElement.getBoundingClientRect()
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
    const target = new THREE.Vector3()
    const hit = raycaster.ray.intersectPlane(plane, target)
    return hit
  }

  // Detach TransformControls on unmount to prevent "object not in scene graph" errors
  useEffect(() => {
    return () => { transformRef.current?.detach() }
  }, [])

  // When this board loses its gizmo (deselected, another board became
  // primary, or an ortho view), clear the gizmo-hover flag so it can't get
  // stuck at true and block selection on every other board.
  useEffect(() => {
    if (!showTC) setHoveringGizmo(false)
  }, [showTC])

  /** Put the mesh back where the store says the board is — after an aborted
   *  drag moved it imperatively (TransformControls or ortho drag). */
  const resetMeshFromBoard = (): void => {
    const m = meshRef.current
    const b = orthoLiveRef.current.board
    if (!m) return
    m.position.set(b.position.x + b.width / 2, b.position.y + b.height / 2, b.position.z + b.depth / 2)
    m.rotation.set((b.rotation.x * Math.PI) / 180, (b.rotation.y * Math.PI) / 180, (b.rotation.z * Math.PI) / 180)
    m.scale.set(1, 1, 1)
  }

  /** Esc during a TransformControls drag: stop TC, drop the uncommitted move. */
  const cancelTcDrag = (): void => {
    tcDragRef.current = false
    scaleDraggingRef.current = false
    // Clearing TC's dragging flag stops its move handling, skips the mouseUp
    // commit and (via 'dragging-changed') re-enables the default controls.
    if (transformRef.current) transformRef.current.dragging = false
    if (orbitRef?.current) orbitRef.current.enabled = true
    resetMeshFromBoard()
  }

  // TransformControls unmounting mid-drag (deselect, view switch, delete …)
  // never fires onMouseUp: end the drag here so the drag lock, the paused
  // undo history and the disabled OrbitControls don't stay stuck.
  useEffect(() => {
    if (!showTC) return
    // A pointer that leaves the canvas never un-hovers TC's axis — clear it
    // so the gizmo-hover flag doesn't block clicks in other quadrants.
    const canvas = gl.domElement
    const onLeave = (): void => {
      if (!tcDragRef.current && transformRef.current) transformRef.current.axis = null
    }
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      canvas.removeEventListener('pointerleave', onLeave)
      if (!tcDragRef.current) return
      tcDragRef.current = false
      scaleDraggingRef.current = false
      if (orbitRef?.current) orbitRef.current.enabled = true
      resetMeshFromBoard()
      endTransform()
      endDragHistory()
    }
  }, [showTC, gl]) // eslint-disable-line react-hooks/exhaustive-deps


  // TC drag handler — drei rewires it onto every fresh TransformControlsImpl
  // it creates internally (which can happen on re-renders), so we pass it as
  // a prop instead of attaching with addEventListener on an instance ref.
  const handleDraggingChanged = (event: any): void => {
    if (orbitRef?.current) {
      orbitRef.current.enabled = !event.value
    }
    if (event.value) {
      tcDragRef.current = true
      beginTransform(cancelTcDrag)
      beginDragHistory()
    } else {
      if (!tcDragRef.current) return // cancelled with Esc: nothing to commit
      tcDragRef.current = false
      endTransform()
      endDragHistory()
    }

    if (event.value && meshRef.current) {
      dragStartPosRef.current.copy(meshRef.current.position)
      dragStartDimsRef.current = {
        width: board.width,
        height: board.height,
        depth: board.depth
      }
      scaleDraggingRef.current = transformMode === 'scale'
      return
    }

    if (!event.value && meshRef.current) {
      const pos = meshRef.current.position
      const rot = meshRef.current.rotation

      if (transformMode === 'translate') {
        const delta = pos.clone().sub(dragStartPosRef.current)
        const snap = (v: number) => snapEnabled
          ? Math.round(v / snapSize) * snapSize
          : Math.round(v)
        updateBoard(assemblyId, board.id, {
          position: {
            x: snap(board.position.x + delta.x),
            y: snap(board.position.y + delta.y),
            z: snap(board.position.z + delta.z)
          }
        })
      } else if (transformMode === 'rotate') {
        updateBoard(assemblyId, board.id, {
          rotation: {
            x: Math.round((rot.x * 180) / Math.PI),
            y: Math.round((rot.y * 180) / Math.PI),
            z: Math.round((rot.z * 180) / Math.PI)
          }
        })
      } else if (transformMode === 'scale') {
        const sx = meshRef.current.scale.x
        const sy = meshRef.current.scale.y
        const sz = meshRef.current.scale.z
        const startDims = dragStartDimsRef.current

        const newWidth  = Math.max(1, Math.round(startDims.width  * sx))
        const newHeight = Math.max(1, Math.round(startDims.height * sy))
        const newDepth  = Math.max(1, Math.round(startDims.depth  * sz))

        meshRef.current.scale.set(1, 1, 1)
        scaleDraggingRef.current = false

        if (newWidth === startDims.width && newHeight === startDims.height && newDepth === startDims.depth) {
          return
        }

        updateBoard(assemblyId, board.id, {
          width: newWidth,
          height: newHeight,
          depth: newDepth
        })
      }
    }
  }

  // Per-frame work: (1) keep the min-corner anchored during a scale drag,
  // (2) mirror TC's hovered axis into the global gizmo-hover flag so a click
  //     on a gizmo handle doesn't fall through to the board behind it.
  useFrame(() => {
    if (showTC) {
      const axis = transformRef.current?.axis
      setHoveringGizmo(axis !== null && axis !== undefined)
    }

    if (!scaleDraggingRef.current || !meshRef.current) return
    const start = dragStartDimsRef.current
    const startPos = dragStartPosRef.current
    const sx = meshRef.current.scale.x
    const sy = meshRef.current.scale.y
    const sz = meshRef.current.scale.z
    meshRef.current.position.x = startPos.x + ((sx - 1) * start.width)  / 2
    meshRef.current.position.y = startPos.y + ((sy - 1) * start.height) / 2
    meshRef.current.position.z = startPos.z + ((sz - 1) * start.depth)  / 2
  })

  // Live state for the ortho pointer handlers — refs so listener deps stay
  // stable. selectBoard() inside handleOrthoPointerDown updates
  // selectedBoardIds, which would otherwise rebind the listeners mid-press
  // and (combined with setSnapIndicatorPos's UI re-renders) interrupt drags.
  const orthoLiveRef = useRef({
    isOrtho, activeTool, activeView, board, assemblyId,
    snapEnabled, snapSize, updateBoard, nudgeBoards, setSnapIndicatorPos, dragPlane
  })
  orthoLiveRef.current = {
    isOrtho, activeTool, activeView, board, assemblyId,
    snapEnabled, snapSize, updateBoard, nudgeBoards, setSnapIndicatorPos, dragPlane
  }

  /** Drop the local ortho-drag state and the visual offset (abort, not commit). */
  const resetOrthoDrag = (): void => {
    orthoDrag.current.active = false
    setIsDragging(false)
    orthoLiveRef.current.setSnapIndicatorPos(null)
    resetMeshFromBoard()
  }

  // Ortho view pointer drag handlers — mounted once per canvas. Handlers read
  // live state via orthoLiveRef.current so a board update never tears them down.
  useEffect(() => {
    const canvas = gl.domElement

    /** Board position for the pointer: face snap to other boards first (Alt
     *  turns it off), grid snap or whole mm on the axes that did not snap. */
    const dragTarget = (e: PointerEvent, worldPos: THREE.Vector3): { position: Vec3; indicator: Vec3 | null } => {
      const live = orthoLiveRef.current
      const axes = DRAG_AXES[live.activeView as Exclude<ViewMode, '3d'>]
      const { startBoardPos: sp, startWorldPos: sw, others } = orthoDrag.current
      const raw = { ...sp }
      raw[axes.u] += worldPos[axes.u] - sw[axes.u]
      raw[axes.v] += worldPos[axes.v] - sw[axes.v]
      const dragAxes: SnapAxis[] = [axes.u, axes.v]
      const face = e.altKey ? null : snapBoardToBoards(
        { ...live.board, position: raw }, others, dragAxes,
        computeWorldSizeForPixels(FACE_SNAP_PX, worldPos, camera, gl.domElement.clientHeight)
      )
      const position = face ? face.position : raw
      for (const a of dragAxes) {
        if (face?.snapped.includes(a)) continue
        position[a] = live.snapEnabled ? snapToGrid(position[a], live.snapSize) : Math.round(position[a])
      }
      const b = live.board
      const centre = { x: position.x + b.width / 2, y: position.y + b.height / 2, z: position.z + b.depth / 2 }
      return { position, indicator: face?.indicator ?? (live.snapEnabled ? centre : null) }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!orthoDrag.current.active) return
      const live = orthoLiveRef.current
      if (!live.isOrtho || live.activeTool !== 'select') return
      const worldPos = raycastToPlane(e.clientX, e.clientY)
      if (!worldPos || !meshRef.current) return

      // Move mesh visually during drag (commit on pointerup)
      const { position, indicator } = dragTarget(e, worldPos)
      const b = live.board
      meshRef.current.position.set(position.x + b.width / 2, position.y + b.height / 2, position.z + b.depth / 2)
      live.setSnapIndicatorPos(indicator)
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!orthoDrag.current.active) return
      const live = orthoLiveRef.current
      orthoDrag.current.active = false
      setIsDragging(false)
      live.setSnapIndicatorPos(null)

      const worldPos = raycastToPlane(e.clientX, e.clientY)
      if (!worldPos) {
        endTransform()
        endDragHistory()
        return
      }

      // A multi-selection moves by the dragged board's (snapped) move
      const { position } = dragTarget(e, worldPos)
      const sp = orthoDrag.current.startBoardPos
      const { selectedBoardIds, selectedAssemblyId } = useUIStore.getState()
      if (selectedBoardIds.length > 1 && selectedBoardIds.includes(live.board.id) && selectedAssemblyId) {
        live.nudgeBoards(selectedAssemblyId, selectedBoardIds, { x: position.x - sp.x, y: position.y - sp.y, z: position.z - sp.z })
      } else {
        live.updateBoard(live.assemblyId, live.board.id, { position })
      }

      endTransform()
      endDragHistory()
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      // Unmount or camera switch mid-drag: the pointerup will never reach us
      if (orthoDrag.current.active) {
        resetOrthoDrag()
        endTransform()
        endDragHistory()
      }
    }
  }, [gl, camera, raycaster]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOrthoPointerDown = (e: any) => {
    if (!isOrtho || activeTool !== 'select') return
    // Only left-click drag
    if (e.nativeEvent.button !== 0) return
    e.stopPropagation()
    // Also stop the NATIVE event: MarqueeSelect listens on the canvas
    // container, and boards live in the same <canvas> element — without this
    // a board drag silently runs the marquee and re-selects on pointerup.
    e.nativeEvent.stopPropagation()

    // Select first
    if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) {
      toggleBoardSelection(assemblyId, board.id)
    } else if (!isSelected) {
      selectBoard(assemblyId, board.id)
    }
    if (locked) return

    // Start ortho drag
    const worldPos = raycastToPlane(e.nativeEvent.clientX, e.nativeEvent.clientY)
    if (worldPos) {
      ghostPos.current = { ...board.position }
      // a multi-selection drag moves all selected boards: none of them is a snap target
      const { selectedBoardIds } = useUIStore.getState()
      orthoDrag.current = {
        active: true,
        startWorldPos: worldPos.clone(),
        startBoardPos: { ...board.position },
        others: snapCandidates(selectedBoardIds.includes(board.id) ? selectedBoardIds : [board.id])
      }
      setIsDragging(true)
      beginTransform(resetOrthoDrag)
      beginDragHistory()
      gl.domElement.setPointerCapture(e.nativeEvent.pointerId)
    }
  }

  // Board geometry: plain box, or an extruded outline with holes and edge notches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boardGeometry = useMemo(() => buildBoardGeometry(board), [board.width, board.height, board.depth, board.cutouts])

  useEffect(() => () => boardGeometry.dispose(), [boardGeometry])

  // Outline of the board (also around holes and notches), drawn over the faces
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(boardGeometry), [boardGeometry])
  useEffect(() => () => edgesGeometry.dispose(), [edgesGeometry])

  // Grain direction arrow: half-length arrow along the grain axis
  const grainArrow = useMemo(() => {
    const dir = board.grainDirection
    const mat = getMaterialById(board.materialId, customMaterials)
    if (!dir || !mat?.grain) return null
    const hw = board.width / 2
    const hh = board.height / 2
    const hd = board.depth / 2
    const arrowLen = Math.min(hw, hh, hd) * 0.7
    if (dir === 'width')  return { from: [-arrowLen, 0, 0] as [number,number,number], to: [arrowLen, 0, 0] as [number,number,number] }
    if (dir === 'height') return { from: [0, -arrowLen, 0] as [number,number,number], to: [0, arrowLen, 0] as [number,number,number] }
    if (dir === 'depth')  return { from: [0, 0, -arrowLen] as [number,number,number], to: [0, 0, arrowLen] as [number,number,number] }
    return null
  }, [board.grainDirection, board.materialId, board.width, board.height, board.depth, customMaterials])
  const grainPoints = useMemo(() => grainArrow && [grainArrow.from, grainArrow.to], [grainArrow])

  const boardMesh = (
    <mesh
      ref={meshRef}
      name={board.id}
      position={[
        board.position.x + board.width / 2,
        board.position.y + board.height / 2,
        board.position.z + board.depth / 2
      ]}
      rotation={[
        (board.rotation.x * Math.PI) / 180,
        (board.rotation.y * Math.PI) / 180,
        (board.rotation.z * Math.PI) / 180
      ]}
      onPointerDown={(e) => {
        if (isOrtho) {
          handleOrthoPointerDown(e)
          return
        }
        // 3D: select on pointer-down — but ONLY if the board isn't already
        // selected. When it is, we let the event propagate so TC's pickers
        // (which sit at the gizmo positions) can grab it. Otherwise TC never
        // receives the click and OrbitControls would orbit the camera.
        if (isHoveringGizmo()) return
        if (e.nativeEvent.button !== 0) return
        // Stop R3F from handing the event to the next board along the ray.
        // TC is unaffected: it listens to the native pointerdown on the canvas.
        e.stopPropagation()
        if (isSelected && !e.nativeEvent.ctrlKey && !e.nativeEvent.metaKey) return
        if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) {
          toggleBoardSelection(assemblyId, board.id)
        } else if (!isSelected) {
          selectBoard(assemblyId, board.id)
        }
      }}
      onClick={(e) => {
        // No-op click handler: R3F bubbles synthetic clicks through the
        // intersection list. Without this, the click would propagate to the
        // invisible ground plane behind the board and trigger deselectAll.
        e.stopPropagation()
      }}
      onContextMenu={(e) => {
        e.stopPropagation()
        const nativeEvent = e.nativeEvent as MouseEvent
        nativeEvent.preventDefault()
        // On Windows contextmenu fires on right-button release, i.e. after a
        // right-drag pan too — that is not a request for the menu.
        if (e.delta > CONTEXT_MENU_MAX_DELTA) return
        useUIStore.getState().setContextMenu({
          x: nativeEvent.clientX,
          y: nativeEvent.clientY,
          boardId: board.id,
          assemblyId
        })
      }}
      geometry={boardGeometry}
    >
      {/* Opaque; only the X-ray ghosting of other groups stays see-through, and every
          board turns into a ghost while the static heat map is shown (it lies on the
          boards, also inside closed carcasses). The polygon offset keeps edge lines crisp. */}
      <meshStandardMaterial
        color={board.color}
        transparent={dimmed || staticGhost}
        opacity={staticGhost ? 0.12 : dimmed ? 0.45 : 1}
        depthWrite={!dimmed && !staticGhost}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        emissive={isSelected ? '#2563eb' : highlight ? '#f59e0b' : '#000000'}
        emissiveIntensity={isSelected ? 0.15 : highlight ? 0.25 : 0}
      />
      {!isSelected && !highlight && (
        <lineSegments geometry={edgesGeometry} material={edgeMaterial(board.color, dimmed || staticGhost)} raycast={() => null} />
      )}
      {highlight && (
        <lineSegments renderOrder={998} geometry={edgesGeometry} raycast={() => null}>
          <lineBasicMaterial color="#f59e0b" depthTest={false} depthWrite={false} />
        </lineSegments>
      )}
      {isSelected && (
        <lineSegments renderOrder={isOrtho ? 2 : 0} geometry={edgesGeometry} raycast={() => null}>
          <lineBasicMaterial color="#60a5fa" depthTest={!isOrtho} />
        </lineSegments>
      )}
      {grainPoints && (
        <Line
          points={grainPoints}
          color="#d97706"
          lineWidth={2}
        />
      )}
      {/* Joint count badge: selected boards only, while the joints layer is on */}
      {isSelected && showJointMarkers && jointCount > 0 && (
        <Html
          position={[board.width / 2, board.height / 2, board.depth / 2]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[20, 0]}
        >
          <div style={{
            background: '#6366f1',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 700,
            borderRadius: '8px',
            padding: '1px 5px',
            lineHeight: '14px',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}>
            {t('joints.badge', { count: jointCount })}
          </div>
        </Html>
      )}
    </mesh>
  )

  /** Ghost mesh — shown at original position during ortho drag */
  const ghostMesh = isDragging && ghostPos.current ? (
    <mesh
      position={[
        ghostPos.current.x + board.width / 2,
        ghostPos.current.y + board.height / 2,
        ghostPos.current.z + board.depth / 2
      ]}
      raycast={() => null}
    >
      <boxGeometry args={[board.width, board.height, board.depth]} />
      <meshStandardMaterial color={board.color} transparent opacity={0.25} depthWrite={false} />
    </mesh>
  ) : null

  // In 3D view: render TransformControls as a sibling (not a parent wrapper).
  // The gizmo is attached to the mesh via useEffect (see above).
  // Using TC as a children-wrapper would position the gizmo at the scene origin.
  if (showTC) {
    // 3D shows the standard three.js TransformControls for all modes:
    // arrows (translate), rings (rotate), boxes (scale) — Blender style,
    // all 3 axes always visible.
    return (
      <>
        {ghostMesh}
        {boardMesh}
        <TransformControls
          ref={transformRef}
          object={meshRef as React.RefObject<THREE.Object3D>}
          mode={transformMode}
          size={0.9}
          translationSnap={snapEnabled ? snapSize : null}
          rotationSnap={snapEnabled ? Math.PI / 2 : null}
          onMouseDown={(e: any) => handleDraggingChanged({ value: true })}
          onMouseUp={(e: any) => handleDraggingChanged({ value: false })}
        />
      </>
    )
  }

  return (
    <>
      {ghostMesh}
      {boardMesh}
    </>
  )
})
