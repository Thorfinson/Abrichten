import { memo, useMemo } from 'react'
import { Line, Html } from '@react-three/drei'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore, useCanvasView } from '../../store/useUIStore'
import { useViewHidden } from '../../hooks/useViewHidden'
import { boardCorners3D } from '../../utils/projection'
import { formatValue } from '../../utils/units'
import type { Board } from '../../types/furniture'
import type { ViewMode } from '../../types/measurement'
import { CANVAS, HTML_Z_RANGE, sceneLabelStyle } from '../canvasTheme'
import { assemblyCounts } from '../../utils/activeParts'

/** Per-board dimension lines are drawn for at most this many selected boards;
 *  a bigger selection (e.g. Ctrl+A) gets one overall dimension instead. */
const MAX_BOARD_DIMS = 3
/** Offset of the first per-board dimension line from the board (mm) */
const BASE_OFF = 20
/** Extra offset per further board so labels don't overlap (mm) */
const EXTRA_OFF = 18
/** Offset of the assembly dimension, outside every per-board line (mm) */
const OUTER_OFF = 80

/** Render order of dimension lines (drawn without depth test, over the boards) */
const ON_TOP = 10

type Vec3Tuple = [number, number, number]

/** Which board dimensions to show per view */
const VIEW_DIMS: Record<ViewMode, { h: 'width' | 'depth'; v: 'height' | 'depth' | 'width' }> = {
  front: { h: 'width', v: 'height' },
  side:  { h: 'depth', v: 'height' },
  top:   { h: 'width', v: 'depth' },
  '3d':  { h: 'width', v: 'height' }
}

interface DimLineProps {
  from: [number, number, number]
  to: [number, number, number]
  label: string
  offset: [number, number, number]
  color?: string
}

function DimLine3D({ from, to, label, offset, color = CANVAS.dimLine }: DimLineProps) {
  const zoom = useUIStore((s) => s.zoom)
  const fontSize = Math.max(7, Math.min(12, 9 * Math.sqrt(zoom)))

  // Memoized on the values: drei <Line> rebuilds its geometry whenever the
  // points array changes identity, i.e. on every render with inline arrays.
  const valueKey = [...from, ...to, ...offset].join(',')
  const { ext1, ext2, dim, mid } = useMemo(() => {
    const oFrom: Vec3Tuple = [from[0] + offset[0], from[1] + offset[1], from[2] + offset[2]]
    const oTo: Vec3Tuple = [to[0] + offset[0], to[1] + offset[1], to[2] + offset[2]]
    return {
      ext1: [from, oFrom],
      ext2: [to, oTo],
      dim: [oFrom, oTo],
      mid: [(oFrom[0] + oTo[0]) / 2, (oFrom[1] + oTo[1]) / 2, (oFrom[2] + oTo[2]) / 2] as Vec3Tuple
    }
  }, [valueKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group>
      {/* Extension and dimension lines — drawn over the boards, like the label */}
      <Line points={ext1} color={CANVAS.dimExtension} lineWidth={0.5} transparent depthTest={false} renderOrder={ON_TOP} />
      <Line points={ext2} color={CANVAS.dimExtension} lineWidth={0.5} transparent depthTest={false} renderOrder={ON_TOP} />
      <Line points={dim} color={color} lineWidth={1} transparent depthTest={false} renderOrder={ON_TOP} />
      {/* Label */}
      <Html position={mid} center style={{ pointerEvents: 'none' }} zIndexRange={HTML_Z_RANGE}>
        <span style={sceneLabelStyle(color, fontSize)}>
          {label}
        </span>
      </Html>
    </group>
  )
}

interface BoardAABB {
  minX: number; maxX: number
  minY: number; maxY: number
  minZ: number; maxZ: number
}

function computeAABB(board: Board): BoardAABB {
  const corners = boardCorners3D(board)
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const c of corners) {
    if (c.x < minX) minX = c.x
    if (c.x > maxX) maxX = c.x
    if (c.y < minY) minY = c.y
    if (c.y > maxY) maxY = c.y
    if (c.z < minZ) minZ = c.z
    if (c.z > maxZ) maxZ = c.z
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

interface BoardDimsProps {
  board: Board
  activeView: ViewMode
  /** Stagger index — used to prevent label overlap by offsetting each board further */
  staggerIdx: number
}

const BoardDimensions = memo(function BoardDimensions({ board, activeView, staggerIdx }: BoardDimsProps) {
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  const aabb = useMemo(() => computeAABB(board), [board])

  const dims = VIEW_DIMS[activeView]
  // Each subsequent board gets an extra OFF distance to stagger dimension lines
  const off = BASE_OFF + staggerIdx * EXTRA_OFF

  let hFrom: [number, number, number]
  let hTo: [number, number, number]
  let hOffset: [number, number, number]
  let vFrom: [number, number, number]
  let vTo: [number, number, number]
  let vOffset: [number, number, number]

  switch (activeView) {
    case 'front':
      hFrom = [aabb.minX, aabb.minY, aabb.minZ]
      hTo   = [aabb.maxX, aabb.minY, aabb.minZ]
      hOffset = [0, -off, 0]
      vFrom = [aabb.maxX, aabb.minY, aabb.minZ]
      vTo   = [aabb.maxX, aabb.maxY, aabb.minZ]
      vOffset = [off, 0, 0]
      break
    case 'side':
      hFrom = [aabb.minX, aabb.minY, aabb.minZ]
      hTo   = [aabb.minX, aabb.minY, aabb.maxZ]
      hOffset = [0, -off, 0]
      vFrom = [aabb.minX, aabb.minY, aabb.maxZ]
      vTo   = [aabb.minX, aabb.maxY, aabb.maxZ]
      vOffset = [0, 0, off]
      break
    case 'top':
      hFrom = [aabb.minX, aabb.minY, aabb.maxZ]
      hTo   = [aabb.maxX, aabb.minY, aabb.maxZ]
      hOffset = [0, 0, off]
      vFrom = [aabb.maxX, aabb.minY, aabb.minZ]
      vTo   = [aabb.maxX, aabb.minY, aabb.maxZ]
      vOffset = [off, 0, 0]
      break
    case '3d':
    default:
      hFrom = [aabb.minX, aabb.minY, aabb.maxZ]
      hTo   = [aabb.maxX, aabb.minY, aabb.maxZ]
      hOffset = [0, -off, off]
      vFrom = [aabb.maxX, aabb.minY, aabb.maxZ]
      vTo   = [aabb.maxX, aabb.maxY, aabb.maxZ]
      vOffset = [off, 0, off]
      break
  }

  return (
    <group>
      <DimLine3D from={hFrom} to={hTo} label={formatValue(board[dims.h], displayUnit)} offset={hOffset} />
      <DimLine3D from={vFrom} to={vTo} label={formatValue(board[dims.v], displayUnit)} offset={vOffset} />
    </group>
  )
})

interface GroupDimsProps {
  boards: Board[]
  activeView: ViewMode
  /** Distance of the dimension lines from the bounding box (mm) */
  offset?: number
  color?: string
}

/** Overall bounding-box dimensions of a group of boards — the assembly (orange)
 *  or a large selection. */
const AssemblyDimensions = memo(function AssemblyDimensions({ boards, activeView, offset = OUTER_OFF, color = CANVAS.dimAssembly }: GroupDimsProps) {
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  const aabb = useMemo(() => {
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const b of boards) {
      const bb = computeAABB(b)
      if (bb.minX < minX) minX = bb.minX
      if (bb.maxX > maxX) maxX = bb.maxX
      if (bb.minY < minY) minY = bb.minY
      if (bb.maxY > maxY) maxY = bb.maxY
      if (bb.minZ < minZ) minZ = bb.minZ
      if (bb.maxZ > maxZ) maxZ = bb.maxZ
    }
    return { minX, maxX, minY, maxY, minZ, maxZ }
  }, [boards])

  if (!isFinite(aabb.minX)) return null

  const OUTER = offset

  let hFrom: [number, number, number]
  let hTo: [number, number, number]
  let hOffset: [number, number, number]
  let vFrom: [number, number, number]
  let vTo: [number, number, number]
  let vOffset: [number, number, number]
  let hVal: number
  let vVal: number

  switch (activeView) {
    case 'front':
      hVal = aabb.maxX - aabb.minX
      vVal = aabb.maxY - aabb.minY
      hFrom = [aabb.minX, aabb.minY, aabb.minZ]
      hTo   = [aabb.maxX, aabb.minY, aabb.minZ]
      hOffset = [0, -OUTER, 0]
      vFrom = [aabb.maxX, aabb.minY, aabb.minZ]
      vTo   = [aabb.maxX, aabb.maxY, aabb.minZ]
      vOffset = [OUTER, 0, 0]
      break
    case 'side':
      hVal = aabb.maxZ - aabb.minZ
      vVal = aabb.maxY - aabb.minY
      hFrom = [aabb.minX, aabb.minY, aabb.minZ]
      hTo   = [aabb.minX, aabb.minY, aabb.maxZ]
      hOffset = [0, -OUTER, 0]
      vFrom = [aabb.minX, aabb.minY, aabb.maxZ]
      vTo   = [aabb.minX, aabb.maxY, aabb.maxZ]
      vOffset = [0, 0, OUTER]
      break
    case 'top':
      hVal = aabb.maxX - aabb.minX
      vVal = aabb.maxZ - aabb.minZ
      hFrom = [aabb.minX, aabb.minY, aabb.maxZ]
      hTo   = [aabb.maxX, aabb.minY, aabb.maxZ]
      hOffset = [0, 0, OUTER]
      vFrom = [aabb.maxX, aabb.minY, aabb.minZ]
      vTo   = [aabb.maxX, aabb.minY, aabb.maxZ]
      vOffset = [OUTER, 0, 0]
      break
    case '3d':
    default:
      hVal = aabb.maxX - aabb.minX
      vVal = aabb.maxY - aabb.minY
      hFrom = [aabb.minX, aabb.minY, aabb.maxZ]
      hTo   = [aabb.maxX, aabb.minY, aabb.maxZ]
      hOffset = [0, -OUTER, OUTER]
      vFrom = [aabb.maxX, aabb.minY, aabb.maxZ]
      vTo   = [aabb.maxX, aabb.maxY, aabb.maxZ]
      vOffset = [OUTER, 0, OUTER]
      break
  }

  return (
    <group>
      <DimLine3D
        from={hFrom} to={hTo}
        label={formatValue(hVal, displayUnit)}
        offset={hOffset}
        color={color}
      />
      <DimLine3D
        from={vFrom} to={vTo}
        label={formatValue(vVal, displayUnit)}
        offset={vOffset}
        color={color}
      />
    </group>
  )
})

/**
 * 3D dimension overlay — shows dimension lines for selected boards (up to
 * MAX_BOARD_DIMS; a larger selection gets its overall size instead).
 * When showAssemblyDims is on, also renders assembly-level bounding dimensions in orange.
 */
export function DimensionOverlay() {
  const project = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const activeView = useCanvasView()
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const showAssemblyDims = useUIStore((s) => s.showAssemblyDims)
  const hidden = useViewHidden()

  const selectedBoards = useMemo(() => {
    if (selectedBoardIds.length === 0) return []
    return project.assemblies
      .filter(assemblyCounts)
      .flatMap((a) => a.boards)
      .filter((b) => selectedBoardIds.includes(b.id))
  }, [project.assemblies, selectedBoardIds])

  // For assembly dims: all boards in the active assembly (not just selected)
  const assemblyBoards = useMemo(() => {
    if (!showAssemblyDims || !selectedAssemblyId) return []
    const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
    // the overall size of what the assembly step view shows
    return (assembly?.boards ?? []).filter((b) => !hidden.has(b.id))
  }, [project.assemblies, selectedAssemblyId, showAssemblyDims, hidden])

  // Sort boards by a primary axis position to make stagger order predictable
  const sortedBoards = useMemo(() => {
    return [...selectedBoards].sort((a, b) => {
      switch (activeView) {
        case 'front': return (a.position?.x ?? 0) - (b.position?.x ?? 0)
        case 'side':  return (a.position?.z ?? 0) - (b.position?.z ?? 0)
        case 'top':   return (a.position?.x ?? 0) - (b.position?.x ?? 0)
        default:      return (a.position?.x ?? 0) - (b.position?.x ?? 0)
      }
    })
  }, [selectedBoards, activeView])

  if (selectedBoards.length === 0 && assemblyBoards.length === 0) return null

  return (
    <>
      {sortedBoards.length <= MAX_BOARD_DIMS
        ? sortedBoards.map((board, idx) => (
            <BoardDimensions
              key={`dim-${board.id}`}
              board={board}
              activeView={activeView}
              staggerIdx={idx}
            />
          ))
        : <AssemblyDimensions boards={selectedBoards} activeView={activeView} offset={BASE_OFF} color={CANVAS.dimLine} />}
      {showAssemblyDims && assemblyBoards.length > 0 && (
        <AssemblyDimensions boards={assemblyBoards} activeView={activeView} />
      )}
    </>
  )
}
