import { useEffect, useRef } from 'react'
import { useUIStore, topModal, WORKSPACES } from '../store/useUIStore'
import { useProjectStore } from '../store/useProjectStore'
import type { ToolMode, ViewMode } from '../types/measurement'
import { openProjectFile, saveProjectFile, confirmDiscardChanges } from '../services/projectFile'
import { isDragActive, cancelTransform } from '../utils/transformLock'
import { cancelDragHistory } from '../utils/dragHistory'
import { isCmdKey, noCmdKey, keyName, digitOf, isLetterKey } from '../utils/shortcutKeys'

/** A dialog the UI store doesn't track (e.g. the assembly drawer's joint
 *  dialog) is open — every modal in the app sets aria-modal. */
function domModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Already handled by the focused component (palette input, context menu, drawer …).
      // A field whose Esc cancels its own edit must preventDefault, or Esc below also
      // closes the dialog around it / deselects the board.
      if (e.defaultPrevented) return

      // Esc during a gizmo / board drag cancels it and restores the pre-drag state
      if (e.key === 'Escape' && isDragActive()) {
        e.preventDefault()
        cancelTransform()
        cancelDragHistory()
        return
      }
      // Every other shortcut waits for the drag to end: switching mode, tool or
      // view, deleting or undoing would pull the dragged object out from under it
      if (isDragActive()) return

      const ui = useUIStore.getState()
      const proj = useProjectStore.getState()
      const modal = topModal(ui)

      // Esc closes the topmost modal — also from a text field inside it
      // (fields that handle Esc themselves, like the palette's, prevent default)
      if (e.key === 'Escape' && modal) {
        e.preventDefault()
        ui.closeTopModal()
        return
      }

      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // "Ctrl" below is Ctrl, or ⌘ on macOS; plain letters fire without either
      // (utils/shortcutKeys). Letters compare in lower case: ⇧ / Caps Lock.
      const cmd = isCmdKey(e)
      const plain = noCmdKey(e)
      const k = keyName(e)

      // Ctrl+S: save project — also while a modal is open (it changes nothing on screen)
      if (cmd && k === 's') {
        e.preventDefault()
        void saveProjectFile()
        return
      }

      // A modal is open: ? closes the shortcut overlay (Esc see above), and
      // every other global shortcut is off until it is closed — arrows scroll
      // its list instead of nudging boards, Del doesn't delete the selection
      // behind it, Ctrl+O doesn't swap the project under it.
      if (modal || domModalOpen()) {
        if (e.key === '?' && modal === 'showShortcutsOverlay') {
          e.preventDefault()
          ui.closeTopModal()
        }
        return
      }

      // View switching: Alt+1/2/3/4 — by physical key, ⌥1 types "¡" on macOS
      const viewMap: Record<string, ViewMode> = { '1': 'front', '2': 'side', '3': 'top', '4': '3d' }
      const digit = digitOf(e)
      if (e.altKey && digit && viewMap[digit]) {
        e.preventDefault()
        ui.setActiveView(viewMap[digit])
        return
      }

      // Tool shortcuts: 1-4 (without Alt)
      const toolMap: Record<string, ToolMode> = {
        '1': 'select',
        '2': 'measure',
        '3': 'angle',
        '4': 'area'
      }
      if (!e.altKey && plain && toolMap[e.key]) {
        e.preventDefault()
        ui.setActiveTool(toolMap[e.key])
        return
      }

      // J: open joint creation dialog when 2 boards selected
      if (k === 'j' && plain) {
        if (ui.selectedBoardIds.length === 2 && ui.selectedAssemblyId) {
          e.preventDefault()
          ui.setShowJointDialog(true)
        }
        return
      }

      // Ctrl+A: select all boards in current assembly
      if (cmd && k === 'a') {
        e.preventDefault()
        if (ui.selectedAssemblyId) {
          ui.selectAllBoards(ui.selectedAssemblyId)
        }
        return
      }

      // ⌘1 / ⌘2: workspaces design, assembly — by physical key like ⌥1–4
      const wsDigit = cmd && !e.altKey && !e.shiftKey ? digitOf(e) : null
      if (wsDigit && WORKSPACES[Number(wsDigit) - 1]) {
        e.preventDefault()
        ui.setWorkspace(WORKSPACES[Number(wsDigit) - 1])
        return
      }

      // Escape: deselect + reset tool
      if (e.key === 'Escape') {
        e.preventDefault()
        ui.deselectAll()
        ui.setActiveTool('select')
        ui.clearMeasurements()
        return
      }

      // Shift+F10 / context-menu key: the board context menu for the selection,
      // opened over the middle of the canvas
      if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        if (ui.selectedBoardIds.length > 0 && ui.selectedAssemblyId) {
          e.preventDefault()
          const rect = document.querySelector('canvas')?.getBoundingClientRect()
          ui.setContextMenu({
            x: rect ? Math.round(rect.left + rect.width / 2) : Math.round(window.innerWidth / 2),
            y: rect ? Math.round(rect.top + rect.height / 2) : Math.round(window.innerHeight / 2),
            boardId: ui.selectedBoardIds[0],
            assemblyId: ui.selectedAssemblyId
          })
        }
        return
      }

      // Delete / Backspace: remove selected boards
      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedBoardIds.length > 0 && ui.selectedAssemblyId) {
        e.preventDefault()
        if (ui.selectedBoardIds.length === 1) {
          proj.removeBoard(ui.selectedAssemblyId, ui.selectedBoardIds[0])
        } else {
          proj.removeBoards(ui.selectedAssemblyId, ui.selectedBoardIds)
        }
        ui.deselectAll()
        return
      }

      // Arrow keys: nudge selected boards (translate) OR resize (scale mode)
      if (e.key.startsWith('Arrow') && ui.selectedBoardIds.length > 0 && ui.selectedAssemblyId) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1 // mm

        // Scale mode: arrows resize selected boards along axes of the active view
        if (ui.transformMode === 'scale') {
          const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
          const sign = (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 1

          let dim: 'width' | 'height' | 'depth'
          switch (ui.activeView) {
            case 'front': dim = horizontal ? 'width' : 'height'; break
            case 'side':  dim = horizontal ? 'depth' : 'height'; break
            case 'top':   dim = horizontal ? 'width' : 'depth';  break
            default:      dim = horizontal ? 'width' : 'height'  // 3d
          }

          const delta = sign * step
          const assembly = proj.project.assemblies.find((a) => a.id === ui.selectedAssemblyId)
          if (!assembly) return
          for (const bid of ui.selectedBoardIds) {
            const b = assembly.boards.find((x) => x.id === bid)
            if (!b) continue
            const current = b[dim] as number
            const next = Math.max(1, current + delta)
            if (next !== current) {
              proj.updateBoard(ui.selectedAssemblyId, bid, { [dim]: next })
            }
          }
          return
        }

        // Translate mode (default): nudge position
        const delta = { x: 0, y: 0, z: 0 }
        switch (e.key) {
          case 'ArrowLeft':  delta.x = -step; break
          case 'ArrowRight': delta.x = step; break
          case 'ArrowUp':    delta.y = step; break
          case 'ArrowDown':  delta.y = -step; break
        }
        proj.nudgeBoards(ui.selectedAssemblyId, ui.selectedBoardIds, delta)
        return
      }

      // G: translate mode (3D) — not when Alt is held (Alt+G = grid toggle)
      if (k === 'g' && plain && !e.altKey) {
        e.preventDefault()
        ui.setTransformMode('translate')
        return
      }

      // R: rotate mode (3D) — avoid Ctrl+R (browser reload)
      if (k === 'r' && plain) {
        e.preventDefault()
        ui.setTransformMode('rotate')
        return
      }

      // T: scale mode (axis-locked resize via arrow keys)
      if (k === 't' && plain && !e.altKey) {
        e.preventDefault()
        ui.setTransformMode('scale')
        return
      }

      // + / -: size of the dimension labels (the camera zooms with the wheel / F)
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        ui.setZoom(ui.zoom * 1.1)
        return
      }
      if (e.key === '-' && plain) {
        e.preventDefault()
        ui.setZoom(ui.zoom / 1.1)
        return
      }

      // Ctrl+Z: undo
      if (cmd && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        useProjectStore.temporal.getState().undo()
        return
      }

      // Ctrl+Shift+Z or Ctrl+Y: redo
      if (cmd && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault()
        useProjectStore.temporal.getState().redo()
        return
      }

      // F: fit view
      if (k === 'f' && plain) {
        e.preventDefault()
        ui.triggerFitView()
        return
      }

      // Ctrl+O: open project (with save-before-open guard)
      if (cmd && k === 'o') {
        e.preventDefault()
        if (!confirmDiscardChanges('open')) return
        void openProjectFile()
        return
      }

      // D / Ctrl+D: duplicate selected boards (not Win+D, the system's)
      if (k === 'd' && !e.altKey && (plain || cmd)) {
        e.preventDefault()
        if (ui.selectedBoardIds.length > 0 && ui.selectedAssemblyId) {
          if (ui.selectedBoardIds.length === 1) {
            const newId = proj.duplicateBoard(ui.selectedAssemblyId, ui.selectedBoardIds[0])
            if (newId) ui.selectBoard(ui.selectedAssemblyId, newId)
          } else {
            const newIds = proj.duplicateBoards(ui.selectedAssemblyId, ui.selectedBoardIds)
            useUIStore.setState({ selectedBoardIds: newIds })
          }
        }
        return
      }

      // S: toggle snap
      if (k === 's' && plain) {
        e.preventDefault()
        ui.toggleSnap()
        return
      }

      // Alt+G: toggle grid — by physical key too, ⌥G types "©" on macOS
      if (e.altKey && plain && isLetterKey(e, 'g')) {
        e.preventDefault()
        ui.toggleGrid()
        return
      }

      // B: toggle assembly drawer
      if (k === 'b' && plain && !e.altKey) {
        e.preventDefault()
        ui.setShowAssemblyDrawer(!ui.showAssemblyDrawer)
        return
      }

      // ?: toggle shortcuts overlay
      if (e.key === '?' && plain) {
        e.preventDefault()
        ui.setShowShortcutsOverlay(!ui.showShortcutsOverlay)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus handling for a modal dialog: moves focus into the dialog when it opens
 * (onto the dialog itself unless a child already took it, e.g. via autoFocus),
 * keeps Tab / Shift+Tab inside it, and hands focus back to whatever had it
 * when the dialog closes. Put the returned ref on the element carrying
 * role="dialog" and give that element tabIndex={-1}.
 */
export function useDialogFocus<T extends HTMLElement>(open: boolean): React.RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!open || !el) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!el.contains(document.activeElement)) el.focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const active = document.activeElement
      // Focus sits in another (stacked) dialog — that one traps it
      if (active?.closest('[aria-modal="true"]') && !el.contains(active)) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (items.length === 0) { e.preventDefault(); el.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (!el.contains(active) || (e.shiftKey && (active === first || active === el))) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  return ref
}
