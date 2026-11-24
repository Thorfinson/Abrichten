import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { isLoadKg, MAX_LOAD_KG } from '../../utils/validateProject'
import { getMaterialById } from '../../data/materials'
import { boardWeightKg } from '../../services/static-sim'
import type { Board, PlacedLoad } from '../../types/furniture'
import { useDesignLocked } from '../../hooks/useDesignLocked'
import { numberFieldValue } from '../../utils/units'

interface BoardLoadFieldProps {
  assemblyId: string
  board: Board
}

interface KgFieldProps {
  id?: string
  /** Stored value; undefined = empty (the global payload) */
  value: number | undefined
  /** Empty is allowed (commits undefined) */
  optional?: boolean
  placeholder?: string
  ariaLabel?: string
  /** Input step; 'any' for weights with decimals (a datasheet's 37.8 kg) */
  step?: number | 'any'
  testId: string
  onCommit: (kg: number | undefined) => void
}

/**
 * A kg field that commits on blur or Enter (one undo step); Esc puts the stored value
 * back. A half-typed or out-of-range number keeps the stored value.
 */
function KgField({ id, value, optional, placeholder, ariaLabel, step = 1, testId, onCommit }: KgFieldProps) {
  const stored = value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(stored)
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setDraft(stored) }, [stored])

  const commit = (input: HTMLInputElement): void => {
    // A half-typed number ("1e", "-") reads as "": keep the stored value instead of clearing it
    if (input.validity.badInput) { setDraft(stored); return }
    const text = draft.trim()
    const kg = text === '' ? undefined : (numberFieldValue(text) ?? NaN)
    if ((kg === undefined && !optional) || (kg !== undefined && !isLoadKg(kg))) { setDraft(stored); return }
    if (kg !== value) onCommit(kg)
  }

  return (
    <input
      id={id}
      type="number"
      min={0}
      max={MAX_LOAD_KG}
      step={step}
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      onFocus={() => { editing.current = true }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (!editing.current) return   // Esc already reverted
        editing.current = false
        commit(e.currentTarget)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          e.preventDefault()   // Esc reverts the field; it must not also deselect the board
          editing.current = false
          setDraft(stored)
          e.currentTarget.blur()
        }
      }}
      className="w-16 text-right text-[10px] bg-chrome-deep border border-chrome-border text-chrome-text placeholder:text-chrome-hint rounded px-1.5 py-1 outline-none focus:border-action"
    />
  )
}

/**
 * Loads on one board for the load simulation: its payload (Board.loadKg; empty = the
 * global payload per shelf, shown as the placeholder) and the loads placed on it with
 * "Last setzen" (Board.loads), each with its weight and a remove button.
 */
export function BoardLoadField({ assemblyId, board }: BoardLoadFieldProps) {
  const { t } = useTranslation()
  const id = useId()
  const globalKg = useUIStore((s) => s.staticLoadKg)
  // a load is part of the design: no field in the assembly workspace (store/designLock.ts)
  const locked = useDesignLocked()
  const update = (patch: Partial<Board>): void => useProjectStore.getState().updateBoard(assemblyId, board.id, patch)
  const setLoad = (loadId: string, next: PlacedLoad | null): void => {
    const loads = (board.loads ?? []).flatMap((l) => (l.id !== loadId ? [l] : next ? [next] : []))
    update({ loads: loads.length ? loads : undefined })
  }

  if (locked) return null
  return (
    <div>
      <div className="flex items-center gap-2" title={t('sim.boardLoadHint', { kg: globalKg })}>
        <label htmlFor={id} className="text-[9px] font-bold text-chrome-muted uppercase tracking-widest shrink-0">
          {t('sim.boardLoad')}
        </label>
        <KgField
          id={id}
          value={board.loadKg}
          optional
          placeholder={String(globalKg)}
          testId="board-load-field"
          onCommit={(kg) => update({ loadKg: kg })}
        />
        <span className="text-[10px] text-chrome-muted">kg</span>
      </div>
      {board.loads && board.loads.length > 0 && (
        <div className="mt-2" data-testid="board-placed-loads">
          <div className="text-[9px] font-bold text-chrome-muted uppercase tracking-widest mb-1">{t('sim.placedLoads')}</div>
          {board.loads.map((l) => (
            <div key={l.id} className="flex items-center gap-2 py-0.5" data-testid="board-placed-load">
              <span className="text-[10px] text-chrome-secondary tabular-nums flex-1">
                {t('sim.placedLoadAt', { x: Math.round(l.x + l.w / 2), z: Math.round(l.z + l.d / 2) })}
              </span>
              <KgField
                value={l.kg}
                ariaLabel={t('sim.placedLoads')}
                testId="board-placed-load-kg"
                onCommit={(kg) => { if (kg !== undefined) setLoad(l.id, { ...l, kg }) }}
              />
              <span className="text-[10px] text-chrome-muted">kg</span>
              <button
                onClick={() => setLoad(l.id, null)}
                aria-label={t('sim.deleteLoad')}
                title={t('sim.deleteLoad')}
                data-testid="board-placed-load-delete"
                className="w-5 h-5 rounded text-chrome-muted hover:text-danger hover:bg-chrome-hover leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The part's weight for the load simulation (Board.weightKg; empty = volume × density,
 * shown as the placeholder), e.g. an appliance from its datasheet.
 */
export function BoardWeightField({ assemblyId, board }: BoardLoadFieldProps) {
  const { t } = useTranslation()
  const id = useId()
  const locked = useDesignLocked()
  const customMaterials = useProjectStore((s) => s.project.customMaterials)
  const fromMaterial = Math.round(boardWeightKg({ ...board, weightKg: undefined }, getMaterialById(board.materialId, customMaterials)) * 10) / 10

  // a weight is part of the design: no field in the assembly workspace (store/designLock.ts)
  if (locked) return null
  return (
    <div className="flex items-center gap-2" title={t('sim.boardWeightHint', { kg: fromMaterial })}>
      <label htmlFor={id} className="text-[9px] font-bold text-chrome-muted uppercase tracking-widest shrink-0">
        {t('sim.boardWeight')}
      </label>
      <KgField
        id={id}
        value={board.weightKg}
        optional
        step="any"
        placeholder={String(fromMaterial)}
        testId="board-weight-field"
        onCommit={(kg) => useProjectStore.getState().updateBoard(assemblyId, board.id, { weightKg: kg })}
      />
      <span className="text-[10px] text-chrome-muted">kg</span>
    </div>
  )
}
