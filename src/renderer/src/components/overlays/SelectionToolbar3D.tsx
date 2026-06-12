import { Html } from '@react-three/drei'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import type { Vec3 } from '../../types/furniture'

/**
 * Floating label tag rendered above the selected board in 3D view.
 * Shows the board name and a quick delete button directly in 3D space.
 * Only active in perspective (3D) view mode.
 */
export function SelectionToolbar3D({ forceView }: { forceView?: 'front' | 'side' | 'top' | '3d' } = {}) {
  const storeView        = useUIStore((s) => s.activeView)
  const activeView       = forceView ?? storeView
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const deselectAll      = useUIStore((s) => s.deselectAll)

  const transformMode  = useUIStore((s) => s.transformMode)
  const project        = useProjectStore((s) => s.project)
  const removeBoard    = useProjectStore((s) => s.removeBoard)
  const duplicateBoard = useProjectStore((s) => s.duplicateBoard)
  const updateBoard    = useProjectStore((s) => s.updateBoard)
  const selectBoard    = useUIStore((s) => s.selectBoard)

  // Only show for single selection in 3D perspective view
  if (activeView !== '3d') return null
  if (selectedBoardIds.length !== 1 || !selectedAssemblyId) return null

  const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
  const board = assembly?.boards.find((b) => b.id === selectedBoardIds[0])
  if (!board) return null

  // Position: top-centre of the board bounding box. We also apply a pixel-
  // stable CSS offset below so the toolbar sits clearly above the TC gizmo
  // regardless of zoom (the gizmo auto-scales to ~80 px on screen).
  const px = board.position.x + board.width / 2
  const py = board.position.y + board.height
  const pz = board.position.z + board.depth / 2

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    removeBoard(selectedAssemblyId, board.id)
    deselectAll()
  }

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newId = duplicateBoard(selectedAssemblyId, board.id)
    if (newId) selectBoard(selectedAssemblyId, newId)
  }

  const handleRotate90 = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rot: Vec3 = { ...board.rotation, y: ((board.rotation.y ?? 0) + 90) % 360 }
    updateBoard(selectedAssemblyId, board.id, { rotation: rot })
  }

  return (
    <Html position={[px, py, pz]} center zIndexRange={[100, 0]}>
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-full border border-white/20 bg-gray-900/90 backdrop-blur-sm shadow-lg text-white whitespace-nowrap"
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
          // Shift up by ~80 px (above TC gizmo which auto-scales to ~70 px)
          transform: 'translateY(-80px)'
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Colour swatch */}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: board.color }}
        />
        {/* Board name */}
        <span className="text-[11px] font-medium max-w-[100px] truncate opacity-90">
          {board.name}
        </span>
        {/* Divider */}
        <span className="w-px h-3 bg-white/20 mx-0.5" />
        {/* Duplicate */}
        <button
          onClick={handleDuplicate}
          title="Duplicate"
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-[11px] opacity-60 hover:opacity-100"
        >
          ⧉
        </button>
        {/* Rotate 90° */}
        <button
          onClick={handleRotate90}
          title="Rotate 90°"
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-[11px] opacity-60 hover:opacity-100"
        >
          ↻
        </button>
        {/* Transform mode badge */}
        <span className="font-mono text-[9px] px-1 rounded bg-white/10 text-white/50 leading-4">
          {transformMode === 'translate' ? 'G' : transformMode === 'rotate' ? 'R' : 'T'}
        </span>
        {/* Delete */}
        <button
          onClick={handleDelete}
          title="Delete"
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-500/30 transition-colors text-[11px] text-red-400 opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </Html>
  )
}
