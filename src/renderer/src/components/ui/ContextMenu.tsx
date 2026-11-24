import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useProjectStore } from '../../store/useProjectStore'
import { beginDragHistory, endDragHistory } from '../../utils/dragHistory'
import { useDesignHint, useDesignLocked } from '../../hooks/useDesignLocked'
import { subtreeIds } from '../../utils/assemblyTree'

/** Gap kept between the menu and the window edge (px) */
const EDGE_GAP = 4

/** Menu items of a menu element, in DOM order */
function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>(':scope > [role="menuitem"], :scope > div > [role="menuitem"]')] : []
}

/** Up/Down/Home/End move focus between the items of `menu` (wrapping). */
function moveFocus(menu: HTMLElement | null, key: string): boolean {
  const items = menuItems(menu)
  if (items.length === 0) return false
  const idx = items.indexOf(document.activeElement as HTMLElement)
  const next =
    key === 'ArrowDown' ? (idx + 1) % items.length
    : key === 'ArrowUp' ? (idx - 1 + items.length) % items.length
    : key === 'Home' ? 0
    : key === 'End' ? items.length - 1
    : -1
  if (next < 0) return false
  items[next].focus()
  return true
}

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
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const steps = useProjectStore((s) => s.project.assemblySteps)
  const assignBoardsToStep = useProjectStore((s) => s.assignBoardsToStep)
  // the assembly workspace offers only what it changes: the step a part goes into
  const locked = useDesignLocked()
  const { hint } = useDesignHint()
  const menuRef = useRef<HTMLDivElement>(null)
  const subMenuRef = useRef<HTMLDivElement>(null)
  const moveItemRef = useRef<HTMLButtonElement>(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [subMenuLeft, setSubMenuLeft] = useState(false)

  // Every opening starts with the Move submenu collapsed
  useEffect(() => {
    setShowMoveMenu(false)
  }, [contextMenu])

  // Keep the menu inside the window (it opens at the pointer, which may be
  // near the right or bottom edge). Layout effect: clamped before first paint.
  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const r = menuRef.current.getBoundingClientRect()
    setPos({
      left: Math.max(EDGE_GAP, Math.min(contextMenu.x, window.innerWidth - r.width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(contextMenu.y, window.innerHeight - r.height - EDGE_GAP))
    })
  }, [contextMenu])

  // The submenu opens to the left when there is no room on the right
  useLayoutEffect(() => {
    if (!showMoveMenu || !menuRef.current || !subMenuRef.current) return
    const menu = menuRef.current.getBoundingClientRect()
    const sub = subMenuRef.current.getBoundingClientRect()
    setSubMenuLeft(menu.right + sub.width + EDGE_GAP > window.innerWidth)
  }, [showMoveMenu, pos])

  // Focus moves into the menu when it opens and back when it closes
  useEffect(() => {
    if (!contextMenu) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    menuItems(menuRef.current)[0]?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [contextMenu])

  // Close on click outside; Esc (or Tab) closes — handled here so the global
  // Esc shortcut doesn't also deselect the board the menu was opened for
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        setContextMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
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

  // The boards the menu acts on: the selection when opened on one of its boards
  const targetIds = isMulti ? selectedBoardIds : [contextMenu.boardId]
  // A joint needs exactly two boards (the joint dialog reads the selection)
  const canJoin = isMulti && selectedBoardIds.length === 2

  const handleRotate = () => {
    // +90° about the vertical axis, like the 3D selection toolbar; one undo step for all
    const assembly = assemblies.find((a) => a.id === contextMenu.assemblyId)
    beginDragHistory()
    try {
      for (const id of targetIds) {
        const board = assembly?.boards.find((b) => b.id === id)
        if (board) updateBoard(contextMenu.assemblyId, id, { rotation: { ...board.rotation, y: ((board.rotation.y ?? 0) + 90) % 360 } })
      }
    } finally {
      endDragHistory()
    }
    setContextMenu(null)
  }

  const handleJoint = () => {
    if (!canJoin) return
    setContextMenu(null)
    useUIStore.getState().setShowJointDialog(true)
  }

  const handleHideAssembly = () => {
    // the eye, not the tick: hides the assembly and its subgroups in the view only — they
    // still count in every list (the eye also drops them from the selection)
    const ids = subtreeIds(assemblies, contextMenu.assemblyId)
    useUIStore.getState().setPartsHidden(assemblies.filter((a) => ids.has(a.id)).flatMap((a) => a.boards.map((b) => b.id)), true)
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

  const handleMoveToStep = (stepId: string | null) => {
    assignBoardsToStep(targetIds, stepId)
    setContextMenu(null)
  }

  const handleDeselect = () => {
    useUIStore.getState().deselectAll()
    setContextMenu(null)
  }

  const openMoveMenu = () => {
    setShowMoveMenu(true)
    requestAnimationFrame(() => menuItems(subMenuRef.current)[0]?.focus())
  }

  // Arrow keys / Home / End within the menu; Right opens the submenu, Left closes it.
  // The shortcut hints shown on the items (D, Del) work while the menu is open.
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const inSub = subMenuRef.current?.contains(document.activeElement) ?? false
    if (locked && moveFocus(inSub ? subMenuRef.current : menuRef.current, e.key)) {
      e.preventDefault()
    } else if (locked) {
      if (e.key === 'ArrowRight' && document.activeElement === moveItemRef.current) { e.preventDefault(); openMoveMenu() }
      else if (e.key === 'ArrowLeft' && inSub) { e.preventDefault(); setShowMoveMenu(false); moveItemRef.current?.focus() }
    } else if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      handleDuplicate()
    } else if (e.key === 'Delete') {
      e.preventDefault()
      handleDelete()
    } else if ((e.key === 'j' || e.key === 'J') && canJoin && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      handleJoint()
    } else if (moveFocus(inSub ? subMenuRef.current : menuRef.current, e.key)) {
      e.preventDefault()
    } else if (e.key === 'ArrowRight' && document.activeElement === moveItemRef.current) {
      e.preventDefault()
      openMoveMenu()
    } else if (e.key === 'ArrowLeft' && inSub) {
      e.preventDefault()
      setShowMoveMenu(false)
      moveItemRef.current?.focus()
    }
  }

  const ownAssembly = assemblies.find((a) => a.id === contextMenu.assemblyId)

  // Where the parts can go: in the assembly workspace a step (or none), else another assembly
  const otherAssemblies = assemblies.filter((a) => a.id !== contextMenu.assemblyId)
  const moveTargets = locked
    ? !steps?.length ? [] : [...steps.map((st, i) => ({ id: st.id, label: `${t('montage.step', { n: i + 1 })} · ${st.title}`, go: () => handleMoveToStep(st.id) })),
       { id: '', label: t('montage.unplan'), go: () => handleMoveToStep(null) }]
    : otherAssemblies.map((a) => ({ id: a.id, label: a.name, go: () => handleMoveTo(a.id) }))
  const moveLabel = locked ? t('montage.moveTo') : t('actions.moveToAssembly')

  const dupLabel = isMulti
    ? `${t('actions.duplicate')} (${count})`
    : t('actions.duplicate')
  const delLabel = isMulti
    ? `${t('actions.delete')} (${count})`
    : t('actions.delete')

  const itemClass = 'w-full text-left px-3 py-1.5 text-sm text-chrome-text hover:bg-chrome-hover focus:bg-chrome-hover outline-none flex items-center justify-between gap-4'
  const hintClass = 'text-chrome-hint text-xs font-mono'

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('ui.boardMenu')}
      onKeyDown={handleMenuKeyDown}
      className="fixed z-50 min-w-[200px] rounded-md border border-chrome-border bg-chrome-bg py-1 shadow-2xl"
      style={{ left: pos?.left ?? contextMenu.x, top: pos?.top ?? contextMenu.y }}
    >
      {!locked && (
        <>
          <button role="menuitem" tabIndex={-1} onClick={handleDuplicate} className={itemClass}>
            <span>{dupLabel}</span>
            <span className={hintClass}>D</span>
          </button>
          <button role="menuitem" tabIndex={-1} onClick={handleRotate} className={itemClass}>
            <span>{isMulti ? `${t('ui.rotate90')} (${count})` : t('ui.rotate90')}</span>
          </button>
          {canJoin && (
            <button role="menuitem" tabIndex={-1} onClick={handleJoint} className={itemClass}>
              <span>{t('dlg.createJoint')}</span>
              <span className={hintClass}>J</span>
            </button>
          )}
          <div role="separator" className="my-1 border-t border-chrome-border" />
        </>
      )}
      {moveTargets.length > 0 && (
        <div className="relative">
          <button
            ref={moveItemRef}
            role="menuitem"
            tabIndex={-1}
            aria-haspopup="menu"
            aria-expanded={showMoveMenu}
            onClick={() => (showMoveMenu ? setShowMoveMenu(false) : openMoveMenu())}
            className={itemClass}
          >
            <span>{moveLabel}</span>
            <svg viewBox="0 0 16 16" className={`h-3 w-3 text-chrome-hint ${subMenuLeft && showMoveMenu ? 'rotate-180' : ''}`} aria-hidden="true">
              <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showMoveMenu && (
            <div
              ref={subMenuRef}
              role="menu"
              aria-label={moveLabel}
              className={`absolute top-0 z-10 min-w-[160px] max-w-[260px] rounded-md border border-chrome-border bg-chrome-bg py-1 shadow-2xl ${subMenuLeft ? 'right-full' : 'left-full'}`}
            >
              {moveTargets.map((target) => (
                <button
                  key={target.id}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={target.go}
                  title={target.label}
                  className="w-full text-left px-3 py-1.5 text-sm text-chrome-text hover:bg-chrome-hover focus:bg-chrome-hover outline-none truncate"
                >
                  {target.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {locked ? (
        <>
          <button role="menuitem" tabIndex={-1} onClick={handleDeselect} className={itemClass}>
            <span>{t('ui.deselect')}</span>
          </button>
          <div role="separator" className="my-1 border-t border-chrome-border" />
          <p className="px-3 py-1.5 text-xs text-chrome-muted" data-testid="context-design-hint">{hint}</p>
        </>
      ) : (
        <>
          {ownAssembly && (
            <button role="menuitem" tabIndex={-1} onClick={handleHideAssembly} className={itemClass} title={ownAssembly.name}>
              <span>{t('dlg.hideAssembly')}</span>
            </button>
          )}
          <div role="separator" className="my-1 border-t border-chrome-border" />
          <button
            role="menuitem"
            tabIndex={-1}
            onClick={handleDelete}
            className="w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-danger-dim/50 focus:bg-danger-dim/50 outline-none flex items-center justify-between gap-4"
          >
            <span>{delLabel}</span>
            <span className={hintClass}>{t('dlg.delKey')}</span>
          </button>
        </>
      )}
    </div>
  )
}
