import { useEffect, useRef, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useUIStore, useCanvasView } from '../store/useUIStore'
import { useProjectStore } from '../store/useProjectStore'
import type { ViewMode } from '../types/measurement'
import { fitBounds } from './layout/layoutRules'
import { WheelClassifier, cameraDragFor, wheelPixels, zoomFactor, type CameraDrag } from '../utils/canvasInput'
import { isDragActive } from '../utils/transformLock'
import { isHoveringGizmo } from '../utils/gizmoHover'
import { assemblyCounts } from '../utils/activeParts'

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
/** Ortho zoom in screen px per mm: 0.01 shows 100 m across a 1000 px view, 300 shows 3 mm. */
const ORTHO_ZOOM_MIN = 0.01
const ORTHO_ZOOM_MAX = 300
/** Fit view: room around the model for dimension lines (mm) … */
const FIT_PAD_MM = 60
/** … and for the tool strip, HUD and cards floating over the canvas (px per side) */
const FIT_MARGIN_X_PX = 72
const FIT_MARGIN_Y_PX = 48
/** Ortho zoom per mouse wheel notch */
const WHEEL_ZOOM_STEP = 1.08
/** Pointer travel (px) above which a ⌥-drag swallows the click at its end */
const CLICK_MAX_TRAVEL_PX = 4

const Y_UP = new THREE.Vector3(0, 1, 0)

/**
 * Manages camera switching based on activeView.
 * Orthographic cameras for front/side/top, perspective for 3D.
 * Ortho views: wheel zooms towards the cursor, middle / right drag pans.
 * 3D: OrbitControls (middle orbits, right pans, wheel dollies).
 * Trackpad (utils/canvasInput): two-finger scroll pans, pinch zooms towards
 * the cursor, ⌥ + scroll or ⌥ + drag orbits in 3D, ⇧⌥ + drag pans.
 */
export function CameraController({ orbitRef, containerRef }: {
  orbitRef?: React.RefObject<any>
  /** The element around the R3F canvas (UnifiedCanvas) — ⌥-drag listens there */
  containerRef?: React.RefObject<HTMLDivElement | null>
}) {
  const activeView = useCanvasView()
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

  // Fit-to-view: triggered by UIStore.fitViewTrigger increment — by F, the
  // palette and every project load (App). Also runs when this controller
  // mounts after a trigger (layout switch), so a new quadrant starts framed.
  // An empty project frames the first metre from the origin.
  const fitBoundsNow = () => fitBounds(
    useProjectStore.getState().project.assemblies
      .filter(assemblyCounts)
      .flatMap((a) => a.boards)
  )

  /** Frames the model with the orbit camera; false while OrbitControls don't drive it yet. */
  const fit3d = (): boolean => {
    const controls = orbitRef?.current
    if (!controls || controls.object !== perspCameraRef.current) return false
    const { minX, maxX, minY, maxY, minZ, maxZ } = fitBoundsNow()
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2
    const spanMax = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
    const radius = spanMax / 2 + FIT_PAD_MM
    const camDist = Math.max(500, radius * 2.5)
    controls.target.set(centerX, centerY, centerZ)
    controls.object.position.set(
      centerX + camDist * 0.6,
      centerY + camDist * 0.5,
      centerZ + camDist * 0.8
    )
    controls.update()
    return true
  }

  // A 3D fit requested in the same tick as the switch to 3D (e.g. a project
  // load that also picks the 3D view) finds OrbitControls still bound to the
  // previous ortho camera; it waits here until they drive the orbit camera.
  const pendingFit3d = useRef(false)
  useFrame(() => {
    if (pendingFit3d.current && activeView === '3d' && fit3d()) pendingFit3d.current = false
  })

  useEffect(() => {
    if (fitViewTrigger === 0) return

    if (activeView === '3d') {
      pendingFit3d.current = !fit3d()
      return
    }
    pendingFit3d.current = false

    const { minX, maxX, minY, maxY, minZ, maxZ } = fitBoundsNow()
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2
    const pad = FIT_PAD_MM

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
    const usableW = Math.max(currentSize.width - 2 * FIT_MARGIN_X_PX, currentSize.width * 0.5)
    const usableH = Math.max(currentSize.height - 2 * FIT_MARGIN_Y_PX, currentSize.height * 0.5)
    const newZoom = Math.max(ORTHO_ZOOM_MIN, Math.min(ORTHO_ZOOM_MAX,
      Math.min(usableW / spanA, usableH / spanB)
    ))
    const vs = viewState.current[activeView]
    vs.target.set(tX, tY, tZ)
    vs.zoom = newZoom
    const cam = orthoCameras[activeView]
    if (cam) {
      cam.zoom = newZoom
      cam.updateProjectionMatrix()
    }
  }, [fitViewTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  /** NDC of a client position on this canvas */
  const toNdc = (clientX: number, clientY: number): THREE.Vector2 => {
    const rect = gl.domElement.getBoundingClientRect()
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
  }

  /** Put an ortho camera at its view target now, not only next frame — so a
   *  second wheel event in the same frame unprojects with the moved camera. */
  const syncOrtho = (view: Exclude<ViewMode, '3d'>): void => {
    const cam = orthoCameras[view]
    const config = ORTHO_CONFIGS[view]
    const { target } = viewState.current[view]
    cam.position.set(target.x + config.position[0], target.y + config.position[1], target.z + config.position[2])
    cam.lookAt(target)
    cam.updateMatrixWorld()
  }

  /** Ortho: zoom by `factor`, keeping the world point under the cursor in place. */
  const zoomOrthoAt = (view: Exclude<ViewMode, '3d'>, factor: number, clientX: number, clientY: number): void => {
    const cam = orthoCameras[view]
    const vs = viewState.current[view]
    const ndc = toNdc(clientX, clientY)
    const before = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(cam)
    cam.zoom = Math.max(ORTHO_ZOOM_MIN, Math.min(ORTHO_ZOOM_MAX, cam.zoom * factor))
    cam.updateProjectionMatrix()
    const after = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(cam)
    vs.target.add(before.sub(after))
    vs.zoom = cam.zoom
    syncOrtho(view)
  }

  /** Ortho: move the view as if the content were dragged by (dx, dy) screen px. */
  const panOrthoBy = (view: Exclude<ViewMode, '3d'>, dx: number, dy: number): void => {
    const cam = orthoCameras[view]
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize()
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize()
    viewState.current[view].target
      .addScaledVector(right, -dx / cam.zoom)
      .addScaledVector(up, dy / cam.zoom)
    syncOrtho(view)
  }

  /** OrbitControls while they drive the orbit camera, else null. */
  const orbitControls = (): any => {
    const c = orbitRef?.current
    return c && c.object === perspCameraRef.current && c.enabled !== false ? c : null
  }

  /** 3D: orbit around the target like a middle-button drag by (dx, dy) px. */
  const orbit3d = (dx: number, dy: number): void => {
    const c = orbitControls()
    if (!c) return
    const cam = c.object as THREE.PerspectiveCamera
    const h = gl.domElement.clientHeight || 1
    const toYUp = new THREE.Quaternion().setFromUnitVectors(cam.up, Y_UP)
    const offset = cam.position.clone().sub(c.target).applyQuaternion(toYUp)
    const s = new THREE.Spherical().setFromVector3(offset)
    s.theta -= (2 * Math.PI * dx) / h
    s.phi = Math.max(c.minPolarAngle, Math.min(c.maxPolarAngle, s.phi - (2 * Math.PI * dy) / h))
    s.makeSafe()
    offset.setFromSpherical(s).applyQuaternion(toYUp.invert())
    cam.position.copy(c.target).add(offset)
    c.update()
  }

  /** 3D: pan like a right-button drag by (dx, dy) px — the target plane follows the pointer. */
  const pan3d = (dx: number, dy: number): void => {
    const c = orbitControls()
    if (!c) return
    const cam = c.object as THREE.PerspectiveCamera
    const h = gl.domElement.clientHeight || 1
    const perPx = (2 * cam.position.distanceTo(c.target) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / h
    const move = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(-dx * perPx)
      .addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), dy * perPx)
    cam.position.add(move)
    c.target.add(move)
    c.update()
  }

  /** 3D: dolly by `factor` towards the point under the cursor (on the plane through the target). */
  const dolly3dAt = (factor: number, clientX: number, clientY: number): void => {
    const c = orbitControls()
    if (!c) return
    const cam = c.object as THREE.PerspectiveCamera
    const dist = cam.position.distanceTo(c.target)
    const next = Math.max(c.minDistance, Math.min(c.maxDistance, dist / factor))
    const k = 1 - next / dist
    if (!Number.isFinite(k) || k === 0) return
    const ray = new THREE.Raycaster()
    ray.setFromCamera(toNdc(clientX, clientY), cam)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cam.getWorldDirection(new THREE.Vector3()), c.target)
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3()) ?? c.target.clone()
    // Scaling camera and target about p keeps the view direction and p under the cursor
    cam.position.lerp(p, k)
    c.target.lerp(p, k)
    c.update()
  }

  // Wheel: a mouse notch zooms as it always did (ortho: towards the cursor,
  // 3D: OrbitControls); trackpad gestures pan, orbit or zoom (canvasInput).
  // Capture phase, so the trackpad gestures are taken before OrbitControls'
  // own wheel listener on the same canvas.
  const wheelClassifier = useMemo(() => new WheelClassifier(), [])
  useEffect(() => {
    const canvas = gl.domElement

    const onWheel = (e: WheelEvent) => {
      const intent = wheelClassifier.classify(e, useUIStore.getState().inputDevice, activeView)
      if (intent === 'wheel') {
        if (activeView === '3d') return // OrbitControls dollies
        e.preventDefault()
        zoomOrthoAt(activeView, e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, e.clientX, e.clientY)
        return
      }
      e.preventDefault()
      e.stopImmediatePropagation()
      const { dx, dy } = wheelPixels(e)
      if (intent === 'zoom') {
        const f = zoomFactor(dy)
        if (activeView === '3d') dolly3dAt(f, e.clientX, e.clientY)
        else zoomOrthoAt(activeView, f, e.clientX, e.clientY)
        return
      }
      // A drag in progress (gizmo, board, marquee, ⌥-drag): a pan or orbit —
      // e.g. the momentum of the last scroll — would pull the view from under it
      if (isDragActive() || e.buttons !== 0) return
      // Scrolling moves the view, i.e. the content goes the other way
      if (intent === 'orbit') orbit3d(-dx, -dy)
      else if (activeView === '3d') pan3d(-dx, -dy)
      else panOrthoBy(activeView, -dx, -dy)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => canvas.removeEventListener('wheel', onWheel, { capture: true })
  }, [activeView, gl, orthoCameras]) // eslint-disable-line react-hooks/exhaustive-deps

  // ⌥-drag with the left button / one finger moves the camera (canvasInput.cameraDragFor).
  // 3D: taken in the capture phase before R3F, TransformControls and
  // OrbitControls see it — no selection, no gizmo — unless it starts on a
  // TransformControls handle. 2D: taken only when it reaches the container,
  // i.e. no board or gizmo stopped it (⌥ on a board still drags it without snapping).
  useEffect(() => {
    const container = containerRef?.current
    if (!container) return
    const canvas = gl.domElement
    let drag: { kind: CameraDrag; pointerId: number; x: number; y: number; travel: number; cursor: string } | null = null
    let swallowClick = false

    const onMove = (e: PointerEvent): void => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      drag.travel += Math.abs(dx) + Math.abs(dy)
      if (dx === 0 && dy === 0) return
      if (activeView !== '3d') panOrthoBy(activeView, dx, dy)
      else if (drag.kind === 'orbit') orbit3d(dx, dy)
      else pan3d(dx, dy)
    }
    const end = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      if (!drag) return
      try { canvas.releasePointerCapture(drag.pointerId) } catch { /* already released */ }
      canvas.style.cursor = drag.cursor
      drag = null
    }
    function onUp(e: PointerEvent): void {
      if (!drag || e.pointerId !== drag.pointerId) return
      // 3D: R3F never saw the press, so its click must not land either
      swallowClick = activeView === '3d' || drag.travel > CLICK_MAX_TRAVEL_PX
      end()
    }
    const begin = (e: PointerEvent, kind: CameraDrag): void => {
      drag = { kind, pointerId: e.pointerId, x: e.clientX, y: e.clientY, travel: 0, cursor: canvas.style.cursor }
      try { canvas.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
      canvas.style.cursor = 'grabbing'
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
    }

    const onDownCapture = (e: PointerEvent): void => {
      swallowClick = false
      if (activeView !== '3d' || drag || e.target !== canvas) return
      const kind = cameraDragFor(e, '3d', useUIStore.getState().inputDevice)
      if (!kind || isHoveringGizmo() || isDragActive() || !orbitControls()) return
      e.stopPropagation()
      e.preventDefault()
      begin(e, kind)
    }
    const onDownBubble = (e: PointerEvent): void => {
      if (activeView === '3d' || drag || e.target !== canvas) return
      const kind = cameraDragFor(e, activeView, useUIStore.getState().inputDevice)
      if (!kind || isDragActive()) return
      begin(e, kind)
    }
    const onClickCapture = (e: MouseEvent): void => {
      if (!swallowClick) return
      swallowClick = false
      e.stopPropagation()
      e.preventDefault()
    }

    container.addEventListener('pointerdown', onDownCapture, true)
    container.addEventListener('pointerdown', onDownBubble)
    container.addEventListener('click', onClickCapture, true)
    return () => {
      container.removeEventListener('pointerdown', onDownCapture, true)
      container.removeEventListener('pointerdown', onDownBubble)
      container.removeEventListener('click', onClickCapture, true)
      end()
    }
  }, [activeView, gl, orthoCameras, containerRef]) // eslint-disable-line react-hooks/exhaustive-deps

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
