import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { materials, getMaterialById } from '../../data/materials'
import { DimInput, Vec3Input } from '../layout/DimensionInputs'
import type { Board, MaterialCategory, Vec3 } from '../../types/furniture'

/** Dark <option>/<optgroup> styling so native dropdowns are readable on the
 *  glass card (Chromium renders option lists with the OS-default white bg,
 *  which made white-on-white text unreadable). */
const OPTION_DARK = 'bg-gray-800 text-white'
const OPTGROUP_DARK = 'bg-gray-800 text-white/50'

/**
 * Floating glass card anchored to bottom-right of the canvas.
 * Appears only when one or more boards are selected; hosts the most
 * common editing actions (name, dimensions, material, duplicate, delete).
 */
export function FloatingPropertiesCard() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const project              = useProjectStore((s) => s.project)
  const updateBoard          = useProjectStore((s) => s.updateBoard)
  const duplicateBoard       = useProjectStore((s) => s.duplicateBoard)
  const duplicateBoards      = useProjectStore((s) => s.duplicateBoards)
  const removeBoard          = useProjectStore((s) => s.removeBoard)
  const removeBoards         = useProjectStore((s) => s.removeBoards)
  const moveBoardsToAssembly = useProjectStore((s) => s.moveBoardsToAssembly)

  const selectedBoardIds    = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId  = useUIStore((s) => s.selectedAssemblyId)
  const deselectAll         = useUIStore((s) => s.deselectAll)
  const selectBoard         = useUIStore((s) => s.selectBoard)
  const setShowJointDialog  = useUIStore((s) => s.setShowJointDialog)

  if (selectedBoardIds.length === 0 || !selectedAssemblyId) return null

  const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
  if (!assembly) return null

  const parameters = project.parameters ?? {}
  const unit = project.displayUnit
  const assemblies = project.assemblies

  // Move all selected boards to another building group, keeping them selected.
  const handleChangeAssembly = (toAssemblyId: string) => {
    if (toAssemblyId === assembly.id) return
    const movedIds = [...selectedBoardIds]
    moveBoardsToAssembly(assembly.id, movedIds, toAssemblyId)
    useUIStore.setState({ selectedAssemblyId: toAssemblyId, selectedBoardIds: movedIds })
  }

  /** Building-group dropdown shared by single- and multi-board views. */
  const assemblyPicker = assemblies.length > 1 ? (
    <div className="px-3 py-1">
      <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
        {lang === 'de' ? 'Baugruppe' : 'Building group'}
      </div>
      <select
        value={assembly.id}
        onChange={(e) => handleChangeAssembly(e.target.value)}
        className="w-full text-[10px] bg-white/8 border border-white/15 text-white rounded px-1.5 py-1 outline-none"
        title={lang === 'de' ? 'In andere Baugruppe verschieben' : 'Move to another building group'}
      >
        {assemblies.map((a) => (
          <option key={a.id} value={a.id} className={OPTION_DARK}>{a.name}</option>
        ))}
      </select>
    </div>
  ) : null

  const selectedBoards = assembly.boards.filter((b) => selectedBoardIds.includes(b.id))

  // ── Multi-board view ──────────────────────────────────────────────────────
  if (selectedBoards.length !== 1) {
    const count = selectedBoards.length
    const handleDupAll = () => { duplicateBoards(assembly.id, selectedBoardIds); deselectAll() }
    const handleDelAll = () => { removeBoards(assembly.id, selectedBoardIds); deselectAll() }

    return (
      <div
        className="absolute bottom-4 right-4 z-30 w-52 rounded-xl border border-white/10 shadow-2xl bg-gray-900/92 backdrop-blur-md text-white flex flex-col overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
          <span className="text-[11px] text-white/70 flex-1">
            {count}&thinsp;{lang === 'de' ? 'Teile gewählt' : 'parts selected'}
          </span>
          <button
            onClick={deselectAll}
            className="text-white/40 hover:text-white/80 text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
            title="Deselect (Esc)"
          >×</button>
        </div>

        {/* Building group */}
        {assemblyPicker}

        {/* Actions */}
        <div className="flex gap-1 p-2">
          {count === 2 && (
            <button
              onClick={() => setShowJointDialog(true)}
              className="flex-1 text-[10px] font-medium py-1.5 rounded bg-info/20 text-info hover:bg-info/30 transition-colors"
              title={lang === 'de' ? 'Verbinden (J)' : 'Join boards (J)'}
            >
              ↔ {lang === 'de' ? 'Verbinden' : 'Join'}
            </button>
          )}
          <button
            onClick={handleDupAll}
            className="flex-1 text-[10px] font-medium py-1.5 rounded bg-white/8 text-white/70 hover:bg-white/15 transition-colors"
            title={lang === 'de' ? 'Alle duplizieren' : 'Duplicate all'}
          >⧉</button>
          <button
            onClick={handleDelAll}
            className="flex-1 text-[10px] font-medium py-1.5 rounded bg-white/8 text-red-400 hover:bg-red-500/20 transition-colors"
            title={lang === 'de' ? 'Alle löschen' : 'Delete all'}
          >✕</button>
        </div>
      </div>
    )
  }

  // ── Single board view ─────────────────────────────────────────────────────
  const board = selectedBoards[0]
  const mat = getMaterialById(board.materialId, project.customMaterials)
  const customMaterials = project.customMaterials ?? []
  const categories: MaterialCategory[] = ['solid_wood', 'panel', 'stone', 'glass', 'metal']

  // Dimension edits via the numeric inputs anchor at the board's centre:
  // a face-handle drag picks a specific side, but a typed value has no
  // "chosen side" — so we keep the centre fixed and grow/shrink symmetrically.
  // (Face-handle drags update board.position themselves, so their pre-shifted
  //  position passes through this unchanged.)
  const handleUpdate = (updates: Partial<Board>) => {
    const dimToAxis: Record<'width' | 'height' | 'depth', 'x' | 'y' | 'z'> = {
      width: 'x', height: 'y', depth: 'z'
    }
    const hasExplicitPosition = updates.position !== undefined
    if (!hasExplicitPosition) {
      const newPos = { ...board.position }
      let shifted = false
      for (const dim of ['width', 'height', 'depth'] as const) {
        const next = updates[dim]
        if (typeof next === 'number' && next !== board[dim]) {
          newPos[dimToAxis[dim]] -= (next - board[dim]) / 2
          shifted = true
        }
      }
      if (shifted) {
        updates = { ...updates, position: newPos }
      }
    }
    updateBoard(assembly.id, board.id, updates)
  }

  const handleDuplicate = () => {
    const newId = duplicateBoard(assembly.id, board.id)
    if (newId) selectBoard(assembly.id, newId)
  }

  const handleDelete = () => {
    removeBoard(assembly.id, board.id)
    deselectAll()
  }

  const handleRotate90 = () => {
    const rot: Vec3 = { ...board.rotation, y: ((board.rotation.y ?? 0) + 90) % 360 }
    handleUpdate({ rotation: rot })
  }

  return (
    <div
      className="absolute bottom-4 right-4 z-30 w-60 max-h-[72vh] overflow-y-auto rounded-xl border border-white/10 shadow-2xl bg-gray-900/92 backdrop-blur-md text-white flex flex-col"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header: color swatch + name + close */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 shrink-0">
        <span
          className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
          style={{ background: board.color }}
        />
        <input
          type="text"
          value={board.name}
          onChange={(e) => handleUpdate({ name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="flex-1 bg-transparent text-[11px] font-medium text-white outline-none min-w-0 truncate"
          title={lang === 'de' ? 'Name bearbeiten' : 'Edit name'}
        />
        <button
          onClick={deselectAll}
          className="text-white/40 hover:text-white/80 text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 shrink-0"
          title="Deselect (Esc)"
        >×</button>
      </div>

      {/* Geometry */}
      <div className="px-3 pt-2 pb-1">
        <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
          {lang === 'de' ? 'Geometrie' : 'Geometry'}
        </div>
        {/* Wrap DimInput in a dark-styled div; DimInput uses its own gray/white classes */}
        <div className="[&_input]:bg-white/8 [&_input]:border-white/15 [&_input]:text-white [&_label]:text-white/50 [&_span]:text-white/40">
          <DimInput
            label={lang === 'de' ? 'Breite' : 'Width'}
            value={board.width}
            field="width"
            unit={unit}
            parameters={parameters}
            lang={lang}
            onUpdate={handleUpdate}
          />
          <DimInput
            label={lang === 'de' ? 'Höhe' : 'Height'}
            value={board.height}
            field="height"
            unit={unit}
            parameters={parameters}
            lang={lang}
            onUpdate={handleUpdate}
          />
          <DimInput
            label={lang === 'de' ? 'Tiefe' : 'Depth'}
            value={board.depth}
            field="depth"
            unit={unit}
            parameters={parameters}
            lang={lang}
            onUpdate={handleUpdate}
          />
        </div>
      </div>

      {/* Transform: Position + Rotation */}
      <div className="px-3 py-1">
        <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
          {lang === 'de' ? 'Position (mm)' : 'Position (mm)'}
        </div>
        <div className="[&_input]:bg-white/8 [&_input]:border-white/15 [&_input]:text-white [&_span]:text-white/40">
          <Vec3Input
            value={board.position}
            onChange={(pos) => handleUpdate({ position: pos })}
          />
        </div>
        <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5 mt-2">
          {lang === 'de' ? 'Rotation (°)' : 'Rotation (°)'}
        </div>
        <div className="[&_input]:bg-white/8 [&_input]:border-white/15 [&_input]:text-white [&_span]:text-white/40">
          <Vec3Input
            value={board.rotation}
            onChange={(rot) => handleUpdate({ rotation: rot })}
            allowDecimals
          />
        </div>
      </div>

      {/* Material */}
      <div className="px-3 py-1">
        <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
          {lang === 'de' ? 'Material' : 'Material'}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
            style={{ background: mat?.color ?? board.color ?? '#888' }}
          />
          <select
            value={board.materialId}
            onChange={(e) => {
              const m = getMaterialById(e.target.value, customMaterials)
              if (m) handleUpdate({ materialId: m.id, color: m.color })
            }}
            className="flex-1 text-[10px] bg-white/8 border border-white/15 text-white rounded px-1.5 py-1 outline-none"
          >
            {customMaterials.length > 0 && (
              <optgroup label={lang === 'de' ? 'Eigene' : 'Custom'} className={OPTGROUP_DARK}>
                {customMaterials.map((m) => (
                  <option key={m.id} value={m.id} className={OPTION_DARK}>{lang === 'de' ? m.name : m.nameEn}</option>
                ))}
              </optgroup>
            )}
            {categories.map((cat) => (
              <optgroup key={cat} label={cat} className={OPTGROUP_DARK}>
                {materials.filter((m) => m.category === cat).map((m) => (
                  <option key={m.id} value={m.id} className={OPTION_DARK}>{lang === 'de' ? m.name : m.nameEn}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Building group */}
      {assemblyPicker}

      {/* Divider */}
      <div className="h-px bg-white/8 mx-3 my-1" />

      {/* Action buttons */}
      <div className="flex gap-1 px-2 pb-2 shrink-0">
        <button
          onClick={handleDuplicate}
          title={lang === 'de' ? 'Duplizieren (D)' : 'Duplicate (D)'}
          className="flex-1 text-[10px] font-medium py-1.5 rounded bg-white/8 text-white/70 hover:bg-white/15 transition-colors"
        >
          ⧉ {lang === 'de' ? 'Kopie' : 'Dupe'}
        </button>
        <button
          onClick={handleRotate90}
          title={lang === 'de' ? '90° drehen' : 'Rotate 90°'}
          className="flex-1 text-[10px] font-medium py-1.5 rounded bg-white/8 text-white/70 hover:bg-white/15 transition-colors"
        >
          ↻ 90°
        </button>
        <button
          onClick={handleDelete}
          title={lang === 'de' ? 'Löschen (Del)' : 'Delete (Del)'}
          className="flex-1 text-[10px] font-medium py-1.5 rounded bg-white/8 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          ✕ {lang === 'de' ? 'Löschen' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
