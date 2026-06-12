import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { materials, getMaterialById } from '../../data/materials'
import { hardwareItems } from '../../data/hardware'
import { formatValue, parseInput, fromMm, toMm } from '../../utils/units'
import { evalFormula, isFormula } from '../../utils/formulaEval'
import { calculateStatic } from '../../services/static-calc'
import { JointAdvisor } from '../panels/JointAdvisor'
import { useState, useEffect } from 'react'
import type { Board, Unit, MaterialCategory, GrainDirection, JointType } from '../../types/furniture'

export function PropertiesPanel() {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const updateBoard = useProjectStore((s) => s.updateBoard)
  const removeBoard = useProjectStore((s) => s.removeBoard)
  const updateBoards = useProjectStore((s) => s.updateBoards)
  const removeBoards = useProjectStore((s) => s.removeBoards)
  const removeJoint = useProjectStore((s) => s.removeJoint)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectedAssemblyId = useUIStore((s) => s.selectedAssemblyId)

  const assembly = project.assemblies.find((a) => a.id === selectedAssemblyId)
  const selectedBoards = assembly?.boards.filter((b) => selectedBoardIds.includes(b.id)) ?? []

  // These must be called unconditionally before any early return
  const addHardwareToBoard = useProjectStore((s) => s.addHardwareToBoard)
  const removeHardwareFromBoard = useProjectStore((s) => s.removeHardwareFromBoard)
  const setHardwareQuantity = useProjectStore((s) => s.setHardwareQuantity)

  // No selection
  if (selectedBoards.length === 0 || !assembly) {
    return (
      <div className="w-64 bg-gray-50 border-l border-gray-300 p-3 shrink-0">
        <p className="text-xs text-gray-400 italic">
          {t('tools.select')}...
        </p>
      </div>
    )
  }

  // Multi-selection
  if (selectedBoards.length > 1) {
    return (
      <div className="w-64 bg-gray-50 border-l border-gray-300 p-3 shrink-0 overflow-y-auto">
        <MultiBoardPanel
          boards={selectedBoards}
          assemblyId={assembly.id}
          count={selectedBoards.length}
          onUpdateAll={(updates) => updateBoards(assembly.id, selectedBoardIds, updates)}
          onDeleteAll={() => {
            removeBoards(assembly.id, selectedBoardIds)
            useUIStore.getState().deselectAll()
          }}
        />
      </div>
    )
  }

  // Single selection
  const board = selectedBoards[0]

  return (
    <div className="w-64 bg-gray-50 border-l border-gray-300 p-3 shrink-0 overflow-y-auto">
      <BoardProperties
        board={board}
        assemblyId={assembly.id}
        unit={project.displayUnit}
        onUpdate={(updates) => updateBoard(assembly.id, board.id, updates)}
        onDelete={() => {
          removeBoard(assembly.id, board.id)
          useUIStore.getState().deselectAll()
        }}
      />
      <StaticSection
        board={board}
        unit={project.displayUnit}
        allBoards={project.assemblies
          .filter((a) => a.visible !== false)
          .flatMap((a) => a.boards)}
      />
      <HardwareSection
        board={board}
        assemblyId={assembly.id}
        onAdd={(hId, qty) => addHardwareToBoard(assembly.id, board.id, hId, qty)}
        onRemove={(hId) => removeHardwareFromBoard(assembly.id, board.id, hId)}
        onSetQty={(hId, qty) => setHardwareQuantity(assembly.id, board.id, hId, qty)}
      />
      <JointsSection
        board={board}
        assembly={assembly}
        onRemove={(jId) => removeJoint(assembly.id, jId)}
      />
      <JointAdvisor />
    </div>
  )
}

function MultiBoardPanel({
  boards,
  assemblyId,
  count,
  onUpdateAll,
  onDeleteAll
}: {
  boards: Board[]
  assemblyId: string
  count: number
  onUpdateAll: (updates: Partial<Board>) => void
  onDeleteAll: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const customMaterialsRaw = useProjectStore((s) => s.project.customMaterials)
  const customMaterials = customMaterialsRaw ?? []

  // Check if all boards share the same material
  const allSameMaterial = boards.every((b) => b.materialId === boards[0].materialId)
  const allSameDepth = boards.every((b) => b.depth === boards[0].depth)

  const categories: MaterialCategory[] = ['solid_wood', 'panel', 'stone', 'glass', 'metal']

  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-blue-700 mb-3">
        {count} {t('selection.boardsSelected')}
      </h3>

      {/* Batch material */}
      <div className="mb-2">
        <label className="text-xs text-gray-500 block mb-1">{t('board.material')}</label>
        <select
          value={allSameMaterial ? boards[0].materialId : ''}
          onChange={(e) => {
            const mat = getMaterialById(e.target.value, customMaterials)
            if (mat) onUpdateAll({ materialId: mat.id, color: mat.color })
          }}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
        >
          {!allSameMaterial && (
            <option value="">{t('selection.mixed')}</option>
          )}
          {customMaterials.length > 0 && (
            <optgroup label={lang === 'de' ? 'Eigene Materialien' : 'Custom Materials'}>
              {customMaterials.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {lang === 'de' ? mat.name : mat.nameEn}
                </option>
              ))}
            </optgroup>
          )}
          {categories.map((cat) => (
            <optgroup key={cat} label={t(`materials.${cat}`)}>
              {materials.filter(m => m.category === cat).map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {lang === 'de' ? mat.name : mat.nameEn}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Batch depth */}
      <div className="mb-3">
        <label className="text-xs text-gray-500 block mb-1">{t('board.depth')}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder={allSameDepth ? String(boards[0].depth) : t('selection.mixed')}
            defaultValue={allSameDepth ? boards[0].depth : ''}
            onBlur={(e) => {
              const num = parseFloat(e.target.value)
              if (!isNaN(num) && num > 0) {
                onUpdateAll({ depth: num })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
          />
          <span className="text-xs text-gray-400">mm</span>
        </div>
      </div>

      {/* Delete all */}
      <button
        onClick={onDeleteAll}
        className="text-xs text-red-600 hover:text-red-800"
      >
        {t('actions.delete')} ({count})
      </button>
    </div>
  )
}

function Vec3AxisInput({
  axis, value, step, allowDecimals, onChange
}: {
  axis: 'x' | 'y' | 'z'
  value: number
  step: number
  allowDecimals: boolean
  onChange: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])

  return (
    <div className="flex-1 flex items-center gap-0.5">
      <span className="text-[10px] text-gray-400 uppercase font-bold">{axis}</span>
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const num = parseFloat(text)
          if (!isNaN(num)) {
            onChange(allowDecimals ? Math.round(num * 10) / 10 : Math.round(num))
          }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
      />
    </div>
  )
}

export function Vec3Input({
  value,
  onChange,
  step = 1,
  allowDecimals = false
}: {
  value: { x: number; y: number; z: number }
  onChange: (v: { x: number; y: number; z: number }) => void
  step?: number
  allowDecimals?: boolean
}) {
  return (
    <div className="flex gap-1">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <Vec3AxisInput
          key={axis}
          axis={axis}
          value={value[axis]}
          step={step}
          allowDecimals={allowDecimals}
          onChange={(v) => onChange({ ...value, [axis]: v })}
        />
      ))}
    </div>
  )
}

export function DimInput({
  label, value, field, unit, parameters, lang, onUpdate
}: {
  label: string
  value: number
  field: keyof Board
  unit: Unit
  parameters: Record<string, number>
  lang: 'de' | 'en'
  onUpdate: (updates: Partial<Board>) => void
}) {
  const [text, setText] = useState(String(fromMm(value, unit)))
  useEffect(() => { setText(String(fromMm(value, unit))) }, [value, unit])

  const formula = isFormula(text)

  const commit = () => {
    if (formula) {
      const result = evalFormula(text, parameters)
      if (result !== null && result > 0) {
        // Save both the resolved value and the raw formula string
        const formulaKey = `${field}Formula` as 'widthFormula' | 'heightFormula' | 'depthFormula'
        onUpdate({ [field]: Math.round(result * 10) / 10, [formulaKey]: text } as Partial<Board>)
      }
      return
    }
    const mm = parseInput(text, unit)
    if (mm !== null && mm > 0) {
      // Clear formula string when numeric value is entered
      const formulaKey = `${field}Formula` as 'widthFormula' | 'heightFormula' | 'depthFormula'
      onUpdate({ [field]: mm, [formulaKey]: undefined } as Partial<Board>)
    }
  }

  return (
    <div className="flex items-center gap-2 mb-1">
      <label
        className="text-xs text-gray-500 w-14"
        title={lang === 'de' ? 'Formel: z.B. =H+20' : 'Formula: e.g. =H+20'}
      >{label}</label>
      <div className="relative flex-1">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={`w-full text-xs border rounded px-2 py-1 bg-white font-mono ${
            formula ? 'border-amber-400 text-amber-700 bg-amber-50 pr-5' : 'border-gray-300'
          }`}
          title={formula ? (lang === 'de' ? 'Formel – Parameter in mm' : 'Formula – parameters in mm') : undefined}
        />
        {formula && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-blue-600 select-none pointer-events-none">
            =
          </span>
        )}
      </div>
      <span className="text-xs text-gray-400">{formula ? 'mm' : unit}</span>
    </div>
  )
}

const JOINT_TYPE_LABELS: Record<JointType, Record<'de' | 'en', string>> = {
  butt:         { de: 'Stumpf',         en: 'Butt' },
  miter:        { de: 'Gehrung',        en: 'Miter' },
  dado:         { de: 'Nut',            en: 'Dado' },
  rabbet:       { de: 'Falz',           en: 'Rabbet' },
  dowel:        { de: 'Dübel',          en: 'Dowel' },
  biscuit:      { de: 'Lamello',        en: 'Biscuit' },
  screw:        { de: 'Verschraubt',    en: 'Screw' },
  pocket_screw: { de: 'Taschenschraube', en: 'Pocket Screw' },
}
const JOINT_TYPES: JointType[] = ['butt', 'miter', 'dado', 'rabbet', 'dowel', 'biscuit', 'screw', 'pocket_screw']

function JointsSection({
  board, assembly, onRemove
}: {
  board: Board
  assembly: { id: string; boards: Board[]; joints: { id: string; boardA: string; boardB: string; type: string }[] }
  onRemove: (jointId: string) => void
}) {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const updateJoint = useProjectStore((s) => s.updateJoint)
  const setShowJointDialog = useUIStore((s) => s.setShowJointDialog)
  const selectBoard = useUIStore((s) => s.selectBoard)

  const joints = assembly.joints.filter((j) => j.boardA === board.id || j.boardB === board.id)
  const canAddJoint = assembly.boards.length >= 2

  const handleAddJoint = () => {
    // Ensure this board is selected as the primary for the dialog
    selectBoard(assembly.id, board.id)
    setShowJointDialog(true)
  }

  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
          {lang === 'de' ? 'Verbindungen' : 'Joints'}
        </h3>
        {canAddJoint && (
          <button
            onClick={handleAddJoint}
            className="text-[10px] text-action hover:text-action-hover font-medium flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-chrome-surface transition-colors"
            title={lang === 'de' ? 'Verbindung hinzufügen (J)' : 'Add joint (J)'}
          >
            + {lang === 'de' ? 'Verbindung' : 'Joint'}
          </button>
        )}
      </div>
      {joints.length === 0 ? (
        <p className="text-[10px] text-gray-400 italic">
          {lang === 'de' ? 'Keine Verbindungen' : 'No joints'}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {joints.map((j) => {
            const partnerId = j.boardA === board.id ? j.boardB : j.boardA
            const partnerName = assembly.boards.find((b) => b.id === partnerId)?.name ?? '?'
            return (
              <div key={j.id} className="flex items-center gap-1 text-xs">
                <select
                  value={j.type}
                  onChange={(e) => updateJoint(assembly.id, j.id, { type: e.target.value as JointType })}
                  className="flex-1 text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-700 outline-none hover:border-gray-400"
                >
                  {JOINT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {JOINT_TYPE_LABELS[type][lang]}
                    </option>
                  ))}
                </select>
                <span className="text-gray-400 text-[10px] shrink-0">↔</span>
                <span className="text-gray-600 truncate text-[10px] flex-1 max-w-[60px]" title={partnerName}>
                  {partnerName}
                </span>
                <button
                  onClick={() => onRemove(j.id)}
                  className="text-red-400 hover:text-red-600 px-1 shrink-0 text-sm leading-none"
                  title={lang === 'de' ? 'Verbindung löschen' : 'Delete joint'}
                >×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EdgeBandingSvg({
  eb, onToggle
}: {
  eb: Record<string, boolean>
  onToggle: (edge: 'e1' | 'e2' | 'e3' | 'e4') => void
}) {
  const edgeColor = (e: string) => eb[e] ? '#2563eb' : '#e5e7eb'
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0 cursor-pointer select-none">
      <rect x="9" y="9" width="34" height="34" fill="#f5f0e8" stroke="#999" strokeWidth="1"/>
      <line x1="9" y1="9" x2="43" y2="9" stroke={edgeColor('e1')} strokeWidth="3.5"
        style={{cursor:'pointer'}} onClick={() => onToggle('e1')}/>
      <line x1="9" y1="43" x2="43" y2="43" stroke={edgeColor('e2')} strokeWidth="3.5"
        style={{cursor:'pointer'}} onClick={() => onToggle('e2')}/>
      <line x1="9" y1="9" x2="9" y2="43" stroke={edgeColor('e3')} strokeWidth="3.5"
        style={{cursor:'pointer'}} onClick={() => onToggle('e3')}/>
      <line x1="43" y1="9" x2="43" y2="43" stroke={edgeColor('e4')} strokeWidth="3.5"
        style={{cursor:'pointer'}} onClick={() => onToggle('e4')}/>
      <text x="26" y="7.5" fontSize="5" textAnchor="middle" fill="#9ca3af">E1</text>
      <text x="26" y="50" fontSize="5" textAnchor="middle" fill="#9ca3af">E2</text>
      <text x="5" y="27" fontSize="5" textAnchor="middle" fill="#9ca3af">E3</text>
      <text x="49" y="27" fontSize="5" textAnchor="middle" fill="#9ca3af">E4</text>
    </svg>
  )
}

/** Visual divider with centered label between property sections */
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-4 mb-2">
      <div className="h-px flex-1 bg-gray-100" />
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  )
}

/** Grain direction mini-SVG icons: arrow along the relevant axis */
function GrainIcon({ dir }: { dir: 'width' | 'height' | 'depth' | undefined }) {
  const s = 20
  if (!dir) return <svg width={s} height={s} viewBox="0 0 20 20"><line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.4"/></svg>
  if (dir === 'width')  return <svg width={s} height={s} viewBox="0 0 20 20"><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.5"/><polygon points="17,7 17,13 20,10" fill="currentColor"/><polygon points="3,7 3,13 0,10" fill="currentColor"/></svg>
  if (dir === 'height') return <svg width={s} height={s} viewBox="0 0 20 20"><line x1="10" y1="3" x2="10" y2="17" stroke="currentColor" strokeWidth="1.5"/><polygon points="7,3 13,3 10,0" fill="currentColor"/><polygon points="7,17 13,17 10,20" fill="currentColor"/></svg>
  return <svg width={s} height={s} viewBox="0 0 20 20"><line x1="5" y1="5" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5"/><polygon points="14,11 18,12 15,15" fill="currentColor" transform="rotate(0)"/><polygon points="6,9 2,8 5,5" fill="currentColor"/></svg>
}

function BoardProperties({
  board,
  assemblyId,
  unit,
  onUpdate,
  onDelete
}: {
  board: Board
  assemblyId: string
  unit: Unit
  onUpdate: (updates: Partial<Board>) => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const customMaterialsRaw = useProjectStore((s) => s.project.customMaterials)
  const customMaterials = customMaterialsRaw ?? []
  const mat = getMaterialById(board.materialId, customMaterials)
  const parameters = useProjectStore((s) => s.project.parameters) ?? {}

  const categories: MaterialCategory[] = ['solid_wood', 'panel', 'stone', 'glass', 'metal']

  return (
    <div className="mb-4">

      {/* Board identity header: color swatch + name */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
        <div
          className="w-4 h-4 rounded shrink-0 border border-gray-200 shadow-sm"
          style={{ background: mat?.color ?? board.color }}
          title={lang === 'de' ? 'Materialfarbe' : 'Material color'}
        />
        <h3
          className="text-sm font-bold text-gray-800 truncate flex-1"
          title={board.name}
        >
          {board.name}
        </h3>
        <span className="text-[10px] text-gray-400 font-mono shrink-0">
          {board.width}×{board.height}×{board.depth}
        </span>
      </div>

      {/* ── GEOMETRY ── */}
      <SectionLabel label={lang === 'de' ? 'Geometrie' : 'Geometry'} />

      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-gray-500 w-14">{t('board.name')}</label>
        <input
          type="text"
          value={board.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
        />
      </div>

      <DimInput label={t('board.width')}  value={board.width}  field="width"  unit={unit} parameters={parameters} lang={lang} onUpdate={onUpdate} />
      <DimInput label={t('board.height')} value={board.height} field="height" unit={unit} parameters={parameters} lang={lang} onUpdate={onUpdate} />
      <DimInput label={t('board.depth')}  value={board.depth}  field="depth"  unit={unit} parameters={parameters} lang={lang} onUpdate={onUpdate} />

      {/* ── MATERIAL ── */}
      <SectionLabel label={lang === 'de' ? 'Material' : 'Material'} />

      <select
        value={board.materialId}
        onChange={(e) => {
          const m = getMaterialById(e.target.value, customMaterials)
          if (m) onUpdate({ materialId: m.id, color: m.color })
        }}
        className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white mb-2"
      >
        {customMaterials.length > 0 && (
          <optgroup label={lang === 'de' ? 'Eigene Materialien' : 'Custom Materials'}>
            {customMaterials.map((m) => (
              <option key={m.id} value={m.id}>{lang === 'de' ? m.name : m.nameEn}</option>
            ))}
          </optgroup>
        )}
        {categories.map((cat) => (
          <optgroup key={cat} label={t(`materials.${cat}`)}>
            {materials.filter(m => m.category === cat).map((m) => (
              <option key={m.id} value={m.id}>{lang === 'de' ? m.name : m.nameEn}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Grain direction — with mini SVG icons */}
      {mat?.grain && (
        <div className="mb-2">
          <label className="text-xs text-gray-500 block mb-1">{t('board.grainDirection')}</label>
          <div className="flex gap-1">
            {([undefined, 'width', 'height', 'depth'] as (GrainDirection | undefined)[]).map((dir) => (
              <button
                key={String(dir)}
                onClick={() => onUpdate({ grainDirection: dir })}
                title={dir ? t(`board.grain${dir.charAt(0).toUpperCase() + dir.slice(1)}`) : t('board.grainNone')}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded border text-[10px] flex-1 ${
                  board.grainDirection === dir
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <GrainIcon dir={dir} />
                <span>{dir ? dir.charAt(0).toUpperCase() : '–'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edge banding */}
      <div className="mb-1">
        <label className="text-xs text-gray-500 block mb-1">{t('board.edgeBanding')}</label>
        <div className="flex gap-2 items-start">
          <div className="grid grid-cols-1 gap-0.5 flex-1">
            {(['e1', 'e2', 'e3', 'e4'] as const).map((edge) => (
              <label key={edge} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={board.edgeBanding?.[edge] ?? false}
                  onChange={(ev) =>
                    onUpdate({ edgeBanding: { ...board.edgeBanding, [edge]: ev.target.checked } })
                  }
                  className="w-3 h-3"
                />
                <span className="text-xs text-gray-600">{t(`board.edge${edge.toUpperCase()}`)}</span>
              </label>
            ))}
          </div>
          <EdgeBandingSvg
            eb={board.edgeBanding ?? {}}
            onToggle={(edge) => onUpdate({ edgeBanding: { ...board.edgeBanding, [edge]: !(board.edgeBanding?.[edge] ?? false) } })}
          />
        </div>
      </div>

      {/* ── TRANSFORM ── */}
      <SectionLabel label={lang === 'de' ? 'Position & Drehung' : 'Position & Rotation'} />

      <div className="mb-1">
        <label className="text-xs text-gray-400 block mb-1">{t('board.position')} (mm)</label>
        <Vec3Input value={board.position} onChange={(pos) => onUpdate({ position: pos })} />
      </div>

      <div className="mt-2 mb-1">
        <label className="text-xs text-gray-400 block mb-1">{t('board.rotation')} (°)</label>
        <Vec3Input
          value={board.rotation}
          onChange={(rot) => onUpdate({ rotation: rot })}
          step={1}
          allowDecimals
        />
      </div>

      {/* ── DANGER ZONE ── */}
      <div className="mt-5 pt-3 border-t border-red-100">
        <button
          onClick={onDelete}
          className="w-full text-left text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 rounded px-2.5 py-1.5 transition-colors"
          title={lang === 'de' ? 'Bauteil unwiderruflich löschen' : 'Permanently delete this board'}
        >
          ✕ {t('actions.delete')} „{board.name.length > 22 ? board.name.slice(0, 22) + '…' : board.name}"
        </button>
      </div>
    </div>
  )
}

/**
 * Calculate the weight of a board in kg.
 */
function boardWeightKg(board: Board): number {
  const mat = getMaterialById(board.materialId)
  if (!mat) return 0
  return (board.width * board.height * board.depth) / 1e9 * mat.density
}

/**
 * Calculate total stone load sitting on top of a support board.
 */
function stoneLoadOnBoard(support: Board, allBoards: Board[]): number {
  const bTopY = support.position.y + support.height
  const bMinX = support.position.x
  const bMaxX = support.position.x + support.width
  const bMinZ = support.position.z
  const bMaxZ = support.position.z + support.depth

  let totalLoad = 0
  for (const s of allBoards) {
    if (s.id === support.id) continue
    const sMat = getMaterialById(s.materialId)
    if (!sMat || sMat.category !== 'stone') continue
    if (Math.abs(s.position.y - bTopY) > 5) continue
    const overlapX = Math.min(s.position.x + s.width, bMaxX) - Math.max(s.position.x, bMinX)
    const overlapZ = Math.min(s.position.z + s.depth, bMaxZ) - Math.max(s.position.z, bMinZ)
    if (overlapX <= 0 || overlapZ <= 0) continue
    const fraction = (overlapX * overlapZ) / (s.width * s.depth)
    totalLoad += boardWeightKg(s) * fraction
  }
  return totalLoad
}

/**
 * Check if a stone board has support boards underneath.
 */
function stoneHasSupport(stone: Board, allBoards: Board[]): boolean {
  const sBottomY = stone.position.y
  for (const b of allBoards) {
    if (b.id === stone.id) continue
    const bTopY = b.position.y + b.height
    if (Math.abs(bTopY - sBottomY) > 5) continue
    const overlapX = Math.min(stone.position.x + stone.width, b.position.x + b.width) - Math.max(stone.position.x, b.position.x)
    const overlapZ = Math.min(stone.position.z + stone.depth, b.position.z + b.depth) - Math.max(stone.position.z, b.position.z)
    if (overlapX > 0 && overlapZ > 0) return true
  }
  return false
}

function StaticSection({ board, unit, allBoards }: { board: Board; unit: Unit; allBoards: Board[] }) {
  const { t } = useTranslation()
  const mat = getMaterialById(board.materialId)
  const loadKg = useUIStore((s) => s.staticLoadKg)
  const setLoadKg = useUIStore((s) => s.setStaticLoadKg)
  if (!mat) return null
  if (mat.category === 'glass' || mat.category === 'metal') return null

  const isStone = mat.category === 'stone'

  // For stone: calculate weight and support status
  const stoneWeight = isStone ? boardWeightKg(board) : 0
  const hasSupport = isStone ? stoneHasSupport(board, allBoards) : false

  // For non-stone: include stone weight as additional load
  const stoneLoad = !isStone ? stoneLoadOnBoard(board, allBoards) : 0
  const totalLoad = loadKg + stoneLoad

  const result = calculateStatic(
    board.width, // span = width
    board.depth, // width of board face = depth
    board.height < board.depth ? board.height : board.depth, // thickness is the smaller dimension
    totalLoad,
    mat
  )

  const ratingColor = {
    ok: 'text-green-700 bg-green-50 border-green-200',
    warning: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    critical: 'text-red-700 bg-red-50 border-red-200'
  }

  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <h3 className="text-sm font-bold text-gray-700 mb-2">{t('static.title')}</h3>

      {/* Load input */}
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-gray-500 w-14">{t('static.load')}</label>
        <input
          type="number"
          value={loadKg}
          onChange={(e) => setLoadKg(Math.max(0, parseFloat(e.target.value) || 0))}
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
        />
        <span className="text-xs text-gray-400">kg</span>
      </div>

      {isStone && (
        <>
          {/* Stone weight info */}
          <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 mb-2">
            <div>{t('static.stoneWeight')}: <span className="font-bold">{stoneWeight.toFixed(1)} kg</span></div>
          </div>
          {!hasSupport && result.stoneNeedsSupport && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200 mb-2">
              {t('static.stoneWarning')}
            </div>
          )}
          {hasSupport && (
            <div className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200 mb-2">
              {t('static.stoneSupported')}
            </div>
          )}
        </>
      )}

      {!isStone && (
        <>
          {/* Show stone load if present */}
          {stoneLoad > 0 && (
            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 mb-2">
              <div>{t('static.stoneLoad')}: <span className="font-bold">{stoneLoad.toFixed(1)} kg</span></div>
              <div>{t('static.totalLoad')}: <span className="font-bold">{totalLoad.toFixed(1)} kg</span></div>
            </div>
          )}
          {/* Result */}
          <div className={`text-xs p-2 rounded border mb-2 ${ratingColor[result.rating]}`}>
            <div className="font-bold mb-1">
              {t(`static.${result.rating}`)}
            </div>
            <div>{t('static.deflection')}: {Number(result.deflectionMm).toFixed(2)} mm</div>
            <div>{t('static.minThickness')}: {result.minThicknessMm} mm</div>
            <div>{t('static.currentThickness')}: {result.currentThicknessMm} mm</div>
            <div>{t('static.safetyFactor')}: {Number(result.safetyFactor).toFixed(2)}</div>
          </div>
        </>
      )}
    </div>
  )
}

/** Epic 13b — simplified SVG schematic of board face showing attached hardware icons */
function HardwareSchematic({
  board,
  attached,
  lang
}: {
  board: Board
  attached: { hardwareId: string; quantity: number }[]
  lang: 'de' | 'en'
}) {
  if (attached.length === 0) return null

  // Board face: width × height, capped at 100×60px display
  const maxW = 100
  const maxH = 60
  const aspect = board.width / board.height
  const svgW = Math.min(maxW, maxH * aspect)
  const svgH = svgW / aspect

  const items = attached.map((ah) => hardwareItems.find((h) => h.id === ah.hardwareId)).filter(Boolean)

  return (
    <div className="mb-2">
      <svg
        width={svgW + 4}
        height={svgH + 4}
        viewBox={`0 0 ${svgW + 4} ${svgH + 4}`}
        className="block"
        style={{ border: '1px solid #e5e7eb', borderRadius: 3, background: '#f9fafb' }}
      >
        {/* Board outline */}
        <rect x={2} y={2} width={svgW} height={svgH}
          fill="white" stroke="#9ca3af" strokeWidth={1} />

        {/* Hardware icons */}
        {items.map((item, i) => {
          if (!item) return null
          const cat = item.category

          if (cat === 'hinges') {
            // Two circles near left edge, distributed vertically
            const x = 10
            const y1 = svgH * 0.25
            const y2 = svgH * 0.75
            return (
              <g key={i}>
                <circle cx={x + 2} cy={y1 + 2} r={4} fill="#bfdbfe" stroke="#3b82f6" strokeWidth={1} />
                <circle cx={x + 2} cy={y1 + 2} r={1.5} fill="#3b82f6" />
                <circle cx={x + 2} cy={y2 + 2} r={4} fill="#bfdbfe" stroke="#3b82f6" strokeWidth={1} />
                <circle cx={x + 2} cy={y2 + 2} r={1.5} fill="#3b82f6" />
              </g>
            )
          }
          if (cat === 'slides') {
            // Horizontal line along bottom
            return (
              <g key={i}>
                <line x1={6} y1={svgH - 4} x2={svgW - 4} y2={svgH - 4}
                  stroke="#6366f1" strokeWidth={3} strokeLinecap="round" />
              </g>
            )
          }
          if (cat === 'shelfPins') {
            // Small dots in a grid pattern
            return (
              <g key={i}>
                {[0.25, 0.75].map((xf, xi) =>
                  [0.33, 0.66].map((yf, yi) => (
                    <circle key={`${xi}-${yi}`}
                      cx={svgW * xf + 2} cy={svgH * yf + 2} r={2}
                      fill="#10b981" stroke="#047857" strokeWidth={0.5} />
                  ))
                )}
              </g>
            )
          }
          if (cat === 'handles') {
            // Horizontal bar in center
            const cx = svgW / 2 + 2
            const cy = svgH / 2 + 2
            return (
              <g key={i}>
                <rect x={cx - 14} y={cy - 3} width={28} height={6}
                  fill="#f9fafb" stroke="#6b7280" strokeWidth={1.5} rx={2} />
              </g>
            )
          }
          if (cat === 'camLocks') {
            // Small circle in corner
            return (
              <g key={i}>
                <circle cx={svgW - 6} cy={svgH - 6} r={4} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
                <text x={svgW - 6} y={svgH - 3} fontSize={5} fill="#92400e" textAnchor="middle">●</text>
              </g>
            )
          }
          return null
        })}
      </svg>
      <p className="text-[9px] text-gray-400 mt-0.5">
        {lang === 'de' ? 'Frontansicht' : 'Front view'} ({Math.round(board.width)}×{Math.round(board.height)}mm)
      </p>
    </div>
  )
}

function HardwareSection({
  board, assemblyId, onAdd, onRemove, onSetQty
}: {
  board: Board
  assemblyId: string
  onAdd: (hardwareId: string, qty: number) => void
  onRemove: (hardwareId: string) => void
  onSetQty: (hardwareId: string, qty: number) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const [addId, setAddId] = useState('')

  const attached = board.hardware ?? []

  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <h3 className="text-sm font-bold text-gray-700 mb-2">{t('hardware.title')}</h3>

      {/* Epic 13b — board face schematic */}
      <HardwareSchematic board={board} attached={attached} lang={lang} />

      {attached.length === 0 ? (
        <p className="text-xs text-gray-400 italic mb-2">{t('hardware.noItems')}</p>
      ) : (
        <div className="mb-2 space-y-1">
          {attached.map((ah) => {
            const item = hardwareItems.find((h) => h.id === ah.hardwareId)
            if (!item) return null
            return (
              <div key={ah.hardwareId} className="flex items-center gap-1 text-xs">
                <span className="flex-1 truncate text-gray-700">{lang === 'de' ? item.name : item.nameEn}</span>
                <input
                  type="number"
                  value={ah.quantity}
                  min={1}
                  onChange={(e) => onSetQty(ah.hardwareId, Math.max(1, Number(e.target.value)))}
                  className="w-12 text-right border border-gray-300 rounded px-1 py-0.5"
                />
                <button
                  onClick={() => onRemove(ah.hardwareId)}
                  className="text-red-400 hover:text-red-600"
                >×</button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-1">
        <select
          value={addId}
          onChange={(e) => setAddId(e.target.value)}
          className="flex-1 text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
        >
          <option value="">{t('hardware.addToBoard')}...</option>
          {hardwareItems.map((h) => (
            <option key={h.id} value={h.id}>{lang === 'de' ? h.name : h.nameEn}</option>
          ))}
        </select>
        <button
          onClick={() => { if (addId) { onAdd(addId, 1); setAddId('') } }}
          disabled={!addId}
          className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >+</button>
      </div>
    </div>
  )
}
