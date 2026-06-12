import { useEffect } from 'react'
import { useUIStore } from '../store/useUIStore'
import { useProjectStore } from '../store/useProjectStore'
import type { ToolMode } from '../types/measurement'

export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const ui = useUIStore.getState()
      const proj = useProjectStore.getState()

      // View switching: Alt+1/2/3/4
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        const viewMap: Record<string, any> = { '1': 'front', '2': 'side', '3': 'top', '4': '3d' }
        ui.setActiveView(viewMap[e.key])
        return
      }

      // Tool shortcuts: 1-4 (without Alt)
      const toolMap: Record<string, ToolMode> = {
        '1': 'select',
        '2': 'measure',
        '3': 'angle',
        '4': 'area'
      }
      if (!e.altKey && !e.ctrlKey && toolMap[e.key]) {
        e.preventDefault()
        ui.setActiveTool(toolMap[e.key])
        return
      }

      // J: open joint creation dialog when 2 boards selected
      if ((e.key === 'j' || e.key === 'J') && !e.ctrlKey) {
        if (ui.selectedBoardIds.length === 2 && ui.selectedAssemblyId) {
          e.preventDefault()
          ui.setShowJointDialog(true)
        }
        return
      }

      // Ctrl+A: select all boards in current assembly
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault()
        if (ui.selectedAssemblyId) {
          ui.selectAllBoards(ui.selectedAssemblyId)
        }
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
      if ((e.key === 'g' || e.key === 'G') && !e.altKey) {
        e.preventDefault()
        ui.setTransformMode('translate')
        return
      }

      // R: rotate mode (3D) — avoid Ctrl+R (browser reload)
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey) {
        e.preventDefault()
        ui.setTransformMode('rotate')
        return
      }

      // T: scale mode (axis-locked resize via arrow keys)
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        ui.setTransformMode('scale')
        return
      }

      // Zoom: + / -
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        ui.setZoom(ui.zoom * 1.1)
        return
      }
      if (e.key === '-' && !e.ctrlKey) {
        e.preventDefault()
        ui.setZoom(ui.zoom / 1.1)
        return
      }

      // Ctrl+Z: undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useProjectStore.temporal.getState().undo()
        return
      }

      // Ctrl+Shift+Z or Ctrl+Y: redo
      if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault()
        useProjectStore.temporal.getState().redo()
        return
      }

      // F: fit view
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey) {
        e.preventDefault()
        ui.triggerFitView()
        return
      }

      // Ctrl+O: open project (with save-before-open guard)
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        const hasBoards = proj.project.assemblies.some((a) => a.boards.length > 0)
        if (hasBoards) {
          // Use a simple confirm — i18n not available in keyboard handler, use hardcoded fallback
          const msg = proj.project.language === 'en'
            ? 'Unsaved changes will be lost. Open file?'
            : 'Ungespeicherte Änderungen gehen verloren. Datei öffnen?'
          if (!window.confirm(msg)) return
        }
        window.electronAPI?.fileOpen()
          .then((result: any) => {
            if (result) {
              try {
                const project = JSON.parse(result.content)
                proj.loadProject(project)
              } catch (err) {
                console.error('Failed to parse project file:', err)
              }
            }
          })
          .catch((err) => console.error('Failed to open file:', err))
        return
      }

      // Ctrl+D: duplicate selected boards
      if (e.ctrlKey && e.key === 'd') {
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
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey) {
        e.preventDefault()
        ui.toggleSnap()
        return
      }

      // Alt+G: toggle grid
      if ((e.key === 'g' || e.key === 'G') && e.altKey && !e.ctrlKey) {
        e.preventDefault()
        ui.toggleGrid()
        return
      }

      // B: toggle assembly drawer
      if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        ui.setShowAssemblyDrawer(!ui.showAssemblyDrawer)
        return
      }

      // ?: toggle shortcuts overlay
      if (e.key === '?' && !e.ctrlKey) {
        e.preventDefault()
        ui.setShowShortcutsOverlay(!ui.showShortcutsOverlay)
        return
      }

      // Ctrl+S: save project
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        const data = JSON.stringify(proj.project, null, 2)
        window.electronAPI?.fileSave(data, `${proj.project.name}.abrichten.json`)
          ?.catch((err) => console.error('Failed to save file:', err))
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
