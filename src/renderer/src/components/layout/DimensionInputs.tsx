import { useState, useEffect } from 'react'
import { fromMm, parseInput } from '../../utils/units'
import { evalFormula, isFormula } from '../../utils/formulaEval'
import type { Board, Unit } from '../../types/furniture'

/**
 * Small reusable dimension/transform inputs shared by the property surfaces
 * (currently the FloatingPropertiesCard overlay). Extracted from the former
 * right-side PropertiesPanel so they can live without the dead panel.
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
