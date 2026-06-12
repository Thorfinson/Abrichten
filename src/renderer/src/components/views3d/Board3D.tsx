import React, { useRef, useEffect, useMemo, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { TransformControls, Line, Html } from '@react-three/drei'
import { snapToGrid } from '../../utils/geometry'
import { getMaterialById } from '../../data/materials'
import { beginTransform, endTransform } from '../../utils/transformLock'
import { setHoveringGizmo, isHoveringGizmo } from '../../utils/gizmoHover'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import type { Board } from '../../types/furniture'
import type { ViewMode } from '../../types/measurement'
import * as THREE from 'three'

interface Board3DProps {
  board: Board
  assemblyId: string
  orbitRef?: React.RefObject<any>
}

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

export function Board3D({ board, assemblyId, orbitRef }: Board3DProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const transformRef = useRef<any>(null)
  const dragStartPosRef = useRef<THREE.Vector3>(new THREE.Vector3())
  const dragStartDimsRef = useRef<{ width: number; height: number; depth: number }>({ width: 0, height: 0, depth: 0 })
  const scaleDraggingRef = useRef<boolean>(false)

  // Ghost drag preview state
  const [isDragging, setIsDragging] = useState(false)
  const ghostPos = useRef<{ x: number; y: number; z: number } | null>(null)

  // Ortho drag state
  const orthoDrag = useRef<{
    active: boolean
    startWorldPos: THREE.Vector3
    startBoardPos: { x: number; y: number; z: number }
  }>({ active: false, startWorldPos: new THREE.Vector3(), startBoardPos: { x: 0, y: 0, z: 0 } })

  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const selectBoard = useUIStore((s) => s.selectBoard)
  const toggleBoardSelection = useUIStore((s) => s.toggleBoardSelection)
  const transformMode = useUIStore((s) => s.transformMode)
  const activeView = useUIStore((s) => s.activeView)
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const snapSize = useUIStore((s) => s.snapSize)
  const setSnapIndicatorPos = useUIStore((s) => s.setSnapIndicatorPos)
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const nudgeBoards = useProjectStore((s) => s.nudgeBoards)
  const showJointMarkers = useUIStore((s) => s.showJointMarkers)
  const isSelected = selectedBoardIds.includes(board.id)
  const isPrimary = selectedBoardIds.length === 1 && selectedBoardIds[0] === board.id
  const isOrtho = activeView !== '3d'

  // Count joints for this board in the active assembly
  const jointCount = useProjectStore((s) => {
    const asm = s.project.assemblies.find((a) => a.id === assemblyId)
    if (!asm) return 0
    return asm.joints.filter((j) => j.boardA === board.id || j.boardB === board.id).length
  })

  const { camera, gl, raycaster } = useThree()

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

  // When this board loses primary status (deselected, or another board became
  // primary), clear the gizmo-hover flag so it can't get stuck at true and
  // block selection on every other board.
  useEffect(() => {
    if (!isPrimary) setHoveringGizmo(false)
  }, [isPrimary])


  // TC drag handler — drei rewires it onto every fresh TransformControlsImpl
  // it creates internally (which can happen on re-renders), so we pass it as
  // a prop instead of attaching with addEventListener on an instance ref.
  const handleDraggingChanged = (event: any): void => {
    if (orbitRef?.current) {
      orbitRef.current.enabled = !event.value
    }
    if (event.value) {
      beginTransform()
      beginDragHistory()
    } else {
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
    if (isPrimary) {
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
    snapEnabled, snapSize, selectedBoardIds, selectedAssemblyId,
    updateBoard, nudgeBoards, setSnapIndicatorPos, dragPlane
  })
  orthoLiveRef.current = {
    isOrtho, activeTool, activeView, board, assemblyId,
    snapEnabled, snapSize, selectedBoardIds, selectedAssemblyId,
    updateBoard, nudgeBoards, setSnapIndicatorPos, dragPlane
  }

  // Ortho view pointer drag handlers — mounted once per canvas. Handlers read
  // live state via orthoLiveRef.current so a board update never tears them down.
  useEffect(() => {
    const canvas = gl.domElement

    const onPointerMove = (e: PointerEvent) => {
      if (!orthoDrag.current.active) return
      const live = orthoLiveRef.current
      if (!live.isOrtho || live.activeTool !== 'select') return
      const worldPos = raycastToPlane(e.clientX, e.clientY)
      if (!worldPos) return

      const axes = DRAG_AXES[live.activeView as Exclude<ViewMode, '3d'>]
      const deltaU = worldPos[axes.u] - orthoDrag.current.startWorldPos[axes.u]
      const deltaV = worldPos[axes.v] - orthoDrag.current.startWorldPos[axes.v]

      // Move mesh visually during drag (commit on pointerup)
      const b = live.board
      const halfSize = (axis: 'x' | 'y' | 'z') =>
        axis === 'x' ? b.width / 2 : axis === 'y' ? b.height / 2 : b.depth / 2

      if (meshRef.current) {
        const sp = orthoDrag.current.startBoardPos
        const snapVal = (v: number) => live.snapEnabled ? snapToGrid(v, live.snapSize) : v
        const newU = snapVal(sp[axes.u] + deltaU)
        const newV = snapVal(sp[axes.v] + deltaV)
        meshRef.current.position[axes.u] = newU + halfSize(axes.u)
        meshRef.current.position[axes.v] = newV + halfSize(axes.v)

        if (live.snapEnabled) {
          const pos = { x: 0, y: 0, z: 0 }
          pos[axes.u] = newU + halfSize(axes.u)
          pos[axes.v] = newV + halfSize(axes.v)
          const fixed = (axes.u === 'x' && axes.v === 'y') ? 'z'
            : (axes.u === 'z' && axes.v === 'y') ? 'x'
            : 'y'
          pos[fixed] = orthoDrag.current.startBoardPos[fixed] + halfSize(fixed as 'x' | 'y' | 'z')
          live.setSnapIndicatorPos(pos)
        }
      }
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

      const axes = DRAG_AXES[live.activeView as Exclude<ViewMode, '3d'>]
      const deltaU = worldPos[axes.u] - orthoDrag.current.startWorldPos[axes.u]
      const deltaV = worldPos[axes.v] - orthoDrag.current.startWorldPos[axes.v]
      const snapVal = (v: number) => live.snapEnabled ? snapToGrid(v, live.snapSize) : Math.round(v)

      if (live.selectedBoardIds.length > 1 && live.selectedBoardIds.includes(live.board.id) && live.selectedAssemblyId) {
        const nudge = { x: 0, y: 0, z: 0 }
        nudge[axes.u] = snapVal(deltaU)
        nudge[axes.v] = snapVal(deltaV)
        live.nudgeBoards(live.selectedAssemblyId, live.selectedBoardIds, nudge)
      } else {
        const sp = orthoDrag.current.startBoardPos
        const newPos = { ...live.board.position }
        newPos[axes.u] = snapVal(sp[axes.u] + deltaU)
        newPos[axes.v] = snapVal(sp[axes.v] + deltaV)
        live.updateBoard(live.assemblyId, live.board.id, { position: newPos })
      }

      endTransform()
      endDragHistory()
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
    }
  }, [gl, camera, raycaster])

  const handleOrthoPointerDown = (e: any) => {
    if (!isOrtho || activeTool !== 'select') return
    // Only left-click drag
    if (e.nativeEvent.button !== 0) return
    e.stopPropagation()

    // Select first
    if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) {
      toggleBoardSelection(assemblyId, board.id)
    } else if (!isSelected) {
      selectBoard(assemblyId, board.id)
    }

    // Start ortho drag
    const worldPos = raycastToPlane(e.nativeEvent.clientX, e.nativeEvent.clientY)
    if (worldPos) {
      ghostPos.current = { ...board.position }
      orthoDrag.current = {
        active: true,
        startWorldPos: worldPos.clone(),
        startBoardPos: { ...board.position }
      }
      setIsDragging(true)
      beginTransform()
      beginDragHistory()
      gl.domElement.setPointerCapture(e.nativeEvent.pointerId)
    }
  }

  // Grain direction arrow: half-length arrow along the grain axis
  const grainArrow = useMemo(() => {
    const dir = board.grainDirection
    const mat = getMaterialById(board.materialId)
    if (!dir || !mat?.grain) return null
    const hw = board.width / 2
    const hh = board.height / 2
    const hd = board.depth / 2
    const arrowLen = Math.min(hw, hh, hd) * 0.7
    if (dir === 'width')  return { from: [-arrowLen, 0, 0] as [number,number,number], to: [arrowLen, 0, 0] as [number,number,number] }
    if (dir === 'height') return { from: [0, -arrowLen, 0] as [number,number,number], to: [0, arrowLen, 0] as [number,number,number] }
    if (dir === 'depth')  return { from: [0, 0, -arrowLen] as [number,number,number], to: [0, 0, arrowLen] as [number,number,number] }
    return null
  }, [board.grainDirection, board.materialId, board.width, board.height, board.depth])

  const boardMesh = (
    <mesh
      ref={meshRef}
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
        if (isSelected && !e.nativeEvent.ctrlKey && !e.nativeEvent.metaKey) {
          // Don't stop propagation — TC needs the event
          return
        }
        e.stopPropagation()
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
        useUIStore.getState().setContextMenu({
          x: nativeEvent.clientX,
          y: nativeEvent.clientY,
          boardId: board.id,
          assemblyId
        })
      }}
    >
      <boxGeometry args={[board.width, board.height, board.depth]} />
      <meshStandardMaterial
        color={board.color}
        transparent={!isSelected}
        opacity={isSelected ? 1 : 0.85}
        emissive={isSelected ? '#2563eb' : '#000000'}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
      {isSelected && (
        <lineSegments renderOrder={isOrtho ? 2 : 0}>
          <edgesGeometry args={[new THREE.BoxGeometry(board.width, board.height, board.depth)]} />
          <lineBasicMaterial color="#2563eb" depthTest={!isOrtho} />
        </lineSegments>
      )}
      {grainArrow && (
        <Line
          points={[grainArrow.from, grainArrow.to]}
          color="#d97706"
          lineWidth={2}
        />
      )}
      {/* Joint count badge when joint markers are on */}
      {showJointMarkers && jointCount > 0 && (
        <Html
          position={[board.width / 2, board.height / 2, board.depth / 2]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[100, 0]}
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
            {jointCount} {jointCount === 1 ? 'joint' : 'joints'}
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
  if (!isOrtho && isPrimary) {
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
}
