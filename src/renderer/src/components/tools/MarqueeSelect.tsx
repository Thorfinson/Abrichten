import { useState, useCallback, useEffect, useRef } from 'react'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import type { ViewMode } from '../../types/measurement'
import * as THREE from 'three'

/** Axis mapping per ortho view: which world axes map to screen X and Y */
const VIEW_AXES: Record<Exclude<ViewMode, '3d'>, { screenX: 'x' | 'y' | 'z'; screenY: 'x' | 'y' | 'z'; flipY: boolean }> = {
  front: { screenX: 'x', screenY: 'y', flipY: false },
  side:  { screenX: 'z', screenY: 'y', flipY: false },
  top:   { screenX: 'x', screenY: 'z', flipY: true }
}

const MIN_DRAG_PX = 5

interface MarqueeSelectProps {
  canvasRef: React.RefObject<HTMLDivElement | null>
  cameraRef: React.RefObject<THREE.OrthographicCamera | null>
}

/**
 * HTML overlay for rubber-band / marquee selection in ortho views.
 * Renders a semi-transparent blue rectangle while dragging on empty canvas areas.
 * On release, selects all boards whose 2D AABB (projected to the view plane) overlaps.
 */
export function MarqueeSelect({ canvasRef, cameraRef }: MarqueeSelectProps) {
  const activeView = useUIStore((s) => s.activeView)
  const activeTool = useUIStore((s) => s.activeTool)
  const isOrtho = activeView !== '3d'

  const [dragging, setDragging] = useState(false)
  const [rect, setRect] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const startRef = useRef({ x: 0, y: 0 })
  const ctrlRef = useRef(false)

  const handlePointerDown = useCallback((e: PointerEvent) => {
    // Only left button, only select tool, only ortho
    if (e.button !== 0) return
    if (activeTool !== 'select') return
    if (!isOrtho) return

    // Don't start marquee if the click is on a board (R3F canvas handles that via stopPropagation)
    // We detect this by checking if the event target is the canvas element itself
    const canvas = canvasRef.current
    if (!canvas) return

    // The actual <canvas> element is inside the container div
    const canvasEl = canvas.querySelector('canvas')
    if (e.target !== canvasEl) return

    startRef.current = { x: e.clientX, y: e.clientY }
    ctrlRef.current = e.ctrlKey || e.metaKey

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startRef.current.x
      const dy = me.clientY - startRef.current.y

      if (!dragging && Math.abs(dx) < MIN_DRAG_PX && Math.abs(dy) < MIN_DRAG_PX) return

      setDragging(true)

      const containerRect = canvas.getBoundingClientRect()
      const x = Math.min(startRef.current.x, me.clientX) - containerRect.left
      const y = Math.min(startRef.current.y, me.clientY) - containerRect.top
      const w = Math.abs(dx)
      const h = Math.abs(dy)
      setRect({ x, y, w, h })
    }

    const onUp = (ue: PointerEvent) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)

      const dx = ue.clientX - startRef.current.x
      const dy = ue.clientY - startRef.current.y

      if (Math.abs(dx) < MIN_DRAG_PX && Math.abs(dy) < MIN_DRAG_PX) {
        setDragging(false)
        return
      }

      // Calculate world rectangle from screen positions
      selectBoardsInRect(
        startRef.current.x,
        startRef.current.y,
        ue.clientX,
        ue.clientY,
        ctrlRef.current
      )

      setDragging(false)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [activeTool, isOrtho, canvasRef])

  // Attach pointer listener to the canvas container
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Listen on the container, not on the R3F canvas itself
    // Use capture to see events before R3F
    canvas.addEventListener('pointerdown', handlePointerDown)
    return () => canvas.removeEventListener('pointerdown', handlePointerDown)
  }, [canvasRef, handlePointerDown])

  const selectBoardsInRect = useCallback(
    (sx1: number, sy1: number, sx2: number, sy2: number, addToSelection: boolean) => {
      const cam = cameraRef.current
      const canvas = canvasRef.current
      if (!cam || !canvas) return

      const view = activeView as Exclude<ViewMode, '3d'>
      const axes = VIEW_AXES[view]
      if (!axes) return

      const containerRect = canvas.getBoundingClientRect()

      // Convert screen corners to NDC
      const toNDC = (sx: number, sy: number) => ({
        x: ((sx - containerRect.left) / containerRect.width) * 2 - 1,
        y: -((sy - containerRect.top) / containerRect.height) * 2 + 1
      })

      const ndc1 = toNDC(sx1, sy1)
      const ndc2 = toNDC(sx2, sy2)

      // Unproject NDC to world coordinates
      const world1 = new THREE.Vector3(ndc1.x, ndc1.y, 0).unproject(cam)
      const world2 = new THREE.Vector3(ndc2.x, ndc2.y, 0).unproject(cam)

      // Get the marquee rectangle in the relevant world axes
      const wAxis = axes.screenX
      const hAxis = axes.screenY

      const minW = Math.min(world1[wAxis], world2[wAxis])
      const maxW = Math.max(world1[wAxis], world2[wAxis])
      const minH = Math.min(world1[hAxis], world2[hAxis])
      const maxH = Math.max(world1[hAxis], world2[hAxis])

      // Find all boards that overlap with the marquee rectangle
      const project = useProjectStore.getState().project
      const matchedIds: string[] = []
      let matchedAssemblyId: string | null = null

      for (const assembly of project.assemblies) {
        if (assembly.visible === false) continue
        for (const board of assembly.boards) {
          // Board AABB in world space (position is corner, not center)
          const bMinW = board.position[wAxis]
          const bMaxW = board.position[wAxis] + (wAxis === 'x' ? board.width : wAxis === 'y' ? board.height : board.depth)
          const bMinH = board.position[hAxis]
          const bMaxH = board.position[hAxis] + (hAxis === 'x' ? board.width : hAxis === 'y' ? board.height : board.depth)

          // AABB overlap test
          if (bMaxW >= minW && bMinW <= maxW && bMaxH >= minH && bMinH <= maxH) {
            matchedIds.push(board.id)
            matchedAssemblyId = assembly.id
          }
        }
      }

      if (matchedIds.length === 0) {
        if (!addToSelection) {
          useUIStore.getState().deselectAll()
        }
        return
      }

      const ui = useUIStore.getState()

      if (addToSelection) {
        // Add to existing selection (if same assembly)
        const currentIds = ui.selectedBoardIds
        const merged = [...new Set([...currentIds, ...matchedIds])]
        useUIStore.setState({
          selectedAssemblyId: matchedAssemblyId,
          selectedBoardIds: merged
        })
      } else {
        useUIStore.setState({
          selectedAssemblyId: matchedAssemblyId,
          selectedBoardIds: matchedIds
        })
      }
    },
    [activeView, cameraRef, canvasRef]
  )

  if (!dragging) return null

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        border: '1px solid #3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        zIndex: 10
      }}
    />
  )
}
