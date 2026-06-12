import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'

export function ContextMenu() {
  const { t } = useTranslation()
  const contextMenu = useUIStore((s) => s.contextMenu)
  const setContextMenu = useUIStore((s) => s.setContextMenu)
  const selectBoard = useUIStore((s) => s.selectBoard)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const duplicateBoard = useProjectStore((s) => s.duplicateBoard)
  const removeBoard = useProjectStore((s) => s.removeBoard)
  const duplicateBoards = useProjectStore((s) => s.duplicateBoards)
  const removeBoards = useProjectStore((s) => s.removeBoards)
  const moveBoardToAssembly = useProjectStore((s) => s.moveBoardToAssembly)
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)

  // Close on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu, setContextMenu])

  if (!contextMenu) return null

  const isMulti = selectedBoardIds.length > 1 && selectedBoardIds.includes(contextMenu.boardId)
  const count = isMulti ? selectedBoardIds.length : 1

  const handleDuplicate = () => {
    if (isMulti) {
      const newIds = duplicateBoards(contextMenu.assemblyId, selectedBoardIds)
      useUIStore.setState({ selectedBoardIds: newIds })
    } else {
      const newId = duplicateBoard(contextMenu.assemblyId, contextMenu.boardId)
      if (newId) selectBoard(contextMenu.assemblyId, newId)
    }
    setContextMenu(null)
  }

  const handleDelete = () => {
    if (isMulti) {
      removeBoards(contextMenu.assemblyId, selectedBoardIds)
    } else {
      removeBoard(contextMenu.assemblyId, contextMenu.boardId)
    }
    useUIStore.getState().deselectAll()
    setContextMenu(null)
  }

  const handleMoveTo = (targetAssemblyId: string) => {
    if (isMulti) {
      // Move each selected board individually
      for (const bid of selectedBoardIds) {
        moveBoardToAssembly(contextMenu.assemblyId, bid, targetAssemblyId)
      }
      useUIStore.getState().deselectAll()
    } else {
      moveBoardToAssembly(contextMenu.assemblyId, contextMenu.boardId, targetAssemblyId)
      selectBoard(targetAssemblyId, contextMenu.boardId)
    }
    setContextMenu(null)
  }

  // Other assemblies to move to
  const otherAssemblies = assemblies.filter((a) => a.id !== contextMenu.assemblyId)

  const dupLabel = isMulti
    ? `${t('actions.duplicate')} (${count})`
    : t('actions.duplicate')
  const delLabel = isMulti
    ? `${t('actions.delete')} (${count})`
    : t('actions.delete')

  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded shadow-lg border border-gray-200 py-1 z-[100] min-w-[160px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        onClick={handleDuplicate}
        className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 flex justify-between"
      >
        <span>{dupLabel}</span>
        <span className="text-gray-400 text-xs ml-4">Ctrl+D</span>
      </button>
      {otherAssemblies.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowMoveMenu(!showMoveMenu)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 flex justify-between"
          >
            <span>{t('actions.moveToAssembly')}</span>
            <span className="text-gray-400 text-xs ml-4">▶</span>
          </button>
          {showMoveMenu && (
            <div className="absolute left-full top-0 bg-white rounded shadow-lg border border-gray-200 py-1 min-w-[140px] z-10">
              {otherAssemblies.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleMoveTo(a.id)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 truncate"
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="border-t border-gray-100 my-0.5" />
      <button
        onClick={handleDelete}
        className="w-full text-left px-4 py-1.5 text-sm hover:bg-red-50 text-red-600 flex justify-between"
      >
        <span>{delLabel}</span>
        <span className="text-gray-400 text-xs ml-4">Del</span>
      </button>
    </div>
  )
}
