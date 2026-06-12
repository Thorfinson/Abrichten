import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { boardPresets, presetToBoard } from '../../data/board-presets'
import { getMaterialById } from '../../data/materials'
import type { ToolMode } from '../../types/measurement'
import type { Assembly, JointType } from '../../types/furniture'

function assemblyStats(assembly: Assembly) {
  if (assembly.boards.length === 0) return null

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  let totalWeightKg = 0

  for (const b of assembly.boards) {
    minX = Math.min(minX, b.position.x)
    maxX = Math.max(maxX, b.position.x + b.width)
    minY = Math.min(minY, b.position.y)
    maxY = Math.max(maxY, b.position.y + b.height)
    minZ = Math.min(minZ, b.position.z)
    maxZ = Math.max(maxZ, b.position.z + b.depth)

    const mat = getMaterialById(b.materialId)
    if (mat) {
      // volume mm³ → m³ (* 1e-9), density kg/m³
      totalWeightKg += (b.width * b.height * b.depth * 1e-9) * mat.density
    }
  }

  return {
    w: Math.round(maxX - minX),
    h: Math.round(maxY - minY),
    d: Math.round(maxZ - minZ),
    kg: Math.round(totalWeightKg * 10) / 10
  }
}

const tools: { key: ToolMode; labelKey: string }[] = [
  { key: 'select', labelKey: 'tools.select' },
  { key: 'measure', labelKey: 'tools.measure' },
  { key: 'angle', labelKey: 'tools.angle' },
  { key: 'area', labelKey: 'tools.area' }
]

const presetGroups = [
  { labelKey: 'materials.solid_wood', ids: ['brett', 'dachlatte', 'kantholz', 'leiste', 'bohle'] },
  { labelKey: 'materials.panel', ids: ['regal-seite', 'regal-boden', 'rueckwand', 'multiplex-platte'] },
  { labelKey: 'materials.stone', ids: ['arbeitsplatte-granit', 'arbeitsplatte-keramik', 'fensterbank'] }
]

export function Sidebar() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const project = useProjectStore((s) => s.project)
  const addAssembly = useProjectStore((s) => s.addAssembly)
  const addBoard = useProjectStore((s) => s.addBoard)
  const removeAssembly = useProjectStore((s) => s.removeAssembly)
  const renameAssembly = useProjectStore((s) => s.renameAssembly)
  const reorderAssemblies = useProjectStore((s) => s.reorderAssemblies)
  const toggleAssemblyVisibility = useProjectStore((s) => s.toggleAssemblyVisibility)
  const addJoint = useProjectStore((s) => s.addJoint)
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
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
  // Map board id → DOM element for auto-scroll-into-view
  const boardItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Auto-scroll tree to selected board whenever canvas selection changes
  useEffect(() => {
    if (selectedBoardIds.length !== 1) return
    const el = boardItemRefs.current.get(selectedBoardIds[0])
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedBoardIds])

  // Drag-to-reorder state
  const dragSrcIdx = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Assembly collapse/expand state
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  // Joint creation dialog state
  const [jointDialog, setJointDialog] = useState<{
    assemblyId: string; boardAId: string; boardBId: string
  } | null>(null)
  const [jointType, setJointType] = useState<JointType>('dado')

  // Close preset menu on click outside
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

  // Close assembly context menu on click outside or Escape
  useEffect(() => {
    if (!assemblyMenu) return
    const handleClick = (e: MouseEvent) => {
      if (assemblyMenuRef.current && !assemblyMenuRef.current.contains(e.target as Node)) {
        setAssemblyMenu(null)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAssemblyMenu(null)
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

  const handleDeleteAssembly = (id: string) => {
    if (selectedAssemblyId === id) {
      deselectAll()
    }
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
      width: w,
      height: h,
      depth: d,
      materialId: 'buche',
      color: '#D4A574',
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

  // Drag-to-reorder handlers
  const handleDragStart = (idx: number) => { dragSrcIdx.current = idx }
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }
  const handleDrop = (idx: number) => {
    if (dragSrcIdx.current !== null && dragSrcIdx.current !== idx) {
      reorderAssemblies(dragSrcIdx.current, idx)
    }
    dragSrcIdx.current = null
    setDragOverIdx(null)
  }
  const handleDragEnd = () => {
    dragSrcIdx.current = null
    setDragOverIdx(null)
  }

  // Joint creation
  const handleCreateJoint = () => {
    if (!jointDialog) return
    const assembly = project.assemblies.find((a) => a.id === jointDialog.assemblyId)
    const boardA = assembly?.boards.find((b) => b.id === jointDialog.boardAId)
    const boardB = assembly?.boards.find((b) => b.id === jointDialog.boardBId)
    if (!boardA || !boardB) return
    // Position = contact face between the two boards (clamp each center to the other's AABB)
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    const aCx = boardA.position.x + boardA.width / 2
    const aCy = boardA.position.y + boardA.height / 2
    const aCz = boardA.position.z + boardA.depth / 2
    const bCx = boardB.position.x + boardB.width / 2
    const bCy = boardB.position.y + boardB.height / 2
    const bCz = boardB.position.z + boardB.depth / 2
    const pAx = clamp(bCx, boardA.position.x, boardA.position.x + boardA.width)
    const pAy = clamp(bCy, boardA.position.y, boardA.position.y + boardA.height)
    const pAz = clamp(bCz, boardA.position.z, boardA.position.z + boardA.depth)
    const pBx = clamp(aCx, boardB.position.x, boardB.position.x + boardB.width)
    const pBy = clamp(aCy, boardB.position.y, boardB.position.y + boardB.height)
    const pBz = clamp(aCz, boardB.position.z, boardB.position.z + boardB.depth)
    const pos = { x: (pAx + pBx) / 2, y: (pAy + pBy) / 2, z: (pAz + pBz) / 2 }
    addJoint(jointDialog.assemblyId, {
      type: jointType,
      boardA: jointDialog.boardAId,
      boardB: jointDialog.boardBId,
      position: pos,
      fasteners: []
    })
    setJointDialog(null)
  }

  return (
    <div className="w-56 bg-gray-50 border-r border-gray-300 flex flex-col shrink-0 overflow-y-auto">
      {/* Tools */}
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">{t('sidebar.tools')}</h3>
        <div className="grid grid-cols-2 gap-1">
          {tools.map((tool, idx) => (
            <button
              key={tool.key}
              onClick={() => setActiveTool(tool.key)}
              title={`${t(tool.labelKey)} (${idx + 1})`}
              className={`px-2 py-1.5 text-xs rounded ${
                activeTool === tool.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(tool.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Assemblies & Boards */}
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase">{t('sidebar.addAssembly')}</h3>
          <button
            onClick={handleAddAssembly}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
          >
            +
          </button>
        </div>

        {project.assemblies.map((assembly, idx) => (
          <div
            key={assembly.id}
            className={`mb-3 rounded transition-colors ${dragOverIdx === idx ? 'ring-2 ring-blue-400' : ''}`}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={handleDragEnd}
          >
            <div
              className={`text-sm font-medium px-2 py-1 rounded cursor-pointer flex items-center gap-1 ${
                selectedAssemblyId === assembly.id && selectedBoardIds.length === 0
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => selectBoard(assembly.id, null)}
              onContextMenu={(e) => handleAssemblyContextMenu(e, assembly.id)}
            >
              {/* Collapse/expand chevron */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setCollapsedIds((prev) => {
                    const next = new Set(prev)
                    next.has(assembly.id) ? next.delete(assembly.id) : next.add(assembly.id)
                    return next
                  })
                }}
                className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 text-[9px]"
                title={collapsedIds.has(assembly.id)
                  ? (lang === 'de' ? 'Aufklappen' : 'Expand')
                  : (lang === 'de' ? 'Einklappen' : 'Collapse')}
              >
                {collapsedIds.has(assembly.id) ? '▶' : '▼'}
              </button>
              {/* Drag handle */}
              <span
                className="shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing select-none mr-0.5"
                title={lang === 'de' ? 'Ziehen zum Sortieren' : 'Drag to reorder'}
              >⠿</span>
              {/* Visibility toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleAssemblyVisibility(assembly.id)
                }}
                className={`shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 ${
                  assembly.visible !== false ? 'text-gray-500' : 'text-gray-300'
                }`}
                title={t('sidebar.toggleVisibility')}
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
              {renamingAssemblyId === assembly.id ? (
                <input
                  autoFocus
                  type="text"
                  defaultValue={assembly.name}
                  className="flex-1 text-xs bg-white border border-blue-400 rounded px-1 py-0"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => handleRenameCommit(assembly.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenamingAssemblyId(null)
                    e.stopPropagation()
                  }}
                />
              ) : (
                <span className={`flex-1 truncate ${assembly.visible === false ? 'opacity-50' : ''}`}>
                  {assembly.name}
                </span>
              )}
            </div>
            {!collapsedIds.has(assembly.id) && (
            <div className={`ml-3 mt-1 ${assembly.visible === false ? 'opacity-40' : ''}`}>
              {/* Assembly bounds + weight */}
              {(() => {
                const stats = assemblyStats(assembly)
                if (!stats) return null
                return (
                  <div className="text-[10px] text-gray-400 px-2 py-0.5 font-mono">
                    {stats.w}×{stats.h}×{stats.d}mm · {stats.kg}kg
                  </div>
                )
              })()}

              {assembly.boards.map((board) => (
                <div
                  key={board.id}
                  ref={(el) => {
                    if (el) boardItemRefs.current.set(board.id, el)
                    else boardItemRefs.current.delete(board.id)
                  }}
                  title={`${board.name} · ${board.width}×${board.height}×${board.depth}mm`}
                  className={`text-xs px-2 py-1 rounded cursor-pointer flex items-center gap-1.5 ${
                    selectedBoardIds.includes(board.id)
                      ? 'bg-blue-100 text-blue-800'
                      : 'text-gray-600 hover:bg-gray-100'
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
                      selectedBoardIds.includes(board.id) ? 'text-blue-500' : 'text-gray-400'
                    }`}>
                      {board.width}×{board.height}×{board.depth}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add board — preset picker */}
              <div className="relative mt-1" ref={presetMenuOpen === assembly.id ? menuRef : undefined}>
                <button
                  onClick={() => setPresetMenuOpen(presetMenuOpen === assembly.id ? null : assembly.id)}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
                >
                  + {t('sidebar.addBoard')}
                </button>

                {presetMenuOpen === assembly.id && (
                  <div className="absolute left-0 top-full z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-52 max-h-80 overflow-y-auto">
                    {presetGroups.map((group) => (
                      <div key={group.labelKey}>
                        <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                          {t(group.labelKey)}
                        </div>
                        {group.ids.map((pid) => {
                          const preset = boardPresets.find((p) => p.id === pid)
                          if (!preset) return null
                          return (
                            <button
                              key={preset.id}
                              onClick={() => handleAddPreset(assembly.id, preset.id)}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
                            >
                              <span
                                className="inline-block w-3 h-3 rounded-sm shrink-0 border border-gray-200"
                                style={{ backgroundColor: preset.color }}
                              />
                              <span className="flex-1 truncate">{t(preset.labelKey)}</span>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                {preset.width}x{preset.height}x{preset.depth}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                    {/* Custom board */}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      {customFormAssemblyId === assembly.id ? (
                        <div className="px-3 py-2">
                          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">{t('board.customBoard')}</div>
                          {[
                            { label: t('board.width'), state: customW, setter: setCustomW },
                            { label: t('board.height'), state: customH, setter: setCustomH },
                            { label: t('board.depth'), state: customD, setter: setCustomD }
                          ].map(({ label, state, setter }) => (
                            <div key={label} className="flex items-center gap-1 mb-1">
                              <label className="text-[10px] text-gray-500 w-10 shrink-0">{label}</label>
                              <input
                                type="number"
                                value={state}
                                onChange={(e) => setter(e.target.value)}
                                className="flex-1 text-xs border border-gray-300 rounded px-1 py-0.5"
                              />
                              <span className="text-[10px] text-gray-400">mm</span>
                            </div>
                          ))}
                          <div className="flex gap-1 mt-1">
                            <button
                              onClick={() => handleAddCustomBoard(assembly.id)}
                              className="flex-1 text-xs bg-blue-600 text-white rounded py-0.5 hover:bg-blue-700"
                            >
                              + {t('sidebar.addBoard')}
                            </button>
                            <button
                              onClick={() => setCustomFormAssemblyId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600 px-2"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCustomFormAssemblyId(assembly.id)}
                          className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        >
                          {t('board.customBoard')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            )} {/* end !collapsedIds.has(assembly.id) */}
          </div>
        ))}

        {project.assemblies.length === 0 && (
          <p className="text-xs text-gray-400 italic">
            {t('sidebar.addAssembly')}...
          </p>
        )}
      </div>

      {/* Assembly context menu */}
      {assemblyMenu && (
        <div
          ref={assemblyMenuRef}
          className="fixed bg-white rounded shadow-lg border border-gray-200 py-1 z-[100] min-w-[160px]"
          style={{ left: assemblyMenu.x, top: assemblyMenu.y }}
        >
          <button
            onClick={() => handleStartRename(assemblyMenu.id)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700"
          >
            {t('sidebar.renameAssembly')}
          </button>
          <button
            onClick={() => {
              toggleAssemblyVisibility(assemblyMenu.id)
              setAssemblyMenu(null)
            }}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700"
          >
            {t('sidebar.toggleVisibility')}
          </button>
          <button
            onClick={() => handleSelectAllInAssembly(assemblyMenu.id)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700"
          >
            {t('sidebar.selectAllBoards')}
          </button>
          {/* Add Joint — only when exactly 2 boards of this assembly are selected */}
          {(() => {
            const assembly = project.assemblies.find((a) => a.id === assemblyMenu.id)
            const assemblyBoardIds = new Set(assembly?.boards.map((b) => b.id) ?? [])
            const selectedInAssembly = selectedBoardIds.filter((id) => assemblyBoardIds.has(id))
            if (selectedInAssembly.length !== 2) return null
            return (
              <>
                <div className="border-t border-gray-100 my-0.5" />
                <button
                  onClick={() => {
                    setJointDialog({
                      assemblyId: assemblyMenu.id,
                      boardAId: selectedInAssembly[0],
                      boardBId: selectedInAssembly[1]
                    })
                    setAssemblyMenu(null)
                  }}
                  className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700"
                >
                  {t('sidebar.addJoint')}
                </button>
              </>
            )
          })()}
          <div className="border-t border-gray-100 my-0.5" />
          <button
            onClick={() => handleDeleteAssembly(assemblyMenu.id)}
            className="w-full text-left px-4 py-1.5 text-sm hover:bg-red-50 text-red-600"
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
            <div className="bg-white rounded-lg shadow-xl w-72 overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-800">
                  {t('sidebar.createJoint')}
                </h2>
                <button onClick={() => setJointDialog(null)} className="text-gray-400 hover:text-gray-700">×</button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="text-xs text-gray-500">
                  <div><span className="font-medium text-gray-700">A:</span> {boardA?.name ?? jointDialog.boardAId}</div>
                  <div><span className="font-medium text-gray-700">B:</span> {boardB?.name ?? jointDialog.boardBId}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {t('sidebar.jointType')}
                  </label>
                  <div className="flex flex-col gap-1">
                    {jointTypes.map((jt) => (
                      <label key={jt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="jointType"
                          value={jt.value}
                          checked={jointType === jt.value}
                          onChange={() => setJointType(jt.value)}
                          className="accent-blue-600"
                        />
                        <span className="text-xs text-gray-700">{jt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
                <button
                  onClick={() => setJointDialog(null)}
                  className="text-sm px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  onClick={handleCreateJoint}
                  className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  {t('sidebar.createJoint')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
