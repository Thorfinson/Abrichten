import { useCallback, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore, useCanvasView } from '../../store/useUIStore'
import type { Vec3 } from '../../types/furniture'
import { HTML_Z_RANGE } from '../canvasTheme'
import { Icon } from '../layout/Icon'
import { clampCentre } from '../layout/layoutRules'
import { usePartLabels } from '../../hooks/usePartLabels'
import { PartName } from '../ui/PartName'
import { useDesignLocked } from '../../hooks/useDesignLocked'

/** Lift above the board's top centre so the pill clears the TC gizmo (~70 px) */
const LIFT_PX = 80

const projected = new THREE.Vector3()

/**
 * Floating label tag rendered above the selected board in 3D view.
 * Shows the board name and a quick delete button directly in 3D space.
 * Only active in perspective (3D) view mode.
 */
export function SelectionToolbar3D() {
  const { t } = useTranslation()
  const activeView       = useCanvasView()
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)
  const deselectAll      = useUIStore((s) => s.deselectAll)

  const transformMode  = useUIStore((s) => s.transformMode)
  const project        = useProjectStore((s) => s.project)
  const labels         = usePartLabels()
  const removeBoard    = useProjectStore((s) => s.removeBoard)
  const duplicateBoard = useProjectStore((s) => s.duplicateBoard)
  const updateBoard    = useProjectStore((s) => s.updateBoard)
  const selectBoard    = useUIStore((s) => s.selectBoard)
  // the assembly workspace names the part only: copying, turning, deleting belong to the design
  const locked         = useDesignLocked()

  // Screen position of the pill: projected board top, lifted, then clamped so
  // the whole pill stays inside this canvas (a quad quadrant clips otherwise).
  const pillRef = useRef<HTMLDivElement>(null)
  const calculatePosition = useCallback(
    (el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }) => {
      projected.setFromMatrixPosition(el.matrixWorld).project(camera)
      const x = ((projected.x + 1) / 2) * size.width
      const y = ((1 - projected.y) / 2) * size.height - LIFT_PX
      const pill = pillRef.current
      const box = { width: pill?.offsetWidth ?? 0, height: pill?.offsetHeight ?? 0 }
      return clampCentre(x, y, box, size)
    },
    []
  )

  // Only show for single selection in 3D perspective view
  if (activeView !== '3d') return null
  if (selectedBoardIds.length !== 1 || !selectedAssemblyId) return null

  const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
  const board = assembly?.boards.find((b) => b.id === selectedBoardIds[0])
  if (!board) return null

  // Anchor: top-centre of the board bounding box
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

  const iconBtn = 'w-6 h-6 flex items-center justify-center rounded-full transition-colors'

  return (
    <Html position={[px, py, pz]} center zIndexRange={HTML_Z_RANGE} calculatePosition={calculatePosition}>
      <div
        ref={pillRef}
        className={`flex items-center gap-0.5 pl-2.5 ${locked ? 'pr-2.5' : 'pr-1'} py-0.5 rounded-full border border-chrome-border bg-chrome-deep/95 shadow-lg text-chrome-text whitespace-nowrap`}
        style={{ pointerEvents: 'auto', userSelect: 'none' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Colour swatch */}
        <span
          className="w-2 h-2 rounded-full shrink-0 mr-1"
          style={{ background: board.color }}
        />
        {/* Board name */}
        <span className="text-[11px] font-medium max-w-[180px] truncate" data-testid="selection-pill-name">
          <PartName label={labels.get(board.id)} name={board.name} labelClassName="text-chrome-muted" />
        </span>
        {!locked && (
          <>
            {/* Divider */}
            <span className="w-px h-3.5 bg-chrome-divider mx-1" />
            <button
              onClick={handleDuplicate}
              title={t('ui.duplicate')}
              aria-label={t('ui.duplicate')}
              className={`${iconBtn} text-chrome-muted hover:text-chrome-text hover:bg-chrome-surface`}
            >
              <Icon name="copy" className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRotate90}
              title={t('ui.rotate90')}
              aria-label={t('ui.rotate90')}
              className={`${iconBtn} text-chrome-muted hover:text-chrome-text hover:bg-chrome-surface`}
            >
              <Icon name="rotate" className="w-3.5 h-3.5" />
            </button>
            {/* Transform mode badge */}
            <span className="font-mono text-[9px] px-1 mx-0.5 rounded bg-chrome-surface text-chrome-muted leading-4">
              {transformMode === 'translate' ? 'G' : transformMode === 'rotate' ? 'R' : 'T'}
            </span>
            <button
              onClick={handleDelete}
              title={t('ui.delete')}
              aria-label={t('ui.delete')}
              className={`${iconBtn} text-danger/80 hover:text-danger-text hover:bg-danger-dim`}
            >
              <Icon name="trash" className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </Html>
  )
}
