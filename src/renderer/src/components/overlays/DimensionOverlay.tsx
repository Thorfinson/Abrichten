import { useMemo } from 'react'
import { Line, Html } from '@react-three/drei'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { boardCorners3D } from '../../utils/projection'
import { formatValue } from '../../utils/units'
import type { Board } from '../../types/furniture'
import type { ViewMode } from '../../types/measurement'

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

function DimLine3D({ from, to, label, offset, color = '#333' }: DimLineProps) {
  const zoom = useUIStore((s) => s.zoom)
  const fontSize = Math.max(7, Math.min(12, 9 * Math.sqrt(zoom)))

  const oFrom: [number, number, number] = [from[0] + offset[0], from[1] + offset[1], from[2] + offset[2]]
  const oTo: [number, number, number] = [to[0] + offset[0], to[1] + offset[1], to[2] + offset[2]]
  const mid: [number, number, number] = [
    (oFrom[0] + oTo[0]) / 2,
    (oFrom[1] + oTo[1]) / 2,
    (oFrom[2] + oTo[2]) / 2
  ]

  return (
    <group>
      {/* Extension lines */}
      <Line points={[from, oFrom]} color="#999" lineWidth={0.5} />
      <Line points={[to, oTo]} color="#999" lineWidth={0.5} />
      {/* Dimension line */}
      <Line points={[oFrom, oTo]} color={color} lineWidth={1} />
      {/* Label */}
      <Html position={mid} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
        <span style={{
          fontSize: `${fontSize}px`,
          lineHeight: 1,
          color,
          background: 'rgba(255,255,255,0.9)',
          padding: '0 3px',
          borderRadius: '2px',
          whiteSpace: 'nowrap'
        }}>
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

function BoardDimensions({ board, activeView, staggerIdx }: BoardDimsProps) {
  const displayUnit = useProjectStore((s) => s.project.displayUnit)

  const aabb = useMemo(() => computeAABB(board), [board])

  const dims = VIEW_DIMS[activeView]
  // Each subsequent board gets an extra OFF distance to stagger dimension lines
  const BASE_OFF = 20
  const EXTRA_OFF = 18
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
}

/** Assembly bounding box dimensions in orange */
function AssemblyDimensions({ boards, activeView }: { boards: Board[]; activeView: ViewMode }) {
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

  // Outer offset: further out than any board dim line
  const OUTER = 80

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
        color="#ea580c"
      />
      <DimLine3D
        from={vFrom} to={vTo}
        label={formatValue(vVal, displayUnit)}
        offset={vOffset}
        color="#ea580c"
      />
    </group>
  )
}

/**
 * 3D dimension overlay — shows dimension lines for selected boards.
 * When showAssemblyDims is on, also renders assembly-level bounding dimensions in orange.
 */
export function DimensionOverlay() {
  const project = useProjectStore((s) => s.project)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const activeView = useUIStore((s) => s.activeView)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const showAssemblyDims = useUIStore((s) => s.showAssemblyDims)

  const selectedBoards = useMemo(() => {
    if (selectedBoardIds.length === 0) return []
    return project.assemblies
      .filter((a) => a.visible !== false)
      .flatMap((a) => a.boards)
      .filter((b) => selectedBoardIds.includes(b.id))
  }, [project.assemblies, selectedBoardIds])

  // For assembly dims: all boards in the active assembly (not just selected)
  const assemblyBoards = useMemo(() => {
    if (!showAssemblyDims || !selectedAssemblyId) return []
    const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
    return assembly?.boards ?? []
  }, [project.assemblies, selectedAssemblyId, showAssemblyDims])

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
      {sortedBoards.map((board, idx) => (
        <BoardDimensions
          key={`dim-${board.id}`}
          board={board}
          activeView={activeView}
          staggerIdx={idx}
        />
      ))}
      {showAssemblyDims && assemblyBoards.length > 0 && (
        <AssemblyDimensions boards={assemblyBoards} activeView={activeView} />
      )}
    </>
  )
}
