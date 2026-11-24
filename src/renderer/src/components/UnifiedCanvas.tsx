import { useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useProjectStore } from '../store/useProjectStore'
import { useViewHidden } from '../hooks/useViewHidden'
import { useUIStore, CanvasViewContext } from '../store/useUIStore'
import { activeJoints, assemblyCounts } from '../utils/activeParts'
import { Board3D } from './views3d/Board3D'
import { CameraController } from './CameraController'
import { OrthoGrid } from './OrthoGrid'
import { StaticOverlay3D } from './overlays/StaticOverlay3D'
import { CollisionOverlay3D } from './overlays/CollisionOverlay3D'
import { DimensionOverlay } from './overlays/DimensionOverlay'
import { ResizeHandles3D } from './overlays/ResizeHandles3D'
import { RotationHandle3D } from './overlays/RotationHandle3D'
import { TranslateHandles3D } from './overlays/TranslateHandles3D'
import { MeasureTools3D } from './tools/MeasureTools3D'
import { SnapIndicator3D } from './overlays/SnapIndicator3D'
import { MarqueeSelect } from './tools/MarqueeSelect'
import { JointMarkers3D } from './overlays/JointMarkers3D'
import { JointGrooves3D } from './overlays/JointGrooves3D'
import { SelectionToolbar3D } from './overlays/SelectionToolbar3D'
import { isTransforming } from '../utils/transformLock'
import { isHoveringGizmo } from '../utils/gizmoHover'
import * as THREE from 'three'
import type { ViewMode } from '../types/measurement'
import { CANVAS } from './canvasTheme'

/** Syncs the current R3F camera to an external ref (for use outside the Canvas) */
function CameraSync({ cameraRef, view }: { cameraRef: React.RefObject<THREE.Camera | null>; view?: ViewMode }) {
  const { camera, scene, size, gl, controls } = useThree()
  ;(cameraRef as React.MutableRefObject<THREE.Camera | null>).current = camera
  // Test/debug: expose R3F state on window so Playwright (etc.) can compute
  // projected screen positions of any mesh in the scene. In quad layout each
  // quadrant is also reachable by its view via __r3fViews. `controls`: the
  // 3D view's OrbitControls (orbit target), null in the ortho views.
  if (typeof window !== 'undefined') {
    const state = { camera, scene, size, gl, controls, THREE }
    ;(window as any).__r3f = state
    if (view) ((window as any).__r3fViews ??= {})[view] = state
  }
  return null
}

/**
 * Unified R3F Canvas that renders all 4 views (front, side, top, 3D).
 * The scene content is always the same — only the camera changes.
 * Replaces the old Scene3D + Konva-based FrontView/SideView/TopView.
 */
export function UnifiedCanvas({ forceView }: { forceView?: ViewMode } = {}) {
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const storeView = useUIStore((s) => s.activeView)
  const workspace = useUIStore((s) => s.workspace)
  const highlightedParts = useUIStore((s) => s.highlightedParts)
  const viewHidden = useViewHidden()
  const activeView = forceView ?? storeView
  const orbitRef = useRef<any>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.Camera | null>(null)

  // Joint badge counts, computed once per project change instead of once per board
  const jointCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { joint } of activeJoints(useProjectStore.getState().project)) {
      counts.set(joint.boardA, (counts.get(joint.boardA) ?? 0) + 1)
      if (joint.boardB !== joint.boardA) counts.set(joint.boardB, (counts.get(joint.boardB) ?? 0) + 1)
    }
    return counts
  }, [assemblies])

  return (
    // Everything below — inside the R3F canvas too (R3F bridges context) —
    // reads this canvas's view via useCanvasView(). `isolate` gives the drei
    // <Html> labels their own stacking context, so no scene label can paint
    // over the cards, drawers and modals outside the canvas.
    <CanvasViewContext.Provider value={forceView ?? null}>
    <div className="w-full h-full relative isolate" ref={canvasContainerRef}>
      {/* flat: no tone mapping — boards show their material colours as defined */}
      <Canvas
        flat
        camera={{ position: [500, 400, 500], fov: 50, near: 1, far: 200000 }}
        style={{ background: CANVAS.background }}
        onPointerMissed={(e) => {
          // Only deselect on a true click — ignore drag-releases (gizmo / orbit)
          // and clicks that land on a gizmo handle (which has no R3F handler).
          if (isTransforming() || isHoveringGizmo()) return
          if ((e as any).delta > 4) return
          useUIStore.getState().deselectAll()
        }}
      >
        {/* Camera management (ortho/perspective switching, zoom, pan, trackpad gestures) */}
        <CameraController orbitRef={orbitRef} containerRef={canvasContainerRef} />
        <CameraSync cameraRef={cameraRef} view={forceView} />

        {/* Lighting — three divides diffuse light by π, so these add up to
            ~0.95 of the material colour on top faces, ~0.8 on front/side faces
            (all the ortho views see) and ~0.6 on faces turned away */}
        <ambientLight intensity={1.5} />
        <directionalLight position={[500, 800, 500]} intensity={2} castShadow />
        <directionalLight position={[-300, 400, -300]} intensity={0.8} />

        {/* Grid + colored origin axes + mm labels */}
        <OrthoGrid />

        {/* Boards (only assemblies that count). While parts are picked out by the X-ray
            (design workspace), all others are ghosted so they read through the model. */}
        {(() => {
          // picked out and seen: an X-ray on parts the eye hides ghosts nothing
          const lit = workspace === 'assembly' ? new Set<string>() : new Set(highlightedParts.filter((id) => !viewHidden.has(id)))
          const anyHighlight = lit.size > 0 && assemblies.some((a) => assemblyCounts(a) && a.boards.some((b) => lit.has(b.id)))
          return assemblies
            .filter(assemblyCounts)
            .flatMap((assembly) =>
              assembly.boards.map((board) => (
                <Board3D
                  key={board.id}
                  board={board}
                  assemblyId={assembly.id}
                  orbitRef={orbitRef}
                  highlight={lit.has(board.id)}
                  dimmed={anyHighlight && !lit.has(board.id)}
                  jointCount={jointCounts.get(board.id) ?? 0}
                />
              ))
            )
        })()}

        {/* Overlays */}
        <StaticOverlay3D />
        <CollisionOverlay3D />
        <DimensionOverlay />
        <TranslateHandles3D />
        <ResizeHandles3D />
        <RotationHandle3D />
        <MeasureTools3D />
        <JointMarkers3D />
        <JointGrooves3D />
        <SelectionToolbar3D />
        <SnapIndicator3D />

        {/* Transparent ground plane for world-position readout + void-click deselect */}
        <mesh
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          onClick={(e) => {
            if (isTransforming() || isHoveringGizmo()) return
            if (e.delta > 4) return
            useUIStore.getState().deselectAll()
          }}
          onPointerMove={(e) => {
            const { x, y, z } = e.point
            useUIStore.getState().setHoveredWorldPos({ x, y, z })
          }}
          onPointerLeave={() => useUIStore.getState().setHoveredWorldPos(null)}
        >
          <planeGeometry args={[100000, 100000]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* OrbitControls only for 3D perspective view.
            Left-button reserved for selection + TC gizmos (Blender-style).
            Middle button rotates, right button pans. Damping turned off so
            middle-drag feels responsive instead of "lagging" after release.
            Trackpad gestures and ⌥-drag are CameraController's. */}
        {activeView === '3d' && (
          <OrbitControls
            ref={orbitRef}
            makeDefault
            target={[0, 0, 0]}
            enableDamping={false}
            minDistance={10}
            maxDistance={50000}
            mouseButtons={{
              LEFT: undefined as any,
              MIDDLE: THREE.MOUSE.ROTATE,
              RIGHT: THREE.MOUSE.PAN
            }}
          />
        )}
      </Canvas>

      {/* Marquee selection overlay (HTML, not R3F) */}
      <MarqueeSelect canvasRef={canvasContainerRef} cameraRef={cameraRef as any} />
    </div>
    </CanvasViewContext.Provider>
  )
}
