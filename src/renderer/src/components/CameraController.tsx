import { useEffect, useRef, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useUIStore } from '../store/useUIStore'
import { useProjectStore } from '../store/useProjectStore'
import type { ViewMode } from '../types/measurement'

/**
 * Orthographic camera configuration per 2D view.
 * Position is far along the viewing axis; up defines screen-Y.
 */
interface OrthoConfig {
  position: [number, number, number]
  up: [number, number, number]
}

const ORTHO_CONFIGS: Record<Exclude<ViewMode, '3d'>, OrthoConfig> = {
  front: { position: [0, 0, 10000], up: [0, 1, 0] },
  side:  { position: [10000, 0, 0], up: [0, 1, 0] },
  top:   { position: [0, 10000, 0], up: [0, 0, -1] }
}

const INITIAL_ORTHO_ZOOM = 2

/**
 * Manages camera switching based on activeView.
 * Orthographic cameras for front/side/top, perspective for 3D.
 * Handles zoom (scroll) and pan (right-click drag) for ortho views.
 */
export function CameraController({ orbitRef, forceView }: { orbitRef?: React.RefObject<any>; forceView?: ViewMode }) {
  const storeView = useUIStore((s) => s.activeView)
  const activeView = forceView ?? storeView
  const fitViewTrigger = useUIStore((s) => s.fitViewTrigger)
  const { set, size, camera: defaultCamera, gl } = useThree()
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null)

  // Always-current canvas size — avoids stale closure in fitView effect (critical in quad mode)
  const sizeRef = useRef(size)
  useEffect(() => { sizeRef.current = size }, [size])

  // Persist zoom and pan target per ortho view across tab switches
  const viewState = useRef<Record<string, { zoom: number; target: THREE.Vector3 }>>({
    front: { zoom: INITIAL_ORTHO_ZOOM, target: new THREE.Vector3(0, 0, 0) },
    side:  { zoom: INITIAL_ORTHO_ZOOM, target: new THREE.Vector3(0, 0, 0) },
    top:   { zoom: INITIAL_ORTHO_ZOOM, target: new THREE.Vector3(0, 0, 0) }
  })

  // Pan drag tracking
  const panDrag = useRef({ active: false, startX: 0, startY: 0, startTarget: new THREE.Vector3() })

  // Create one orthographic camera per 2D view
  const orthoCameras = useMemo(() => {
    const cams: Record<string, THREE.OrthographicCamera> = {}
    for (const [key, config] of Object.entries(ORTHO_CONFIGS)) {
      const cam = new THREE.OrthographicCamera(
        -size.width / 2, size.width / 2,
        size.height / 2, -size.height / 2,
        1, 20000
      )
      cam.position.set(...config.position)
      cam.up.set(...config.up)
      cam.lookAt(0, 0, 0)
      cam.zoom = INITIAL_ORTHO_ZOOM
      cam.updateProjectionMatrix()
      cams[key] = cam
    }
    return cams
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Save perspective camera on first render
  useEffect(() => {
    if (defaultCamera instanceof THREE.PerspectiveCamera) {
      perspCameraRef.current = defaultCamera
    }
  }, [defaultCamera])

  // Update ortho frustum on resize
  useEffect(() => {
    for (const cam of Object.values(orthoCameras)) {
      cam.left = -size.width / 2
      cam.right = size.width / 2
      cam.top = size.height / 2
      cam.bottom = -size.height / 2
      cam.updateProjectionMatrix()
    }
  }, [size, orthoCameras])

  // Switch camera when activeView changes
  useEffect(() => {
    if (activeView === '3d') {
      if (perspCameraRef.current) {
        set({ camera: perspCameraRef.current })
      }
    } else {
      const cam = orthoCameras[activeView]
      if (cam) {
        const vs = viewState.current[activeView]
        cam.zoom = vs.zoom
        cam.updateProjectionMatrix()
        set({ camera: cam })
      }
    }
  }, [activeView, set, orthoCameras])

  // Keep ortho camera positioned at target + view offset each frame
  useFrame(() => {
    if (activeView === '3d') return
    const cam = orthoCameras[activeView]
    const config = ORTHO_CONFIGS[activeView as Exclude<ViewMode, '3d'>]
    const vs = viewState.current[activeView]
    if (!cam || !config || !vs) return

    // Camera sits at target + the view direction offset
    cam.position.set(
      vs.target.x + config.position[0],
      vs.target.y + config.position[1],
      vs.target.z + config.position[2]
    )
    cam.lookAt(vs.target)
    cam.updateProjectionMatrix()
  })

  // Fit-to-view: triggered by UIStore.fitViewTrigger increment
  useEffect(() => {
    if (fitViewTrigger === 0) return

    const allBoards = useProjectStore.getState().project.assemblies
      .filter((a) => a.visible !== false)
      .flatMap((a) => a.boards)

    if (allBoards.length === 0) return

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const b of allBoards) {
      minX = Math.min(minX, b.position.x)
      maxX = Math.max(maxX, b.position.x + b.width)
      minY = Math.min(minY, b.position.y)
      maxY = Math.max(maxY, b.position.y + b.height)
      minZ = Math.min(minZ, b.position.z)
      maxZ = Math.max(maxZ, b.position.z + b.depth)
    }

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2
    const pad = 100

    if (activeView !== '3d') {
      let spanA: number, spanB: number, tX: number, tY: number, tZ: number
      if (activeView === 'front') {
        spanA = maxX - minX + pad * 2; spanB = maxY - minY + pad * 2
        tX = centerX; tY = centerY; tZ = 0
      } else if (activeView === 'side') {
        spanA = maxZ - minZ + pad * 2; spanB = maxY - minY + pad * 2
        tX = 0; tY = centerY; tZ = centerZ
      } else {
        spanA = maxX - minX + pad * 2; spanB = maxZ - minZ + pad * 2
        tX = centerX; tY = 0; tZ = centerZ
      }
      const currentSize = sizeRef.current
      const newZoom = Math.max(0.1, Math.min(30,
        Math.min(currentSize.width / spanA, currentSize.height / spanB)
      ))
      const vs = viewState.current[activeView]
      vs.target.set(tX, tY, tZ)
      vs.zoom = newZoom
      const cam = orthoCameras[activeView]
      if (cam) {
        cam.zoom = newZoom
        cam.updateProjectionMatrix()
      }
    } else if (orbitRef?.current) {
      const spanMax = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
      const radius = spanMax / 2 + pad
      const camDist = Math.max(500, radius * 2.5)
      orbitRef.current.target.set(centerX, centerY, centerZ)
      orbitRef.current.object.position.set(
        centerX + camDist * 0.6,
        centerY + camDist * 0.5,
        centerZ + camDist * 0.8
      )
      orbitRef.current.update()
    }
  }, [fitViewTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel zoom toward mouse pointer for ortho views
  useEffect(() => {
    const canvas = gl.domElement

    const onWheel = (e: WheelEvent) => {
      if (activeView === '3d') return
      e.preventDefault()
      const cam = orthoCameras[activeView]
      if (!cam) return

      const vs = viewState.current[activeView]
      const oldZoom = cam.zoom
      const factor = 1.08
      const newZoom = e.deltaY < 0 ? oldZoom * factor : oldZoom / factor
      const clampedZoom = Math.max(0.1, Math.min(30, newZoom))

      // Zoom toward mouse: find world position under mouse, keep it fixed
      const rect = canvas.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

      // Unproject mouse to world at old zoom
      const mouseWorld = new THREE.Vector3(ndcX, ndcY, 0).unproject(cam)
      // Apply new zoom
      cam.zoom = clampedZoom
      cam.updateProjectionMatrix()
      // Unproject same NDC at new zoom
      const mouseWorldNew = new THREE.Vector3(ndcX, ndcY, 0).unproject(cam)
      // Adjust target so world point under mouse stays fixed
      vs.target.add(mouseWorld.sub(mouseWorldNew))
      vs.zoom = clampedZoom

      cam.updateProjectionMatrix()
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [activeView, gl, orthoCameras])

  // Right-click / middle-click pan for ortho views
  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      if (activeView === '3d') return
      if (e.button !== 2 && e.button !== 1) return
      e.preventDefault()
      const vs = viewState.current[activeView]
      panDrag.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startTarget: vs.target.clone()
      }
      canvas.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!panDrag.current.active) return
      if (activeView === '3d') return
      const cam = orthoCameras[activeView]
      if (!cam) return

      const dx = e.clientX - panDrag.current.startX
      const dy = e.clientY - panDrag.current.startY
      // Convert pixel delta to world units
      const worldPerPx = 1 / cam.zoom
      // Pan in camera-local axes
      const right = new THREE.Vector3()
      const up = new THREE.Vector3()
      cam.getWorldDirection(new THREE.Vector3())
      right.setFromMatrixColumn(cam.matrixWorld, 0).normalize()
      up.setFromMatrixColumn(cam.matrixWorld, 1).normalize()

      const vs = viewState.current[activeView]
      vs.target.copy(panDrag.current.startTarget)
        .addScaledVector(right, -dx * worldPerPx)
        .addScaledVector(up, dy * worldPerPx)
    }

    const onPointerUp = () => {
      panDrag.current.active = false
    }

    // Suppress right-click context menu on canvas in ortho views
    const onContextMenu = (e: Event) => {
      if (activeView !== '3d') {
        e.preventDefault()
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('contextmenu', onContextMenu)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [activeView, gl, orthoCameras])

  return null
}
