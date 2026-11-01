import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useThree, useFrame } from '@react-three/fiber'
import { Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useUIStore, useCanvasView } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useMeasure } from '../../hooks/useMeasure'
import { useAngle } from '../../hooks/useAngle'
import { useArea } from '../../hooks/useArea'
import { formatValue } from '../../utils/units'
import { distance, angleBetween, polygonArea } from '../../utils/geometry'
import type { ViewMode } from '../../types/measurement'
import type { Measurement, MeasurementPoint } from '../../types/measurement'
import { CANVAS, HTML_Z_RANGE, sceneLabelStyle } from '../canvasTheme'

/** Measurements are annotations: drawn last (transparent pass, high render
 *  order) without depth test, so boards — opaque or see-through — never hide them */
const ON_TOP = 10

const DIST = CANVAS.measureDistance
const ANGLE = CANVAS.measureAngle
const AREA = CANVAS.measureArea

/** Measurement label: tinted pill with the value and its delete button */
function measureLabelStyle(color: string): React.CSSProperties {
  return { ...sceneLabelStyle(color), padding: '1px 4px', display: 'flex', alignItems: 'center' }
}

const PLANE_NORMALS: Record<Exclude<ViewMode, '3d'>, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  side:  new THREE.Vector3(1, 0, 0),
  top:   new THREE.Vector3(0, 1, 0)
}

/** Convert a 2D MeasurementPoint to a 3D position for rendering */
function to3D(p: MeasurementPoint, view: ViewMode): [number, number, number] {
  switch (view) {
    case 'front': return [p.x, p.y, 0]
    case 'side':  return [0, p.y, p.x]
    case 'top':   return [p.x, 0, p.y]
    case '3d':    return [p.x, p.y, 0]
  }
}

/** Convert a 3D world position to 2D measurement coords for the active view */
function toMeasureCoords(world: THREE.Vector3, view: ViewMode): MeasurementPoint {
  switch (view) {
    case 'front': return { x: world.x, y: world.y }
    case 'side':  return { x: world.z, y: world.y }
    case 'top':   return { x: world.x, y: world.z }
    case '3d':    return { x: world.x, y: world.y }
  }
}

/** Delete button shown on each stored measurement */
function MeasureDeleteBtn({ idx, color }: { idx: number; color: string }) {
  const { t } = useTranslation()
  const removeMeasurement = useUIStore((s) => s.removeMeasurement)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); removeMeasurement(idx) }}
      aria-label={t('measurements.delete')}
      style={{
        fontSize: '9px',
        color,
        background: 'transparent',
        border: `1px solid ${color}`,
        borderRadius: 2,
        padding: '0 3px',
        marginLeft: 2,
        cursor: 'pointer',
        lineHeight: '14px'
      }}
      title={t('measurements.delete')}
    >
      ×
    </button>
  )
}

/** Renders stored measurements, each in the view it was taken in. Memoized so
 *  cursor moves of the in-progress measurement don't rebuild these lines. */
const StoredMeasurements = memo(function StoredMeasurements({ activeView }: { activeView: ViewMode }) {
  const measurements = useUIStore((s) => s.measurements)
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  return (
    <>
      {measurements.map((m, idx) => {
        const view = m.view ?? activeView
        if (m.type === 'distance') {
          const from = to3D(m.pointA, view)
          const to = to3D(m.pointB, view)
          const mid: [number, number, number] = [
            (from[0] + to[0]) / 2,
            (from[1] + to[1]) / 2,
            (from[2] + to[2]) / 2
          ]
          return (
            <group key={`dist-${idx}`}>
              <Line transparent depthTest={false} renderOrder={ON_TOP} points={[from, to]} color={DIST} lineWidth={1.5} dashed dashSize={6} gapSize={3} />
              <mesh renderOrder={ON_TOP} position={from}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color={DIST} transparent depthTest={false} /></mesh>
              <mesh renderOrder={ON_TOP} position={to}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color={DIST} transparent depthTest={false} /></mesh>
              <Html position={mid} center style={{ pointerEvents: 'auto' }} zIndexRange={HTML_Z_RANGE}>
                <span style={measureLabelStyle(DIST)}>
                  {formatValue(m.distance, displayUnit)}
                  <MeasureDeleteBtn idx={idx} color={DIST} />
                </span>
              </Html>
            </group>
          )
        }
        if (m.type === 'angle') {
          const a = to3D(m.pointA, view)
          const b = to3D(m.pointB, view)
          const c = to3D(m.pointC, view)
          return (
            <group key={`angle-${idx}`}>
              <Line transparent depthTest={false} renderOrder={ON_TOP} points={[a, b]} color={ANGLE} lineWidth={1.5} dashed dashSize={6} gapSize={3} />
              <Line transparent depthTest={false} renderOrder={ON_TOP} points={[b, c]} color={ANGLE} lineWidth={1.5} dashed dashSize={6} gapSize={3} />
              <mesh renderOrder={ON_TOP} position={b}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color={ANGLE} transparent depthTest={false} /></mesh>
              <Html position={b} center style={{ pointerEvents: 'auto' }} zIndexRange={HTML_Z_RANGE}>
                <span style={measureLabelStyle(ANGLE)}>
                  {m.angle.toFixed(1)}°
                  <MeasureDeleteBtn idx={idx} color={ANGLE} />
                </span>
              </Html>
            </group>
          )
        }
        if (m.type === 'area') {
          const pts = m.points.map((p) => to3D(p, view))
          const centroid: [number, number, number] = [
            pts.reduce((s, p) => s + p[0], 0) / pts.length,
            pts.reduce((s, p) => s + p[1], 0) / pts.length,
            pts.reduce((s, p) => s + p[2], 0) / pts.length
          ]
          const areaText = m.area < 100 ? `${m.area.toFixed(1)} mm²`
            : m.area < 1000000 ? `${(m.area / 100).toFixed(1)} cm²`
            : `${(m.area / 1000000).toFixed(3)} m²`
          return (
            <group key={`area-${idx}`}>
              <Line transparent depthTest={false} renderOrder={ON_TOP} points={[...pts, pts[0]]} color={AREA} lineWidth={1.5} dashed dashSize={6} gapSize={3} />
              {pts.map((p, i) => (
                <mesh key={i} renderOrder={ON_TOP} position={p}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color={AREA} transparent depthTest={false} /></mesh>
              ))}
              <Html position={centroid} center style={{ pointerEvents: 'auto' }} zIndexRange={HTML_Z_RANGE}>
                <span style={measureLabelStyle(AREA)}>
                  {areaText}
                  <MeasureDeleteBtn idx={idx} color={AREA} />
                </span>
              </Html>
            </group>
          )
        }
        return null
      })}
    </>
  )
})

/**
 * 3D measurement tools — MeasureTool, AngleTool, AreaTool combined.
 * Clicks on an invisible plane (perpendicular to camera) to place points.
 * Uses the existing hooks (useMeasure, useAngle, useArea) for state management.
 */
export function MeasureTools3D() {
  const activeTool = useUIStore((s) => s.activeTool)
  const activeView = useCanvasView()
  const { camera, gl, raycaster } = useThree()

  const measure = useMeasure(activeView)
  const angle = useAngle(activeView)
  const area = useArea(activeView)

  // Rubber-band cursor tracking: mousemove writes the ref and flags it dirty;
  // useFrame copies it into state only when it moved AND the rubber band is
  // drawn, so an idle canvas (or the angle/area tool) never re-renders per frame.
  const cursorWorldRef = useRef<THREE.Vector3 | null>(null)
  const cursorDirtyRef = useRef(false)
  const [cursorWorld, setCursorWorld] = useState<THREE.Vector3 | null>(null)
  const showsRubberBandRef = useRef(false)
  showsRubberBandRef.current = activeTool === 'measure' && !!measure.pointA && !measure.pointB

  const isOrtho = activeView !== '3d'
  const plane = useMemo(() => {
    if (!isOrtho) return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    return new THREE.Plane(PLANE_NORMALS[activeView as Exclude<ViewMode, '3d'>], 0)
  }, [activeView, isOrtho])

  const raycastToPlane = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
    const target = new THREE.Vector3()
    return raycaster.ray.intersectPlane(plane, target)
  }

  // Track cursor position for rubber-band line
  useEffect(() => {
    if (activeTool === 'select') return
    const canvas = gl.domElement
    const onMove = (e: MouseEvent) => {
      cursorWorldRef.current = raycastToPlane(e.clientX, e.clientY)
      cursorDirtyRef.current = true
    }
    canvas.addEventListener('mousemove', onMove)
    return () => {
      canvas.removeEventListener('mousemove', onMove)
      // Tool or view switched: forget the cursor
      cursorWorldRef.current = null
      cursorDirtyRef.current = false
      setCursorWorld(null)
    }
  }, [activeTool, activeView, gl, camera, raycaster, plane]) // eslint-disable-line react-hooks/exhaustive-deps

  // Copy the cursor ref to state at most once per frame, only when it moved
  useFrame(() => {
    if (!cursorDirtyRef.current || !showsRubberBandRef.current) return
    cursorDirtyRef.current = false
    setCursorWorld(cursorWorldRef.current?.clone() ?? null)
  })

  // Click handler on canvas for placing measurement points
  useEffect(() => {
    if (activeTool === 'select') return
    const canvas = gl.domElement

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return
      const worldPos = raycastToPlane(e.clientX, e.clientY)
      if (!worldPos) return

      const coords = toMeasureCoords(worldPos, activeView)

      switch (activeTool) {
        case 'measure':
          measure.handleClick(coords.x, coords.y)
          break
        case 'angle':
          angle.handleClick(coords.x, coords.y)
          break
        case 'area':
          area.handleClick(coords.x, coords.y)
          break
      }
    }

    const onDblClick = (e: MouseEvent) => {
      if (activeTool !== 'area') return
      const worldPos = raycastToPlane(e.clientX, e.clientY)
      if (!worldPos) return
      const coords = toMeasureCoords(worldPos, activeView)
      area.handleDoubleClick(coords.x, coords.y)
    }

    canvas.addEventListener('click', onClick)
    canvas.addEventListener('dblclick', onDblClick)
    return () => {
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('dblclick', onDblClick)
    }
  }, [activeTool, activeView, gl, camera, raycaster, plane, measure, angle, area])

  // Cursor world pos → the same view-plane point a click there would place
  const cursorPos3D: [number, number, number] | null = cursorWorld
    ? to3D(toMeasureCoords(cursorWorld, activeView), activeView)
    : null

  // Render current in-progress measurement
  const renderCurrent = () => {
    if (activeTool === 'measure') {
      if (measure.pointA && !measure.pointB) {
        const from = to3D(measure.pointA, activeView)
        return (
          <group>
            <mesh renderOrder={ON_TOP} position={from}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color={DIST} transparent depthTest={false} /></mesh>
            {/* Rubber-band dashed line to cursor */}
            {cursorPos3D && (
              <Line
                transparent
                depthTest={false}
                renderOrder={ON_TOP}
                points={[from, cursorPos3D]}
                color={DIST}
                lineWidth={1}
                dashed
                dashSize={4}
                gapSize={4}
              />
            )}
          </group>
        )
      }
    }
    if (activeTool === 'angle') {
      const pts: [number, number, number][] = []
      if (angle.pointA) pts.push(to3D(angle.pointA, activeView))
      if (angle.pointB) pts.push(to3D(angle.pointB, activeView))
      if (pts.length > 0) {
        return (
          <group>
            {pts.length >= 2 && <Line transparent depthTest={false} renderOrder={ON_TOP} points={pts} color={ANGLE} lineWidth={2} />}
            {pts.map((p, i) => (
              <mesh key={i} renderOrder={ON_TOP} position={p}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color={ANGLE} transparent depthTest={false} /></mesh>
            ))}
          </group>
        )
      }
    }
    if (activeTool === 'area') {
      if (area.points.length > 0) {
        const pts = area.points.map((p) => to3D(p, activeView))
        return (
          <group>
            {pts.length >= 2 && <Line transparent depthTest={false} renderOrder={ON_TOP} points={pts} color={AREA} lineWidth={2} />}
            {pts.map((p, i) => (
              <mesh key={i} renderOrder={ON_TOP} position={p}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color={AREA} transparent depthTest={false} /></mesh>
            ))}
          </group>
        )
      }
    }
    return null
  }

  return (
    <>
      <StoredMeasurements activeView={activeView} />
      {renderCurrent()}
    </>
  )
}
