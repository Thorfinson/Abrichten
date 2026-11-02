import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore, type AssemblyDrop } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { boardPresets, presetToBoard } from '../../data/board-presets'
import { getMaterialById } from '../../data/materials'
import { boardWeightKg } from '../../services/static-sim'
import type { Assembly, Board, JointType, Material } from '../../types/furniture'
import { subtreeIds, ancestorIds } from '../../utils/assemblyTree'
import { computeJointPosition } from '../../utils/geometry'
import { useDialogFocus } from '../../hooks/useKeyboard'
import { Icon } from './Icon'

function assemblyStats(boards: Board[], customMaterials?: Material[]) {
  if (boards.length === 0) return null

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  let totalWeightKg = 0

  for (const b of boards) {
    minX = Math.min(minX, b.position.x)
    maxX = Math.max(maxX, b.position.x + b.width)
    minY = Math.min(minY, b.position.y)
    maxY = Math.max(maxY, b.position.y + b.height)
    minZ = Math.min(minZ, b.position.z)
    maxZ = Math.max(maxZ, b.position.z + b.depth)

    totalWeightKg += boardWeightKg(b, getMaterialById(b.materialId, customMaterials))
  }

  return {
    w: Math.round(maxX - minX),
    h: Math.round(maxY - minY),
    d: Math.round(maxZ - minZ),
    kg: Math.round(totalWeightKg * 10) / 10
  }
}

const presetGroups = [
  { labelKey: 'materials.solid_wood', ids: ['brett', 'dachlatte', 'kantholz', 'leiste', 'bohle'] },
  { labelKey: 'materials.panel', ids: ['regal-seite', 'regal-boden', 'rueckwand', 'multiplex-platte'] },
  { labelKey: 'materials.stone', ids: ['arbeitsplatte-granit', 'arbeitsplatte-keramik', 'fensterbank'] },
  { labelKey: 'presets.appliances', ids: ['herd', 'kochfeld', 'spuele', 'geschirrspueler'] }
]

export function AssemblyDrawer() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const show    = useUIStore((s) => s.showAssemblyDrawer)

  const project = useProjectStore((s) => s.project)
  const addAssembly = useProjectStore((s) => s.addAssembly)
  const addBoard = useProjectStore((s) => s.addBoard)
  const removeAssembly = useProjectStore((s) => s.removeAssembly)
  const renameAssembly = useProjectStore((s) => s.renameAssembly)
  const moveAssembly = useProjectStore((s) => s.moveAssembly)
  const moveBoardsToAssembly = useProjectStore((s) => s.moveBoardsToAssembly)
  const toggleAssemblyVisibility = useProjectStore((s) => s.toggleAssemblyVisibility)
  const toggleAssemblyHighlight = useProjectStore((s) => s.toggleAssemblyHighlight)
  const addJoint = useProjectStore((s) => s.addJoint)
  const selectBoard = useUIStore((s) => s.selectBoard)
  const selectAllBoards = useUIStore((s) => s.selectAllBoards)
  const toggleBoardSelection = useUIStore((s) => s.toggleBoardSelection)
  const deselectAll = useUIStore((s) => s.deselectAll)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)

  const [presetMenuOpen, setPresetMenuOpen] = useState<string | null>(null)
  const [assemblyMenu, setAssemblyMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renamingAssemblyId, setRenamingAssemblyId] = useState<string | null>(null)
  const [customFormAssemblyId, setCustomFormAssemblyId] = useState<string | null>(null)
  const [customW, setCustomW] = useState('600')
  const [customH, setCustomH] = useState('18')
  const [customD, setCustomD] = useState('400')
  const menuRef = useRef<HTMLDivElement>(null)
  const assemblyMenuRef = useRef<HTMLDivElement>(null)
  const boardItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())


  const dragSrcId = useRef<string | null>(null)
  const boardDrag = useRef<{ fromAssemblyId: string; boardIds: string[] } | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; where: AssemblyDrop } | null>(null)
  // Groups start collapsed; the group of a selected board (and every group above it) opens automatically
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (selectedBoardIds.length === 0 || !selectedAssemblyId) return
    const open = [selectedAssemblyId, ...ancestorIds(useProjectStore.getState().project.assemblies, selectedAssemblyId)]
    setExpandedIds((prev) => (open.every((id) => prev.has(id)) ? prev : new Set([...prev, ...open])))
  }, [selectedAssemblyId, selectedBoardIds])

  // Scroll the selected board into view once it is rendered (its group may open first)
  const lastScrolledId = useRef<string | null>(null)
  useEffect(() => {
    if (selectedBoardIds.length !== 1) { lastScrolledId.current = null; return }
    const id = selectedBoardIds[0]
    if (lastScrolledId.current === id) return
    const el = boardItemRefs.current.get(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    lastScrolledId.current = id
  }, [selectedBoardIds, expandedIds])

  const [jointDialog, setJointDialog] = useState<{
    assemblyId: string; boardAId: string; boardBId: string
  } | null>(null)
  const [jointType, setJointType] = useState<JointType>('dado')
  const jointDialogRef = useDialogFocus<HTMLDivElement>(jointDialog !== null)

  // Esc closes the joint dialog (and only it — preventDefault keeps the
  // global Esc from also deselecting or closing the drawer)
  useEffect(() => {
    if (!jointDialog) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setJointDialog(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [jointDialog])

  useEffect(() => {
    if (!presetMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [presetMenuOpen])

  useEffect(() => {
    if (!assemblyMenu) return
    const handleClick = (e: MouseEvent) => {
      if (assemblyMenuRef.current && !assemblyMenuRef.current.contains(e.target as Node)) {
        setAssemblyMenu(null)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault() // close just the menu, don't also deselect
      setAssemblyMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [assemblyMenu])

  const handleAddAssembly = () => {
    const id = addAssembly(t('sidebar.newAssemblyName') + ' ' + (project.assemblies.length + 1))
    selectBoard(id, null)
  }

  const handleAddPreset = (assemblyId: string, presetId: string) => {
    const preset = boardPresets.find((p) => p.id === presetId)
    if (!preset) return
    const boardData = presetToBoard(preset)
    boardData.name = t(preset.labelKey)
    const id = addBoard(assemblyId, boardData)
    selectBoard(assemblyId, id)
    setPresetMenuOpen(null)
  }

  const handleAddSubAssembly = (parentId: string) => {
    const id = addAssembly(t('sidebar.newAssemblyName') + ' ' + (project.assemblies.length + 1), parentId)
    setExpandedIds((prev) => new Set(prev).add(parentId))
    selectBoard(id, null)
    setAssemblyMenu(null)
  }

  const handleDeleteAssembly = (id: string) => {
    if (selectedAssemblyId && subtreeIds(project.assemblies, id).has(selectedAssemblyId)) deselectAll()
    removeAssembly(id)
    setAssemblyMenu(null)
  }

  const handleStartRename = (id: string) => {
    setRenamingAssemblyId(id)
    setAssemblyMenu(null)
  }

  const handleRenameCommit = (id: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed) renameAssembly(id, trimmed)
    setRenamingAssemblyId(null)
  }

  const handleAddCustomBoard = (assemblyId: string) => {
    const w = parseFloat(customW)
    const h = parseFloat(customH)
    const d = parseFloat(customD)
    if (isNaN(w) || isNaN(h) || isNaN(d) || w <= 0 || h <= 0 || d <= 0) return
    const id = addBoard(assemblyId, {
      name: t('board.customBoard').replace('...', ''),
      width: w, height: h, depth: d,
      materialId: 'buche', color: '#D4A574',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    })
    selectBoard(assemblyId, id)
    setCustomFormAssemblyId(null)
    setPresetMenuOpen(null)
  }

  const handleSelectAllInAssembly = (id: string) => {
    selectAllBoards(id)
    setAssemblyMenu(null)
  }

  const handleAssemblyContextMenu = (e: React.MouseEvent, assemblyId: string) => {
    e.preventDefault()
    setAssemblyMenu({ id: assemblyId, x: e.clientX, y: e.clientY })
  }

  // Dragging a group onto a header: top quarter = before, bottom quarter = after, middle = into it.
  // Boards dropped anywhere on a group move into that group.
  const dropZone = (e: React.DragEvent): AssemblyDrop => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = (e.clientY - r.top) / r.height
    return f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'inside'
  }
  const showDropHint = (id: string, where: AssemblyDrop) =>
    setDropHint((h) => (h?.id === id && h.where === where ? h : { id, where }))
  const dropBoards = (assemblyId: string) => {
    if (!boardDrag.current) return
    const { fromAssemblyId, boardIds } = boardDrag.current
    if (fromAssemblyId !== assemblyId) moveBoardsToAssembly(fromAssemblyId, boardIds, assemblyId)
  }
  const handleDragEnd = () => {
    boardDrag.current = null
    dragSrcId.current = null
    setDropHint(null)
  }
  const handleHeaderDragOver = (e: React.DragEvent, id: string) => {
    const src = dragSrcId.current
    if (!boardDrag.current && (!src || subtreeIds(project.assemblies, src).has(id))) return   // not into itself
    e.preventDefault()
    e.stopPropagation()
    showDropHint(id, boardDrag.current ? 'inside' : dropZone(e))
  }
  const handleHeaderDrop = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    const src = dragSrcId.current
    if (boardDrag.current) dropBoards(id)
    else if (src && src !== id) {
      const where = dropZone(e)
      moveAssembly(src, id, where)
      if (where === 'inside') setExpandedIds((prev) => new Set(prev).add(id))
    }
    handleDragEnd()
  }

  const handleCreateJoint = () => {
    if (!jointDialog) return
    const assembly = project.assemblies.find((a) => a.id === jointDialog.assemblyId)
    const boardA = assembly?.boards.find((b) => b.id === jointDialog.boardAId)
    const boardB = assembly?.boards.find((b) => b.id === jointDialog.boardBId)
    if (!boardA || !boardB) return
    addJoint(jointDialog.assemblyId, {
      type: jointType,
      boardA: jointDialog.boardAId,
      boardB: jointDialog.boardBId,
      position: computeJointPosition(boardA, boardB),
      fasteners: []
    })
    setJointDialog(null)
  }

  /** One tree level: header row, then (when open) stats, subgroups, own boards, add-board menu. */
  const renderNode = (assembly: Assembly, depth: number): React.ReactNode => {
    const open = expandedIds.has(assembly.id)
    const children = project.assemblies.filter((c) => c.parentId === assembly.id)
    const subtree = subtreeIds(project.assemblies, assembly.id)
    const stats = assemblyStats(project.assemblies.filter((a) => subtree.has(a.id)).flatMap((a) => a.boards), project.customMaterials)
    const hint = dropHint?.id === assembly.id ? dropHint.where : null
    const dim = assembly.visible === false ? 'opacity-40' : ''
    return (
      <div
        key={assembly.id}
        className={depth === 0 ? 'mb-3' : 'mb-1'}
        onDragOver={(e) => {
          if (!boardDrag.current) return
          e.preventDefault()
          e.stopPropagation()
          showDropHint(assembly.id, 'inside')
        }}
        onDrop={(e) => {
          if (!boardDrag.current) return
          e.preventDefault()
          e.stopPropagation()
          dropBoards(assembly.id)
          handleDragEnd()
        }}
      >
        <div
          data-assembly-id={assembly.id}
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            dragSrcId.current = assembly.id
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => handleHeaderDragOver(e, assembly.id)}
          onDrop={(e) => handleHeaderDrop(e, assembly.id)}
          onDragEnd={handleDragEnd}
          className={`text-[13px] font-medium px-1.5 py-1 rounded cursor-pointer flex items-center gap-1 ${
            selectedAssemblyId === assembly.id && selectedBoardIds.length === 0
              ? 'bg-action/25 text-chrome-text'
              : 'text-chrome-text hover:bg-chrome-surface'
          } ${hint === 'inside' ? 'ring-2 ring-action-hover' : ''} ${
            hint === 'before' ? 'shadow-[inset_0_2px_0_0_#60a5fa]' : hint === 'after' ? 'shadow-[inset_0_-2px_0_0_#60a5fa]' : ''
          }`}
          onClick={() => selectBoard(assembly.id, null)}
          onContextMenu={(e) => handleAssemblyContextMenu(e, assembly.id)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpandedIds((prev) => {
                const next = new Set(prev)
                next.has(assembly.id) ? next.delete(assembly.id) : next.add(assembly.id)
                return next
              })
            }}
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-chrome-muted hover:text-chrome-text"
            title={!open
              ? (lang === 'de' ? 'Aufklappen' : 'Expand')
              : (lang === 'de' ? 'Einklappen' : 'Collapse')}
            aria-label={!open
              ? (lang === 'de' ? 'Aufklappen' : 'Expand')
              : (lang === 'de' ? 'Einklappen' : 'Collapse')}
            aria-expanded={open}
          >
            <Icon name={open ? 'chevronDown' : 'chevronRight'} className="w-3 h-3" strokeWidth={2.25} />
          </button>
          <span
            className="shrink-0 text-chrome-hint hover:text-chrome-secondary cursor-grab active:cursor-grabbing select-none mr-0.5"
            title={lang === 'de' ? 'Ziehen: auf den Rand zum Sortieren, auf die Mitte zum Einhängen' : 'Drag: onto the edge to reorder, onto the middle to nest'}
          >⠿</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleAssemblyVisibility(assembly.id)
            }}
            className={`shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-chrome-hover ${
              assembly.visible !== false ? 'text-chrome-secondary' : 'text-chrome-hint'
            }`}
            title={t('sidebar.toggleVisibility')}
            aria-label={t('sidebar.toggleVisibility')}
            aria-pressed={assembly.visible !== false}
          >
            {assembly.visible !== false ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleAssemblyHighlight(assembly.id)
            }}
            className={`shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-chrome-hover ${
              assembly.highlight ? 'text-accent' : 'text-chrome-hint'
            }`}
            title={t('sidebar.highlightAssembly')}
            aria-label={t('sidebar.highlightAssembly')}
            aria-pressed={assembly.highlight === true}
          >
            {/* X-ray cube icon */}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 6h13v13H8zM3 3h13v13H3zM3 3l5 3M16 3l5 3M3 16l5 3M16 16l5 3" />
            </svg>
          </button>
          {renamingAssemblyId === assembly.id ? (
            <input
              autoFocus
              type="text"
              defaultValue={assembly.name}
              className="flex-1 min-w-0 text-xs bg-chrome-deep text-chrome-text border border-action-hover rounded px-1 py-0 outline-none"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => handleRenameCommit(assembly.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { e.preventDefault(); setRenamingAssemblyId(null) }
                e.stopPropagation()
              }}
            />
          ) : (
            <span className={`flex-1 truncate ${assembly.visible === false ? 'opacity-50' : ''}`}>
              {assembly.name}
            </span>
          )}
        </div>

        {open && (
          <div className="ml-3 mt-1">
            {stats && (
              <div className={`text-[10px] text-chrome-hint px-2 py-0.5 font-mono ${dim}`}>
                {stats.w}×{stats.h}×{stats.d}mm · {stats.kg}kg
              </div>
            )}

            {children.map((c) => renderNode(c, depth + 1))}

            <div className={dim}>
              {assembly.boards.map((board) => (
                <div
                  key={board.id}
                  ref={(el) => {
                    if (el) boardItemRefs.current.set(board.id, el)
                    else boardItemRefs.current.delete(board.id)
                  }}
                  title={`${board.name} · ${board.width}×${board.height}×${board.depth}mm`}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation()
                    const ids = selectedBoardIds.includes(board.id)
                      ? assembly.boards.filter((b) => selectedBoardIds.includes(b.id)).map((b) => b.id)
                      : [board.id]
                    boardDrag.current = { fromAssemblyId: assembly.id, boardIds: ids }
                  }}
                  onDragEnd={handleDragEnd}
                  className={`text-xs px-2 py-1 rounded cursor-pointer flex items-center gap-1.5 ${
                    selectedBoardIds.includes(board.id)
                      ? 'bg-action/25 text-chrome-text'
                      : 'text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text'
                  }`}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      toggleBoardSelection(assembly.id, board.id)
                    } else {
                      selectBoard(assembly.id, board.id)
                    }
                  }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-sm shrink-0 border border-white/30"
                    style={{ backgroundColor: board.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate leading-tight">{board.name}</div>
                    <div className={`text-[10px] font-mono leading-tight ${
                      selectedBoardIds.includes(board.id) ? 'text-info' : 'text-chrome-hint'
                    }`}>
                      {board.width}×{board.height}×{board.depth}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add board — preset picker */}
            <div className="relative mt-1" ref={presetMenuOpen === assembly.id ? menuRef : undefined}>
              <button
                onClick={() => setPresetMenuOpen(presetMenuOpen === assembly.id ? null : assembly.id)}
                className="text-xs text-info hover:text-info-text px-2 py-1"
              >
                + {t('sidebar.addBoard')}
              </button>

              {presetMenuOpen === assembly.id && (
                <div className="absolute left-0 top-full z-50 bg-chrome-bg text-chrome-text rounded-lg shadow-2xl border border-chrome-border py-1 w-52 max-h-80 overflow-y-auto">
                  {presetGroups.map((group) => (
                    <div key={group.labelKey}>
                      <div className="px-3 py-1 text-[10px] font-bold text-chrome-muted uppercase tracking-wide">
                        {t(group.labelKey)}
                      </div>
                      {group.ids.map((pid) => {
                        const preset = boardPresets.find((p) => p.id === pid)
                        if (!preset) return null
                        return (
                          <button
                            key={preset.id}
                            onClick={() => handleAddPreset(assembly.id, preset.id)}
                            className="w-full text-left px-3 py-1.5 text-xs text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text flex items-center gap-2"
                          >
                            <span
                              className="inline-block w-3 h-3 rounded-sm shrink-0 border border-chrome-border"
                              style={{ backgroundColor: preset.color }}
                            />
                            <span className="flex-1 truncate">{t(preset.labelKey)}</span>
                            <span className="text-[10px] text-chrome-hint whitespace-nowrap">
                              {preset.width}x{preset.height}x{preset.depth}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                  {/* Custom board */}
                  <div className="border-t border-chrome-border mt-1 pt-1">
                    {customFormAssemblyId === assembly.id ? (
                      <div className="px-3 py-2">
                        <div className="text-[10px] font-bold text-chrome-muted uppercase mb-1">{t('board.customBoard')}</div>
                        {[
                          { label: t('board.width'), state: customW, setter: setCustomW },
                          { label: t('board.height'), state: customH, setter: setCustomH },
                          { label: t('board.depth'), state: customD, setter: setCustomD }
                        ].map(({ label, state, setter }) => (
                          <div key={label} className="flex items-center gap-1 mb-1">
                            <label className="text-[10px] text-chrome-muted w-10 shrink-0">{label}</label>
                            <input
                              type="number"
                              value={state}
                              onChange={(e) => setter(e.target.value)}
                              className="flex-1 min-w-0 text-xs bg-chrome-deep text-chrome-text border border-chrome-border rounded px-1 py-0.5 outline-none focus:border-action-hover"
                            />
                            <span className="text-[10px] text-chrome-hint">mm</span>
                          </div>
                        ))}
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => handleAddCustomBoard(assembly.id)}
                            className="flex-1 text-xs bg-action text-action-text rounded py-0.5 hover:bg-action-hover"
                          >
                            + {t('sidebar.addBoard')}
                          </button>
                          <button
                            onClick={() => setCustomFormAssemblyId(null)}
                            aria-label={t('actions.cancel')}
                            title={t('actions.cancel')}
                            className="text-xs text-chrome-muted hover:text-chrome-text px-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setCustomFormAssemblyId(assembly.id)}
                        className="w-full text-left px-3 py-1.5 text-xs text-chrome-muted hover:bg-chrome-surface hover:text-chrome-text"
                      >
                        {t('board.customBoard')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Docked column left of the canvas — the view tabs, canvas and HUD
          shift right while it is open. Toggle via the toolbar or `B`. The
          component stays mounted while hidden so the tree keeps its state. */}
      {show && (
        <aside
          aria-label={t('layout.drawer.title')}
          className="w-60 shrink-0 bg-chrome-bg text-chrome-text border-r border-chrome-border flex flex-col min-h-0"
        >
          <div className="flex items-center justify-between h-8 px-3 border-b border-chrome-border shrink-0">
            <h3 className="text-[11px] font-semibold text-chrome-muted uppercase tracking-wider">{t('layout.drawer.title')}</h3>
            <button
              onClick={handleAddAssembly}
              aria-label={t('ui.addAssembly')}
              title={t('ui.addAssembly')}
              className="w-6 h-6 flex items-center justify-center rounded text-chrome-secondary hover:bg-chrome-surface hover:text-chrome-text"
            >
              <Icon name="plus" />
            </button>
          </div>

          {/* Assemblies & boards */}
          <div className="px-2 py-2 flex-1 overflow-y-auto">
            {project.assemblies.filter((a) => !a.parentId).map((a) => renderNode(a, 0))}

            {project.assemblies.length === 0 && (
              <button
                onClick={handleAddAssembly}
                className="w-full text-left text-xs text-chrome-muted hover:text-chrome-text px-1.5 py-1"
              >
                + {t('sidebar.addAssembly')}
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Assembly context menu */}
      {assemblyMenu && (
        <div
          ref={assemblyMenuRef}
          className="fixed bg-chrome-bg text-chrome-text rounded-md shadow-2xl border border-chrome-border py-1 z-[100] min-w-[160px]"
          style={{ left: assemblyMenu.x, top: assemblyMenu.y }}
        >
          <button
            onClick={() => handleStartRename(assemblyMenu.id)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-chrome-surface"
          >
            {t('sidebar.renameAssembly')}
          </button>
          <button
            onClick={() => {
              toggleAssemblyVisibility(assemblyMenu.id)
              setAssemblyMenu(null)
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-chrome-surface"
          >
            {t('sidebar.toggleVisibility')}
          </button>
          <button
            onClick={() => handleAddSubAssembly(assemblyMenu.id)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-chrome-surface"
          >
            {t('sidebar.addSubAssembly')}
          </button>
          {project.assemblies.find((a) => a.id === assemblyMenu.id)?.parentId && (
            <button
              onClick={() => {
                moveAssembly(assemblyMenu.id, null, 'inside')
                setAssemblyMenu(null)
              }}
              className="w-full text-left px-4 py-1.5 text-sm hover:bg-chrome-surface"
            >
              {t('sidebar.moveToTopLevel')}
            </button>
          )}
          <button
            onClick={() => handleSelectAllInAssembly(assemblyMenu.id)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-chrome-surface"
          >
            {t('sidebar.selectAllBoards')}
          </button>
          {(() => {
            const assembly = project.assemblies.find((a) => a.id === assemblyMenu.id)
            const assemblyBoardIds = new Set(assembly?.boards.map((b) => b.id) ?? [])
            const selectedInAssembly = selectedBoardIds.filter((id) => assemblyBoardIds.has(id))
            if (selectedInAssembly.length !== 2) return null
            return (
              <>
                <div className="border-t border-chrome-border my-0.5" />
                <button
                  onClick={() => {
                    setJointDialog({
                      assemblyId: assemblyMenu.id,
                      boardAId: selectedInAssembly[0],
                      boardBId: selectedInAssembly[1]
                    })
                    setAssemblyMenu(null)
                  }}
                  className="w-full text-left px-4 py-1.5 text-sm hover:bg-chrome-surface"
                >
                  {t('sidebar.addJoint')}
                </button>
              </>
            )
          })()}
          <div className="border-t border-chrome-border my-0.5" />
          <button
            onClick={() => handleDeleteAssembly(assemblyMenu.id)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-danger-dim text-danger"
          >
            {t('sidebar.deleteAssembly')}
          </button>
        </div>
      )}

      {/* Joint creation dialog */}
      {jointDialog && (() => {
        const assembly = project.assemblies.find((a) => a.id === jointDialog.assemblyId)
        const boardA = assembly?.boards.find((b) => b.id === jointDialog.boardAId)
        const boardB = assembly?.boards.find((b) => b.id === jointDialog.boardBId)
        const jointTypes: { value: JointType; label: string }[] = [
          { value: 'dado',     label: t('joints.dado') },
          { value: 'rabbet',   label: t('joints.rabbet') },
          { value: 'butt',     label: t('joints.butt') },
          { value: 'miter',    label: t('joints.miter') },
          { value: 'dovetail', label: t('joints.dovetail') }
        ]
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
            <div
              ref={jointDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="drawer-joint-title"
              tabIndex={-1}
              className="bg-chrome-bg text-chrome-text border border-chrome-border rounded-lg shadow-2xl w-72 overflow-hidden outline-none"
            >
              <div className="p-4 border-b border-chrome-border flex items-center justify-between">
                <h2 id="drawer-joint-title" className="text-sm font-bold text-chrome-text">{t('sidebar.createJoint')}</h2>
                <button onClick={() => setJointDialog(null)} aria-label={t('ui.close')} title={t('ui.close')} className="text-chrome-muted hover:text-chrome-text"><Icon name="close" /></button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="text-xs text-chrome-muted">
                  <div><span className="font-medium text-chrome-secondary">A:</span> {boardA?.name ?? jointDialog.boardAId}</div>
                  <div><span className="font-medium text-chrome-secondary">B:</span> {boardB?.name ?? jointDialog.boardBId}</div>
                </div>
                <div>
                  <label className="text-xs text-chrome-muted block mb-1">{t('sidebar.jointType')}</label>
                  <div className="flex flex-col gap-1">
                    {jointTypes.map((jt) => (
                      <label key={jt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="jointType"
                          value={jt.value}
                          checked={jointType === jt.value}
                          onChange={() => setJointType(jt.value)}
                          className="accent-action"
                        />
                        <span className="text-xs text-chrome-secondary">{jt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-3 border-t border-chrome-border flex justify-end gap-2">
                <button
                  onClick={() => setJointDialog(null)}
                  className="text-sm px-3 py-1.5 rounded bg-chrome-surface text-chrome-text hover:bg-chrome-hover"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  onClick={handleCreateJoint}
                  className="text-sm px-3 py-1.5 rounded bg-action text-action-text hover:bg-action-hover"
                >
                  {t('sidebar.createJoint')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
