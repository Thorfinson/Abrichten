import { useState, useEffect } from 'react'
import { fromMm, parseInput } from '../../utils/units'
import { evalFormula, isFormula } from '../../utils/formulaEval'
import { isDimension, MAX_MM } from '../../utils/validateProject'
import type { Board, Unit } from '../../types/furniture'

/**
 * Small reusable dimension/transform inputs shared by the property surfaces
 * (currently the FloatingPropertiesCard overlay).
 */

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
          if (text === String(value)) return   // focus + blur alone must not round the value or add an undo step
          const num = parseFloat(text)
          if (!isNaN(num)) {
            const rounded = allowDecimals ? Math.round(num * 10) / 10 : Math.round(num)
            const v = Math.max(-MAX_MM, Math.min(MAX_MM, rounded))   // beyond it the project would not load again
            setText(String(v))
            if (v !== value) onChange(v)
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
  label, value, field, unit, parameters, lang, onUpdate, formula: storedFormula
}: {
  label: string
  value: number
  field: 'width' | 'height' | 'depth'
  unit: Unit
  parameters: Record<string, number>
  lang: 'de' | 'en'
  onUpdate: (updates: Partial<Board>) => void
  /** The board's formula for this field (e.g. board.widthFormula); the field then shows it instead of the number. */
  formula?: string
}) {
  const shown = storedFormula ?? String(fromMm(value, unit))
  const [text, setText] = useState(shown)
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setText(shown); setInvalid(false) }, [shown])

  const formula = isFormula(text)
  const formulaKey = `${field}Formula` as const

  /** The board update for the typed text, or null when it is no usable size. */
  const parse = (): Partial<Board> | null => {
    if (formula) {
      const result = evalFormula(text, parameters)
      const mm = result === null ? null : Math.round(result * 10) / 10
      // Save both the resolved value and the raw formula string (without the optional '=')
      return mm !== null && isDimension(mm) ? { [field]: mm, [formulaKey]: text.trim().replace(/^=\s*/, '') } : null
    }
    const mm = parseInput(text, unit)
    // Clear formula string when numeric value is entered
    return mm !== null && isDimension(mm) ? { [field]: mm, [formulaKey]: undefined } : null
  }

  const commit = () => {
    // only an edit commits: focus + blur keeps the formula and adds no undo step
    if (text.trim() === shown.trim()) { setInvalid(false); return }
    const updates = parse()
    setInvalid(!updates)
    if (updates) onUpdate(updates)
  }

  const invalidHint = lang === 'de'
    ? 'Ungültig – Zahl oder Formel wie =H+20 eingeben (Esc setzt zurück)'
    : 'Invalid – enter a number or a formula like =H+20 (Esc resets)'

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
          aria-invalid={invalid || undefined}
          onChange={(e) => { setText(e.target.value); setInvalid(false) }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') { e.preventDefault(); setText(shown); setInvalid(false) }
          }}
          className={`w-full text-xs border rounded px-2 py-1 bg-white font-mono ${
            formula || invalid ? 'pr-5 ' : ''}${
            invalid ? 'ring-2 ring-red-500 border-red-500 text-red-700 bg-red-50'
              : formula ? 'border-amber-400 text-amber-700 bg-amber-50' : 'border-gray-300'
          }`}
          title={invalid ? invalidHint : formula ? (lang === 'de' ? 'Formel – Parameter in mm' : 'Formula – parameters in mm') : undefined}
        />
        {invalid ? (
          // inline colour: the dark card restyles every span inside it
          <span
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold select-none pointer-events-none"
            style={{ color: '#ef4444' }}
          >
            !
          </span>
        ) : formula && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-blue-600 select-none pointer-events-none">
            =
          </span>
        )}
      </div>
      <span className="text-xs text-gray-400">{formula ? 'mm' : unit}</span>
    </div>
  )
}
