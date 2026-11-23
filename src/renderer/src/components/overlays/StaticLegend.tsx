import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/useUIStore'
import { useStaticSimulation, useStaticStore, modelFieldMax, DEFORMATION_SCALE, type StaticResultType, type StaticScaleMode } from '../../store/useStaticStore'
import { UTILISATION_GRADIENT_CSS, UTILISATION_STOPS, UNSUPPORTED_COLOR, NEUTRAL_COLOR, SUPPORT_COLOR, JOINT_COLOR } from '../../services/static-calc'
import { MAX_LOAD_KG } from '../../utils/validateProject'
import { Icon } from '../layout/Icon'
import { useDesignLocked } from '../../hooks/useDesignLocked'

/** Number field for a kg value that applies every valid entry while typing; empty reports undefined, Esc restores the value it had on focus. */
export function KgInput({ value, onChange, placeholder, ariaLabel, className }: {
  value: number | undefined
  onChange: (kg: number | undefined) => void
  placeholder?: string
  ariaLabel: string
  className?: string
}) {
  const shown = value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  const [editing, setEditing] = useState(false)
  const onFocusValue = useRef(value)
  useEffect(() => { if (!editing) setDraft(shown) }, [shown, editing])
  return (
    <input
      type="number"
      min={0}
      max={MAX_LOAD_KG}
      step={1}
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => { onFocusValue.current = value; setEditing(true) }}
      onChange={(e) => {
        setDraft(e.target.value)
        const text = e.target.value.trim()
        const kg = Number(text)
        if (text === '') onChange(undefined)
        else if (Number.isFinite(kg) && kg >= 0) onChange(Math.min(MAX_LOAD_KG, kg))
      }}
      onBlur={() => { setEditing(false); setDraft(shown) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          e.preventDefault()   // Esc reverts the field; it must not also close or deselect
          onChange(onFocusValue.current)
          e.currentTarget.blur()
        }
      }}
      className={className ?? 'w-14 text-right text-[11px] bg-chrome-deep border border-chrome-border text-chrome-text rounded px-1.5 py-0.5 outline-none focus:border-action'}
    />
  )
}

/**
 * Legend of the static heat map: what it shows (stress or deflection) on one colour
 * scale, the markers, the global payload per shelf, contours and deformation, and the
 * "Last setzen" mode that places loads by clicking. Rendered while the static overlay is on.
 */
export function StaticLegend() {
  const showStaticOverlay = useUIStore((s) => s.showStaticOverlay)
  return showStaticOverlay ? <LegendCard /> : null
}

/** A share as percent for the legend: one decimal below 10 %, whole numbers above. */
const formatPct = (share: number): string => {
  const p = share * 100
  return p < 10 ? p.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(Math.round(p))
}

function LegendCard() {
  const { t } = useTranslation()
  const payloadKg = useUIStore((s) => s.staticLoadKg)
  const setStaticLoadKg = useUIStore((s) => s.setStaticLoadKg)
  const showDeformation = useStaticStore((s) => s.showDeformation)
  const toggleDeformation = useStaticStore((s) => s.toggleDeformation)
  const resultType = useStaticStore((s) => s.resultType)
  const setResultType = useStaticStore((s) => s.setResultType)
  const showContours = useStaticStore((s) => s.showContours)
  const toggleContours = useStaticStore((s) => s.toggleContours)
  const scaleMode = useStaticStore((s) => s.scaleMode)
  const setScaleMode = useStaticStore((s) => s.setScaleMode)
  // the assembly workspace reads the loads; placing them is the design's
  const locked = useDesignLocked()
  const placing = useStaticStore((s) => s.placingLoad) && !locked
  const setPlacing = useStaticStore((s) => s.setPlacingLoad)
  const placeKg = useStaticStore((s) => s.placeKg)
  const setPlaceKg = useStaticStore((s) => s.setPlaceKg)
  const collapsed = useUIStore((s) => s.staticLegendCollapsed)
  const setCollapsed = useUIStore((s) => s.setStaticLegendCollapsed)
  const toggleStaticOverlay = useUIStore((s) => s.toggleStaticOverlay)
  const sim = useStaticSimulation()
  const modelMax = modelFieldMax(sim, resultType)
  const types: { id: StaticResultType; label: string }[] = [
    { id: 'stress', label: t('sim.resultStress') },
    { id: 'deflection', label: t('sim.resultDeflection') }
  ]
  return (
    <div
      data-testid="static-legend"
      className={`pointer-events-auto ${collapsed ? '' : 'w-[420px]'} bg-chrome-bg/95 text-chrome-text border border-chrome-border rounded-lg shadow-2xl px-3 py-2 text-[11px] select-none`}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-chrome-text whitespace-nowrap">{t('sim.legendTitle')}</span>
        <span className="ml-auto text-chrome-muted tabular-nums text-right">
          {t('sim.counts', { critical: sim.critical, warning: sim.warning, unsupported: sim.unsupported })}
        </span>
        {/* Fold to this row (remembered), or switch the static overlay off */}
        <button
          data-testid="static-legend-fold"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('sim.legendUnfold') : t('sim.legendFold')}
          title={collapsed ? t('sim.legendUnfold') : t('sim.legendFold')}
          className="w-5 h-5 flex items-center justify-center rounded text-chrome-muted hover:text-chrome-text hover:bg-chrome-hover transition-colors"
        >
          <Icon name={collapsed ? 'chevronUp' : 'chevronDown'} className="w-3.5 h-3.5" />
        </button>
        <button
          data-testid="static-legend-close"
          onClick={toggleStaticOverlay}
          aria-label={t('sim.legendClose')}
          title={t('sim.legendClose')}
          className="w-5 h-5 flex items-center justify-center rounded text-chrome-muted hover:text-chrome-text hover:bg-chrome-hover transition-colors"
        >
          <Icon name="close" className="w-3.5 h-3.5" />
        </button>
      </div>
      {!collapsed && (<>
        {/* Result type: what the colours show */}
        <div className="flex items-center gap-2 mt-1.5 mb-1.5">
          <span className="text-chrome-muted">{t('sim.resultType')}</span>
          <div role="radiogroup" aria-label={t('sim.resultType')} className="flex rounded border border-chrome-border overflow-hidden">
            {types.map((ty) => (
              <button
                key={ty.id}
                role="radio"
                aria-checked={resultType === ty.id}
                data-testid={`static-result-${ty.id}`}
                onClick={() => setResultType(ty.id)}
                className={`px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${resultType === ty.id ? 'bg-action text-action-text' : 'text-chrome-secondary hover:bg-chrome-hover'}`}
              >
                {ty.label}
              </button>
            ))}
          </div>
        </div>
        {/* Colour scale: per board (where the load sits) or absolute (how close to breaking) */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-chrome-muted">{t('sim.scaleLabel')}</span>
          <div role="radiogroup" aria-label={t('sim.scaleLabel')} className="flex rounded border border-chrome-border overflow-hidden">
            {([['model', t('sim.scaleModel')], ['board', t('sim.scaleRelative')], ['absolute', t('sim.scaleAbsolute')]] as [StaticScaleMode, string][]).map(([id, label]) => {
              const on = id === scaleMode
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={on}
                  data-testid={`static-scale-${id}`}
                  onClick={() => setScaleMode(id)}
                  className={`px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${on ? 'bg-action text-action-text' : 'text-chrome-secondary hover:bg-chrome-hover'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Utilisation scale */}
        <div className="h-2.5 rounded-sm border border-black/40" style={{ background: UTILISATION_GRADIENT_CSS }} />
        <div className="relative h-4 text-[10px] text-chrome-muted tabular-nums">
          {scaleMode === 'board' ? (
            <>
              <span className="absolute top-0.5 left-0 whitespace-nowrap">0</span>
              <span className="absolute top-0.5 right-0 whitespace-nowrap">{t('sim.scaleBoardMax')}</span>
            </>
          ) : scaleMode === 'model' ? (
            // real numbers, like an FEA legend: 0 … the model's highest value
            [0, 0.25, 0.5, 0.75, 1].map((at) => (
              <span
                key={at}
                className="absolute top-0.5 whitespace-nowrap"
                style={{ left: `${at * 100}%`, transform: at === 1 ? 'translateX(-100%)' : at === 0 ? 'none' : 'translateX(-50%)' }}
              >
                {`${formatPct(at * modelMax)} %`}
              </span>
            ))
          ) : UTILISATION_STOPS.map((s) => (
            <span
              key={s.at}
              className="absolute top-0.5 whitespace-nowrap"
              style={{ left: `${s.at * 100}%`, transform: s.at === 1 ? 'translateX(-100%)' : s.at === 0 ? 'none' : 'translateX(-50%)' }}
            >
              {`${s.at * 100} %`}
            </span>
          ))}
        </div>
        <div className="text-chrome-secondary mt-0.5">
          {scaleMode === 'board'
            ? t('sim.relativeHint')
            : scaleMode === 'model'
            ? t('sim.modelHint')
            : resultType === 'stress'
              ? <><span className="font-semibold text-danger">{t('sim.scaleBreak')}</span> · {t('sim.utilisationHint')}</>
              : t('sim.deflectionHint')}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-chrome-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-white" />
            {t('sim.hotspotLegend')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: SUPPORT_COLOR }} />
            {t('sim.supportsLegend')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2" style={{ background: JOINT_COLOR }} />
            {t('sim.jointsLegend')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: UNSUPPORTED_COLOR }} />
            {t('sim.unsupported')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm opacity-70" style={{ background: NEUTRAL_COLOR }} />
            {t('sim.notChecked')}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-chrome-border">
          <label className="flex items-center gap-1.5 text-chrome-secondary">
            {t('sim.payload')}
            <KgInput
              value={payloadKg}
              onChange={(kg) => { if (kg !== undefined) setStaticLoadKg(kg) }}
              ariaLabel={t('sim.payload')}
            />
            <span className="text-chrome-muted">kg</span>
          </label>
          <label className="flex items-center gap-1.5 text-chrome-secondary cursor-pointer">
            <input type="checkbox" checked={showContours} onChange={toggleContours} className="accent-[var(--color-action)]" data-testid="static-contours" />
            {t('sim.contours')}
          </label>
          <label className="flex items-center gap-1.5 text-chrome-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={showDeformation}
              onChange={toggleDeformation}
              className="accent-[var(--color-action)]"
            />
            {t('sim.deformation', { factor: DEFORMATION_SCALE })}
          </label>
        </div>

        {/* Placing loads: a click on the top of a lying board puts placeKg there */}
        {!locked && (
          <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-chrome-border">
            <button
              data-testid="static-place-load"
              aria-pressed={placing}
              onClick={() => setPlacing(!placing)}
              className={`h-6 px-2.5 rounded text-[11px] font-medium border transition-colors ${placing
                ? 'bg-action text-action-text border-action'
                : 'border-chrome-border text-chrome-secondary hover:bg-chrome-hover'}`}
            >
              ↓ {t('sim.placeLoad')}
            </button>
            <label className="flex items-center gap-1.5 text-chrome-secondary">
              {t('sim.placeKg')}
              <KgInput
                value={placeKg}
                onChange={(kg) => { if (kg !== undefined && kg > 0) setPlaceKg(kg) }}
                ariaLabel={t('sim.placeKg')}
              />
              <span className="text-chrome-muted">kg</span>
            </label>
          </div>
        )}
        {placing && (
          <div data-testid="static-place-hint" className="mt-1 text-chrome-secondary">{t('sim.placeLoadHint', { kg: placeKg })}</div>
        )}
      </>)}
    </div>
  )
}
