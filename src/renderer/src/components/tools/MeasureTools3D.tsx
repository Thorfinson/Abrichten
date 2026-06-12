import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useMeasure } from '../../hooks/useMeasure'
import { useAngle } from '../../hooks/useAngle'
import { useArea } from '../../hooks/useArea'
import { formatValue } from '../../utils/units'
import { distance, angleBetween, polygonArea } from '../../utils/geometry'
import type { ViewMode } from '../../types/measurement'
import type { Measurement, MeasurementPoint } from '../../types/measurement'

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
  const removeMeasurement = useUIStore((s) => s.removeMeasurement)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); removeMeasurement(idx) }}
      style={{
        fontSize: '9px',
        color,
        background: 'rgba(255,255,255,0.9)',
        border: `1px solid ${color}`,
        borderRadius: 2,
        padding: '0 3px',
        marginLeft: 2,
        cursor: 'pointer',
        lineHeight: '14px'
      }}
      title="×"
    >
      ×
    </button>
  )
}

/** Renders stored measurements */
function StoredMeasurements({ activeView }: { activeView: ViewMode }) {
  const measurements = useUIStore((s) => s.measurements)
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  return (
    <>
      {measurements.map((m, idx) => {
        if (m.type === 'distance') {
          const from = to3D(m.pointA, activeView)
          const to = to3D(m.pointB, activeView)
          const mid: [number, number, number] = [
            (from[0] + to[0]) / 2,
            (from[1] + to[1]) / 2,
            (from[2] + to[2]) / 2
          ]
          return (
            <group key={`dist-${idx}`}>
              <Line points={[from, to]} color="#ef4444" lineWidth={1} dashed dashSize={6} gapSize={3} />
              <mesh position={from}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#ef4444" /></mesh>
              <mesh position={to}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#ef4444" /></mesh>
              <Html position={mid} center style={{ pointerEvents: 'auto' }} zIndexRange={[100, 0]}>
                <span style={{ fontSize: '10px', color: '#ef4444', background: 'rgba(255,255,255,0.9)', padding: '1px 4px', borderRadius: 2, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                  {formatValue(m.distance, displayUnit)}
                  <MeasureDeleteBtn idx={idx} color="#ef4444" />
                </span>
              </Html>
            </group>
          )
        }
        if (m.type === 'angle') {
          const a = to3D(m.pointA, activeView)
          const b = to3D(m.pointB, activeView)
          const c = to3D(m.pointC, activeView)
          return (
            <group key={`angle-${idx}`}>
              <Line points={[a, b]} color="#8b5cf6" lineWidth={1} dashed dashSize={6} gapSize={3} />
              <Line points={[b, c]} color="#8b5cf6" lineWidth={1} dashed dashSize={6} gapSize={3} />
              <mesh position={b}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#8b5cf6" /></mesh>
              <Html position={b} center style={{ pointerEvents: 'auto' }} zIndexRange={[100, 0]}>
                <span style={{ fontSize: '10px', color: '#8b5cf6', background: 'rgba(255,255,255,0.9)', padding: '1px 4px', borderRadius: 2, display: 'flex', alignItems: 'center' }}>
                  {m.angle.toFixed(1)}°
                  <MeasureDeleteBtn idx={idx} color="#8b5cf6" />
                </span>
              </Html>
            </group>
          )
        }
        if (m.type === 'area') {
          const pts = m.points.map((p) => to3D(p, activeView))
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
              <Line points={[...pts, pts[0]]} color="#10b981" lineWidth={1} dashed dashSize={6} gapSize={3} />
              {pts.map((p, i) => (
                <mesh key={i} position={p}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#10b981" /></mesh>
              ))}
              <Html position={centroid} center style={{ pointerEvents: 'auto' }} zIndexRange={[100, 0]}>
                <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(255,255,255,0.9)', padding: '1px 4px', borderRadius: 2, display: 'flex', alignItems: 'center' }}>
                  {areaText}
                  <MeasureDeleteBtn idx={idx} color="#10b981" />
                </span>
              </Html>
            </group>
          )
        }
        return null
      })}
    </>
  )
}

/**
 * 3D measurement tools — MeasureTool, AngleTool, AreaTool combined.
 * Clicks on an invisible plane (perpendicular to camera) to place points.
 * Uses the existing hooks (useMeasure, useAngle, useArea) for state management.
 */
export function MeasureTools3D() {
  const activeTool = useUIStore((s) => s.activeTool)
  const activeView = useUIStore((s) => s.activeView)
  const displayUnit = useProjectStore((s) => s.project.displayUnit)
  const { camera, gl, raycaster } = useThree()

  const measure = useMeasure()
  const angle = useAngle()
  const area = useArea()

  // Rubber-band cursor tracking
  const cursorWorldRef = useRef<THREE.Vector3 | null>(null)
  const [cursorWorld, setCursorWorld] = useState<THREE.Vector3 | null>(null)

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
      const pos = raycastToPlane(e.clientX, e.clientY)
      cursorWorldRef.current = pos
    }
    canvas.addEventListener('mousemove', onMove)
    return () => canvas.removeEventListener('mousemove', onMove)
  }, [activeTool, activeView, gl, camera, raycaster, plane])

  // Sync cursor ref to state each frame (avoids re-rendering every mousemove)
  useFrame(() => {
    if (cursorWorldRef.current) {
      setCursorWorld(cursorWorldRef.current.clone())
    }
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

  // Convert cursor world pos to view-space 3D
  const cursorPos3D: [number, number, number] | null = cursorWorld
    ? [
        activeView === 'front' ? cursorWorld.x : activeView === 'side' ? 0 : cursorWorld.x,
        activeView === 'top' ? 0 : cursorWorld.y,
        activeView === 'front' ? 0 : activeView === 'side' ? cursorWorld.z : cursorWorld.y
      ]
    : null

  // Render current in-progress measurement
  const renderCurrent = () => {
    if (activeTool === 'measure') {
      if (measure.pointA && !measure.pointB) {
        const from = to3D(measure.pointA, activeView)
        return (
          <group>
            <mesh position={from}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#ef4444" /></mesh>
            {/* Rubber-band dashed line to cursor */}
            {cursorPos3D && (
              <Line
                points={[from, cursorPos3D]}
                color="#ef4444"
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
            {pts.length >= 2 && <Line points={pts} color="#8b5cf6" lineWidth={2} />}
            {pts.map((p, i) => (
              <mesh key={i} position={p}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#8b5cf6" /></mesh>
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
            {pts.length >= 2 && <Line points={pts} color="#10b981" lineWidth={2} />}
            {pts.map((p, i) => (
              <mesh key={i} position={p}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#10b981" /></mesh>
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
