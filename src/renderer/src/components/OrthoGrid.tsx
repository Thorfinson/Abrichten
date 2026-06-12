import { useMemo } from 'react'
import { Grid, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useUIStore } from '../store/useUIStore'
import type { ViewMode } from '../types/measurement'

const GRID_SIZE = 16000
const LABEL_STEP = 1000 // mm between labels
const LABEL_COUNT = Math.floor(GRID_SIZE / LABEL_STEP) // labels in each direction
const AXIS_LENGTH = GRID_SIZE / 2

/** Axis line colors */
const X_COLOR = '#ef4444' // red
const Y_COLOR = '#22c55e' // green
const Z_COLOR = '#3b82f6' // blue

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '9px',
  color: '#666',
  background: 'rgba(255,255,255,0.7)',
  padding: '0 2px',
  borderRadius: '1px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none'
}

const AXIS_LABEL_STYLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 'bold',
  padding: '1px 3px',
  borderRadius: '2px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none'
}

interface AxisConfig {
  /** Grid position + rotation */
  position: [number, number, number]
  rotation: [number, number, number]
  /** Which world axes map to screen horizontal/vertical */
  hAxis: 'x' | 'y' | 'z'
  vAxis: 'x' | 'y' | 'z'
  /** Labels for the axis endpoints */
  hLabel: string
  vLabel: string
  hColor: string
  vColor: string
}

const VIEW_CONFIGS: Record<ViewMode, AxisConfig> = {
  front: {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, 0],
    hAxis: 'x', vAxis: 'y',
    hLabel: 'X', vLabel: 'Y',
    hColor: X_COLOR, vColor: Y_COLOR
  },
  side: {
    position: [0, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    hAxis: 'z', vAxis: 'y',
    hLabel: 'Z', vLabel: 'Y',
    hColor: Z_COLOR, vColor: Y_COLOR
  },
  top: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    hAxis: 'x', vAxis: 'z',
    hLabel: 'X', vLabel: 'Z',
    hColor: X_COLOR, vColor: Z_COLOR
  },
  '3d': {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    hAxis: 'x', vAxis: 'z',
    hLabel: 'X', vLabel: 'Z',
    hColor: X_COLOR, vColor: Z_COLOR
  }
}

/** Colored origin axes for ortho views */
function OriginAxes({ config, activeView }: { config: AxisConfig; activeView: ViewMode }) {
  const isOrtho = activeView !== '3d'

  // Build axis lines in world coordinates
  const hLine: [number, number, number][] = useMemo(() => {
    const start: [number, number, number] = [0, 0, 0]
    const end: [number, number, number] = [0, 0, 0]
    const idx = config.hAxis === 'x' ? 0 : config.hAxis === 'y' ? 1 : 2
    start[idx] = -AXIS_LENGTH
    end[idx] = AXIS_LENGTH
    return [start, end]
  }, [config.hAxis])

  const vLine: [number, number, number][] = useMemo(() => {
    const start: [number, number, number] = [0, 0, 0]
    const end: [number, number, number] = [0, 0, 0]
    const idx = config.vAxis === 'x' ? 0 : config.vAxis === 'y' ? 1 : 2
    start[idx] = -AXIS_LENGTH
    end[idx] = AXIS_LENGTH
    return [start, end]
  }, [config.vAxis])

  // Axis label positions (at the positive end)
  const hLabelPos: [number, number, number] = useMemo(() => {
    const p: [number, number, number] = [0, 0, 0]
    const idx = config.hAxis === 'x' ? 0 : config.hAxis === 'y' ? 1 : 2
    p[idx] = AXIS_LENGTH + 30
    return p
  }, [config.hAxis])

  const vLabelPos: [number, number, number] = useMemo(() => {
    const p: [number, number, number] = [0, 0, 0]
    const idx = config.vAxis === 'x' ? 0 : config.vAxis === 'y' ? 1 : 2
    p[idx] = AXIS_LENGTH + 30
    return p
  }, [config.vAxis])

  return (
    <group>
      {/* Horizontal axis */}
      <Line points={hLine} color={config.hColor} lineWidth={isOrtho ? 2 : 1.5} />
      {/* Vertical axis */}
      <Line points={vLine} color={config.vColor} lineWidth={isOrtho ? 2 : 1.5} />

      {/* Origin dot */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[isOrtho ? 4 : 3, 12, 12]} />
        <meshBasicMaterial color="#333" />
      </mesh>

      {/* Axis labels */}
      {isOrtho && (
        <>
          <Html position={hLabelPos} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
            <span style={{ ...AXIS_LABEL_STYLE, color: config.hColor, background: 'rgba(255,255,255,0.85)' }}>
              {config.hLabel}
            </span>
          </Html>
          <Html position={vLabelPos} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
            <span style={{ ...AXIS_LABEL_STYLE, color: config.vColor, background: 'rgba(255,255,255,0.85)' }}>
              {config.vLabel}
            </span>
          </Html>
        </>
      )}
    </group>
  )
}

/** Grid tick labels along the axes for ortho views */
function GridLabels({ config }: { config: AxisConfig }) {
  const labels = useMemo(() => {
    const result: { pos: [number, number, number]; text: string; axis: 'h' | 'v' }[] = []
    const hIdx = config.hAxis === 'x' ? 0 : config.hAxis === 'y' ? 1 : 2
    const vIdx = config.vAxis === 'x' ? 0 : config.vAxis === 'y' ? 1 : 2

    // Horizontal axis labels (along the bottom)
    for (let i = -LABEL_COUNT; i <= LABEL_COUNT; i++) {
      const val = i * LABEL_STEP
      const pos: [number, number, number] = [0, 0, 0]
      pos[hIdx] = val
      // Offset slightly into negative vertical direction so labels sit below axis
      pos[vIdx] = -20
      result.push({ pos, text: `${val}`, axis: 'h' })
    }

    // Vertical axis labels (along the left side)
    for (let i = -LABEL_COUNT; i <= LABEL_COUNT; i++) {
      if (i === 0) continue // skip duplicate at origin
      const val = i * LABEL_STEP
      const pos: [number, number, number] = [0, 0, 0]
      pos[vIdx] = val
      // Offset slightly into negative horizontal direction
      pos[hIdx] = -20
      result.push({ pos, text: `${val}`, axis: 'v' })
    }

    return result
  }, [config.hAxis, config.vAxis])

  return (
    <>
      {labels.map((l, i) => (
        <Html key={i} position={l.pos} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
          <span style={LABEL_STYLE}>{l.text}</span>
        </Html>
      ))}
    </>
  )
}

/**
 * Grid plane that adjusts orientation based on the active view.
 * Includes colored origin axes, axis labels, and mm tick marks.
 */
export function OrthoGrid({ forceView }: { forceView?: ViewMode } = {}) {
  const storeView = useUIStore((s) => s.activeView)
  const activeView = forceView ?? storeView
  const showGrid = useUIStore((s) => s.showGrid)
  const config = VIEW_CONFIGS[activeView]
  const isOrtho = activeView !== '3d'

  if (!showGrid) return null

  return (
    <group>
      <Grid
        args={[GRID_SIZE, GRID_SIZE]}
        cellSize={50}
        cellThickness={0.5}
        cellColor="#ccc"
        sectionSize={LABEL_STEP}
        sectionThickness={1}
        sectionColor="#999"
        fadeDistance={isOrtho ? 25000 : 8000}
        position={config.position}
        rotation={config.rotation}
      />

      {/* Colored origin axes */}
      <OriginAxes config={config} activeView={activeView} />

      {/* mm labels along grid lines — only in ortho views */}
      {isOrtho && <GridLabels config={config} />}
    </group>
  )
}
