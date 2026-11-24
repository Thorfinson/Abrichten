import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { activeJoints } from '../../utils/activeParts'
import { assemblyPath } from '../../utils/assemblyTree'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { materials, getMaterialById } from '../../data/materials'
import { DimInput, Vec3Input } from '../layout/DimensionInputs'
import { openJointEditor } from '../panels/JointDialog'
import { BoardLoadField, BoardWeightField } from './BoardLoadField'
import { boardFace, edgeBandingLengthMm } from '../../utils/boardFace'
import { EDGE_KEYS, edgeSides, faceDrawing, type EdgeKey, type SheetSide } from '../../utils/faceDrawing'
import { worldAligned } from '../../utils/projection'
import { roleKey } from '../../utils/boardRole'
import { partLabel } from '../../utils/partLabel'
import { usePartLabels } from '../../hooks/usePartLabels'
import { PartName } from '../ui/PartName'
import { BOARD_ROLES, type Board, type BoardCutout, type BoardRole, type EdgeBanding, type Fastener, type MaterialCategory, type Vec3 } from '../../types/furniture'
import { useDesignLocked } from '../../hooks/useDesignLocked'
import { CommitInput } from '../ui/CommitInput'
import { CutoutEditor } from './CutoutEditor'
import { cleanName } from '../../utils/validateProject'

/** Dark <option>/<optgroup> styling so native dropdowns are readable on the
 *  glass card (Chromium renders option lists with the OS-default white bg,
 *  which made white-on-white text unreadable). */
const OPTION_DARK = 'bg-gray-800 text-white'
const OPTGROUP_DARK = 'bg-gray-800 text-white/50'

// ── Collapsible sections (open state remembered per viewer) ─────────────────

type SectionId = 'geometry' | 'transform' | 'material' | 'edges' | 'cutouts' | 'joints'

const SECTIONS_KEY = 'abrichten-card-sections'
const DEFAULT_OPEN: Record<SectionId, boolean> = {
  geometry: true, transform: false, material: true, edges: true, cutouts: false, joints: true
}

function loadOpenSections(): Record<SectionId, boolean> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}')
    if (!saved || typeof saved !== 'object') return DEFAULT_OPEN
    const valid = Object.entries(saved).filter(([k, v]) => k in DEFAULT_OPEN && typeof v === 'boolean')
    return { ...DEFAULT_OPEN, ...Object.fromEntries(valid) }
  } catch {
    return DEFAULT_OPEN
  }
}

function useOpenSections(): [Record<SectionId, boolean>, (id: SectionId) => void] {
  const [open, setOpen] = useState(loadOpenSections)
  const toggle = (id: SectionId): void => setOpen((prev) => {
    const next = { ...prev, [id]: !prev[id] }
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)) } catch { /* storage blocked: keep it for this session */ }
    return next
  })
  return [open, toggle]
}

interface SectionProps {
  id: SectionId
  title: string
  open: boolean
  onToggle: (id: SectionId) => void
  /** Shown in the header while collapsed, e.g. the dimensions */
  summary?: string
  /** Header button on the right, e.g. "+ new" (shown while collapsed too) */
  action?: React.ReactNode
  children: React.ReactNode
}

function Section({ id, title, open, onToggle, summary, action, children }: SectionProps) {
  return (
    <div className="px-3 py-1">
      <div className={`flex items-center gap-1 ${open ? 'mb-1.5' : ''}`}>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={open}
          aria-controls={`card-section-${id}`}
          className="group flex-1 min-w-0 flex items-center gap-1 text-left rounded outline-none focus-visible:ring-1 focus-visible:ring-action"
        >
          <svg aria-hidden viewBox="0 0 8 8" className={`w-2 h-2 shrink-0 text-white/35 group-hover:text-white/60 transition-transform ${open ? 'rotate-90' : ''}`}>
            <path d="M2.5 1 L5.5 4 L2.5 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[9px] font-bold text-white/30 group-hover:text-white/60 uppercase tracking-widest shrink-0">{title}</span>
          {!open && summary && <span className="ml-auto pl-1 text-[9px] text-white/45 truncate">{summary}</span>}
        </button>
        {action}
      </div>
      {open && <div id={`card-section-${id}`}>{children}</div>}
    </div>
  )
}

const SIDE_PLACE: Record<SheetSide, string> = {
  top: 'top-0 left-5 right-5 h-4',
  bottom: 'bottom-0 left-5 right-5 h-4',
  left: 'left-0 top-5 bottom-5 w-4 [writing-mode:vertical-rl] rotate-180',
  right: 'right-0 top-5 bottom-5 w-4 [writing-mode:vertical-rl]'
}

/**
 * Edge banding as a face diagram, laid out like the shop drawing (utils/faceDrawing): a
 * standing part upright, a lying one seen from above, the wall side at the top. Each bar
 * toggles its edge E1–E4.
 */
function EdgeBandingPicker({ board, onChange }: { board: Board; onChange: (eb: EdgeBanding) => void }) {
  const { t } = useTranslation()
  const face = boardFace(board)
  const drawing = faceDrawing(board)
  const sideOf = edgeSides(board)
  const eb = board.edgeBanding ?? {}
  const len = (k: EdgeKey): number => (k === 'e1' || k === 'e2' ? face.u : face.v)
  return (
    <div>
      <div className="relative h-24" data-testid="edge-picker">
        <div className="absolute inset-5 rounded-sm border border-white/10 bg-white/5 flex items-center justify-center text-[9px] text-white/40 font-mono">
          {drawing.width} × {drawing.height}
        </div>
        {EDGE_KEYS.map((k) => {
          const on = !!eb[k]
          const label = `${k.toUpperCase()} · ${len(k)}`
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              data-edge={k}
              data-side={sideOf[k]}
              title={t('func.edgeTitle', { edge: k.toUpperCase(), len: len(k) })}
              onClick={() => onChange({ ...eb, [k]: !on })}
              className={`absolute ${SIDE_PLACE[sideOf[k]]} flex items-center justify-center rounded-sm text-[9px] font-mono leading-none transition-colors outline-none focus-visible:ring-1 focus-visible:ring-action ${
                on ? 'bg-accent text-chrome-deep font-bold' : 'bg-white/8 text-white/45 hover:bg-white/15 hover:text-white/80'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="text-[9px] text-white/40 mt-0.5">
        {t('func.edgesTotal', { len: edgeBandingLengthMm(board) })}
      </div>
    </div>
  )
}

/** Grain direction: none, or along one of the two face axes (never the thickness). */
function GrainPicker({ board, hasGrain, onChange }: { board: Board; hasGrain: boolean; onChange: (g: Board['grainDirection']) => void }) {
  const { t } = useTranslation()
  const face = boardFace(board)
  const options = [
    { value: undefined, label: t('board.grainNone'), title: t('board.grainNone') },
    ...([[face.uAxis, face.u], [face.vAxis, face.v]] as const).map(([axis, len]) => ({
      value: axis,
      label: t('func.grainAlong', { len }),
      title: t('func.grainAlongTitle', { len, axis: t(`board.${axis}`) })
    }))
  ]
  return (
    <div>
      <div className="flex gap-1" role="group" aria-label={t('board.grainDirection')}>
        {options.map((o) => {
          const on = board.grainDirection === o.value
          return (
            <button
              key={o.value ?? 'none'}
              type="button"
              aria-pressed={on}
              title={o.title}
              onClick={() => onChange(o.value)}
              className={`flex-1 min-w-0 truncate text-[10px] py-1 rounded transition-colors outline-none focus-visible:ring-1 focus-visible:ring-action ${
                on ? 'bg-action text-action-text' : 'bg-white/8 text-white/60 hover:bg-white/15 hover:text-white'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {!hasGrain && (
        <div className="text-[9px] text-white/40 mt-0.5">{t('func.grainNoMaterialGrain')}</div>
      )}
    </div>
  )
}

const MIXED_ROLE = '__mixed'

/** Part role (Bauteilart) dropdown; `mixed` when the selected boards differ (shown, not selectable). */
function RolePicker({ value, mixed = false, onChange }: { value: BoardRole | undefined; mixed?: boolean; onChange: (r: BoardRole | undefined) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <select
        value={mixed ? MIXED_ROLE : value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v !== MIXED_ROLE) onChange(v === '' ? undefined : (v as BoardRole))
        }}
        className="w-full text-[10px] bg-white/8 border border-white/15 text-white rounded px-1.5 py-1 outline-none"
        aria-label={t('role.label')}
      >
        {mixed && <option value={MIXED_ROLE} disabled className={OPTION_DARK}>{t('role.mixed')}</option>}
        <option value="" className={OPTION_DARK}>{t('role.none')}</option>
        {BOARD_ROLES.map((r) => (
          <option key={r} value={r} className={OPTION_DARK}>{t(roleKey(r))}</option>
        ))}
      </select>
      {value && !mixed && <div className="text-[9px] text-white/40 mt-0.5">{t(`role.hint_${value}`)}</div>}
    </div>
  )
}

/**
 * Floating glass card anchored to bottom-right of the canvas.
 * Appears only when one or more boards are selected; hosts the most
 * common editing actions (name, dimensions, material, duplicate, delete).
 */
export function FloatingPropertiesCard() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'

  const project              = useProjectStore((s) => s.project)
  const updateBoard          = useProjectStore((s) => s.updateBoard)
  const duplicateBoard       = useProjectStore((s) => s.duplicateBoard)
  const duplicateBoards      = useProjectStore((s) => s.duplicateBoards)
  const removeBoard          = useProjectStore((s) => s.removeBoard)
  const removeBoards         = useProjectStore((s) => s.removeBoards)
  const moveBoardsToAssembly = useProjectStore((s) => s.moveBoardsToAssembly)
  const setBoardsRole        = useProjectStore((s) => s.setBoardsRole)
  const removeJoint          = useProjectStore((s) => s.removeJoint)

  const selectedBoardIds    = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId  = useUIStore((s) => s.selectedAssemblyId)
  const deselectAll         = useUIStore((s) => s.deselectAll)
  const selectBoard         = useUIStore((s) => s.selectBoard)
  const setShowJointDialog  = useUIStore((s) => s.setShowJointDialog)
  const showStaticOverlay   = useUIStore((s) => s.showStaticOverlay)
  const [openSections, toggleSection] = useOpenSections()
  const labels = usePartLabels()
  // the card edits the design: the assembly workspace does not show it (store/designLock.ts)
  const locked = useDesignLocked()

  if (locked || selectedBoardIds.length === 0 || !selectedAssemblyId) return null

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
          <option key={a.id} value={a.id} className={OPTION_DARK}>{assemblyPath(assemblies, a.id)}</option>
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
    const roles = new Set(selectedBoards.map((b) => b.role))

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
            title={t('ui.deselect')}
            aria-label={t('ui.deselect')}
          >×</button>
        </div>

        {/* Building group */}
        {assemblyPicker}

        {/* Part role for all selected boards */}
        {count > 0 && (
          <div className="px-3 py-1">
            <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">{t('role.label')}</div>
            <RolePicker
              value={roles.size === 1 ? selectedBoards[0].role : undefined}
              mixed={roles.size > 1}
              onChange={(role) => setBoardsRole(assembly.id, selectedBoards.map((b) => b.id), role)}
            />
          </div>
        )}

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

  // ── Cutouts: their own editor (CutoutEditor, utils/cutoutPlace) ──────────
  const cutouts = board.cutouts ?? []

  // Joints may span assemblies: collect from all visible ones, remember the owner for removal
  const boardJoints = activeJoints(project)
    .filter(({ joint }) => joint.boardA === board.id || joint.boardB === board.id)
    .map(({ joint, ownerId }) => ({ j: joint, ownerId }))
  const allBoards = assemblies.flatMap((a) => a.boards)
  const fastenerLabel = (f: Fastener) => `${f.quantity}× ${t(`joints.f_${f.type}`)} ${f.diameter}×${f.length}`
  const edgeCount = Object.values(board.edgeBanding ?? {}).filter(Boolean).length

  const sectionProps = (id: SectionId) => ({ id, open: openSections[id], onToggle: toggleSection })
  const fmt = (v: number) => String(Math.round(v * 10) / 10)

  return (
    <div
      className="absolute bottom-4 right-4 z-30 w-60 max-h-[calc(100%-2rem)] rounded-xl border border-white/10 shadow-2xl bg-gray-900/92 backdrop-blur-md text-white flex flex-col"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header: color swatch + name + close */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 shrink-0">
        <span
          className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
          style={{ background: board.color }}
        />
        <span className="shrink-0 font-mono text-[10px] text-white/60" data-testid="card-part-label" title={t('partLabel.nrTitle')}>
          {labels.get(board.id) ?? partLabel(assembly, board)}
        </span>
        <CommitInput
          key={board.id}
          type="text" /* part-name-ok: the field edits the name; the label stands just before it */
          value={board.name}
          // the name as the file check keeps it (one line, no spaces at the ends): saving and reopening change nothing
          onCommit={(name) => updateBoard(assembly.id, board.id, { name: cleanName(name, board.name) })} /* part-name-ok: the old name stays when the field is emptied */
          className="flex-1 bg-transparent text-[11px] font-medium text-white outline-none min-w-0 truncate"
          title={lang === 'de' ? 'Name bearbeiten' : 'Edit name'}
          aria-label={lang === 'de' ? 'Name' : 'Name'}
        />
        <button
          onClick={deselectAll}
          className="text-white/40 hover:text-white/80 text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 shrink-0"
          title={t('ui.deselect')}
          aria-label={t('ui.deselect')}
        >×</button>
      </div>

      {/* Scrolls inside the card, so it never covers more than the canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {/* Geometry */}
        <Section
          {...sectionProps('geometry')}
          title={lang === 'de' ? 'Geometrie' : 'Geometry'}
          summary={`${fmt(board.width)} × ${fmt(board.height)} × ${fmt(board.depth)}`}
        >
          {/* Wrap DimInput in a dark-styled div; DimInput uses its own gray/white classes */}
          <div className="[&_input]:bg-white/8 [&_input]:border-white/15 [&_input]:text-white [&_label]:text-white/50 [&_span]:text-white/40">
            <DimInput
              label={lang === 'de' ? 'Breite' : 'Width'}
              value={board.width}
              field="width"
              formula={board.widthFormula}
              unit={unit}
              parameters={parameters}
              lang={lang}
              onUpdate={handleUpdate}
            />
            <DimInput
              label={lang === 'de' ? 'Höhe' : 'Height'}
              value={board.height}
              field="height"
              formula={board.heightFormula}
              unit={unit}
              parameters={parameters}
              lang={lang}
              onUpdate={handleUpdate}
            />
            <DimInput
              label={lang === 'de' ? 'Tiefe' : 'Depth'}
              value={board.depth}
              field="depth"
              formula={board.depthFormula}
              unit={unit}
              parameters={parameters}
              lang={lang}
              onUpdate={handleUpdate}
            />
          </div>
        </Section>

        {/* Transform: Position + Rotation */}
        <Section
          {...sectionProps('transform')}
          title={t('func.transform')}
          summary={`${fmt(board.position.x)}, ${fmt(board.position.y)}, ${fmt(board.position.z)}`}
        >
          <div className="text-[9px] text-white/40 mb-1">{lang === 'de' ? 'Position (mm)' : 'Position (mm)'}</div>
          <div className="[&_input]:bg-white/8 [&_input]:border-white/15 [&_input]:text-white [&_span]:text-white/40">
            <Vec3Input
              name="position"
              value={board.position}
              onChange={(pos) => handleUpdate({ position: pos })}
            />
          </div>
          <div className="text-[9px] text-white/40 mb-1 mt-2">{lang === 'de' ? 'Rotation (°)' : 'Rotation (°)'}</div>
          <div className="[&_input]:bg-white/8 [&_input]:border-white/15 [&_input]:text-white [&_span]:text-white/40">
            <Vec3Input
              name="rotation"
              value={board.rotation}
              onChange={(rot) => handleUpdate({ rotation: rot })}
            />
          </div>
        </Section>

        {/* Material + grain + part role */}
        <Section
          {...sectionProps('material')}
          title={lang === 'de' ? 'Material' : 'Material'}
          summary={(mat ? (lang === 'de' ? mat.name : mat.nameEn) : board.materialId) + (board.role ? ` · ${t(roleKey(board.role))}` : '')}
        >
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
              className="flex-1 min-w-0 text-[10px] bg-white/8 border border-white/15 text-white rounded px-1.5 py-1 outline-none"
              aria-label={lang === 'de' ? 'Material' : 'Material'}
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
          <div className="text-[9px] text-white/40 mt-2 mb-1">{t('board.grainDirection')}</div>
          <GrainPicker
            board={board}
            hasGrain={mat?.grain ?? false}
            onChange={(grainDirection) => handleUpdate({ grainDirection })}
          />
          <div className="text-[9px] text-white/40 mt-2 mb-1">{t('role.label')}</div>
          <RolePicker value={board.role} onChange={(role) => setBoardsRole(assembly.id, [board.id], role)} />
          {/* Weight of the part for the load simulation (statics mode; an appliance from its datasheet) */}
          {showStaticOverlay && (
            <div className="mt-2">
              <BoardWeightField assemblyId={assembly.id} board={board} />
            </div>
          )}
          {/* Payload on this board for the load simulation (statics mode, lying boards only —
              the simulation puts payloads on horizontal members) */}
          {showStaticOverlay && boardFace(worldAligned(board)).thicknessAxis === 'height' && (
            <div className="mt-2">
              <BoardLoadField assemblyId={assembly.id} board={board} />
            </div>
          )}
        </Section>

        {/* Edge banding */}
        <Section
          {...sectionProps('edges')}
          title={t('board.edgeBanding')}
          summary={edgeCount > 0 ? t('func.edgesSummary', { count: edgeCount }) : t('board.grainNone')}
        >
          <EdgeBandingPicker board={board} onChange={(edgeBanding) => handleUpdate({ edgeBanding })} />
        </Section>

        {/* Cutouts */}
        <Section
          {...sectionProps('cutouts')}
          title={t('board.cutouts')}
          summary={cutouts.length > 0 ? String(cutouts.length) : undefined}
        >
          <CutoutEditor board={board} onChange={(next) => handleUpdate({ cutouts: next.length ? next : undefined })} />
        </Section>

        {/* Joints touching this board — click one to edit it, ✕ removes it */}
        {boardJoints.length > 0 && (
          <Section {...sectionProps('joints')} title={t('joints.list')} summary={String(boardJoints.length)}>
            {boardJoints.map(({ j, ownerId }) => {
              const partnerId = j.boardA === board.id ? j.boardB : j.boardA
              const partner = allBoards.find((b) => b.id === partnerId)
              const detail = [...j.fasteners.map(fastenerLabel), j.note].filter(Boolean).join(', ')
              return (
                <div key={j.id} className="flex items-start gap-1 mb-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => openJointEditor(ownerId, j.id)}
                    className="flex-1 min-w-0 text-left text-white/70 rounded px-1 -mx-1 hover:bg-white/10 hover:text-white outline-none focus-visible:ring-1 focus-visible:ring-action"
                    title={t('func.jointEdit')}
                  >
                    <span className="block truncate">{t(`joints.${j.type}`)} · {partner ? <PartName label={labels.get(partner.id)} name={partner.name} /> : '?'}</span>
                    {detail && <span className="block truncate text-white/40" title={detail}>{detail}</span>}
                  </button>
                  <button
                    onClick={() => removeJoint(ownerId, j.id)}
                    className="text-white/40 hover:text-red-400 text-[11px] leading-none shrink-0 pt-0.5"
                    title={t('joints.delete')}
                    aria-label={t('joints.delete')}
                  >✕</button>
                </div>
              )
            })}
          </Section>
        )}

        {/* Building group */}
        {assemblyPicker}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 px-2 py-2 border-t border-white/8 shrink-0">
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
