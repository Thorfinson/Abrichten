import { useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useProjectStore } from '../store/useProjectStore'
import { useUIStore } from '../store/useUIStore'
import { Board3D } from './views3d/Board3D'
import { CameraController } from './CameraController'
import { OrthoGrid } from './OrthoGrid'
import { StaticOverlay3D } from './overlays/StaticOverlay3D'
import { CollisionOverlay3D } from './overlays/CollisionOverlay3D'
import { DimensionOverlay } from './overlays/DimensionOverlay'
import { ResizeHandles3D } from './overlays/ResizeHandles3D'
import { RotationHandle3D } from './overlays/RotationHandle3D'
import { FaceHandles3D } from './overlays/FaceHandles3D'
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

/** Syncs the current R3F camera to an external ref (for use outside the Canvas) */
function CameraSync({ cameraRef }: { cameraRef: React.RefObject<THREE.Camera | null> }) {
  const { camera, scene, size, gl } = useThree()
  ;(cameraRef as React.MutableRefObject<THREE.Camera | null>).current = camera
  // Test/debug: expose R3F state on window so Playwright (etc.) can compute
  // projected screen positions of any mesh in the scene.
  if (typeof window !== 'undefined') {
    ;(window as any).__r3f = { camera, scene, size, gl, THREE }
  }
  return null
}

/**
 * Unified R3F Canvas that renders all 4 views (front, side, top, 3D).
 * The scene content is always the same — only the camera changes.
 * Replaces the old Scene3D + Konva-based FrontView/SideView/TopView.
 */
export function UnifiedCanvas({ forceView }: { forceView?: 'front' | 'side' | 'top' | '3d' } = {}) {
  const project = useProjectStore((s) => s.project)
  const storeView = useUIStore((s) => s.activeView)
  const activeView = forceView ?? storeView
  const orbitRef = useRef<any>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.Camera | null>(null)

  return (
    <div className="w-full h-full relative" ref={canvasContainerRef}>
      <Canvas
        camera={{ position: [500, 400, 500], fov: 50, near: 1, far: 20000 }}
        style={{ background: '#f8f9fa' }}
        onPointerMissed={(e) => {
          // Only deselect on a true click — ignore drag-releases (gizmo / orbit)
          // and clicks that land on a gizmo handle (which has no R3F handler).
          if (isTransforming() || isHoveringGizmo()) return
          if ((e as any).delta > 4) return
          useUIStore.getState().deselectAll()
        }}
      >
        {/* Camera management (ortho/perspective switching, zoom, pan) */}
        <CameraController orbitRef={orbitRef} forceView={forceView} />
        <CameraSync cameraRef={cameraRef} />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[500, 800, 500]} intensity={0.8} castShadow />
        <directionalLight position={[-300, 400, -300]} intensity={0.3} />

        {/* Grid + colored origin axes + mm labels */}
        <OrthoGrid forceView={forceView} />

        {/* Boards (skip hidden assemblies) */}
        {project.assemblies
          .filter((assembly) => assembly.visible !== false)
          .flatMap((assembly) =>
            assembly.boards.map((board) => (
              <Board3D
                key={board.id}
                board={board}
                assemblyId={assembly.id}
                orbitRef={orbitRef}
              />
            ))
          )}

        {/* Overlays */}
        <StaticOverlay3D />
        <CollisionOverlay3D />
        <DimensionOverlay />
        <TranslateHandles3D />
        <ResizeHandles3D />
        <RotationHandle3D />
        {/* FaceHandles3D removed — TC scale gizmo handles 3D scaling in
            Blender style with 3 axis-end boxes */}
        <MeasureTools3D />
        <JointMarkers3D />
        <JointGrooves3D />
        <SelectionToolbar3D forceView={forceView} />
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
            middle-drag feels responsive instead of "lagging" after release. */}
        {activeView === '3d' && (
          <OrbitControls
            ref={orbitRef}
            makeDefault
            target={[0, 0, 0]}
            enableDamping={false}
            minDistance={100}
            maxDistance={5000}
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
  )
}
