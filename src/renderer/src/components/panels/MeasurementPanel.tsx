import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { formatValue } from '../../utils/units'
import type { Measurement } from '../../types/measurement'

function measurementLabel(m: Measurement, displayUnit: string, lang: 'de' | 'en'): string {
  if (m.type === 'distance') {
    return `${lang === 'de' ? 'Abstand' : 'Distance'}: ${formatValue(m.distance, displayUnit as any)}`
  }
  if (m.type === 'angle') {
    return `${lang === 'de' ? 'Winkel' : 'Angle'}: ${m.angle.toFixed(1)}°`
  }
  if (m.type === 'area') {
    const a = m.area
    const aStr = a < 100 ? `${a.toFixed(1)} mm²` : a < 1e6 ? `${(a / 100).toFixed(1)} cm²` : `${(a / 1e6).toFixed(3)} m²`
    return `${lang === 'de' ? 'Fläche' : 'Area'}: ${aStr}`
  }
  return '?'
}

function typeIcon(m: Measurement): string {
  if (m.type === 'distance') return '↔'
  if (m.type === 'angle')    return '∠'
  if (m.type === 'area')     return '⬛'
  return '•'
}

export function MeasurementPanel() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const displayUnit = useProjectStore((s) => s.project.displayUnit)
  const measurements = useUIStore((s) => s.measurements)
  const removeMeasurement = useUIStore((s) => s.removeMeasurement)
  const clearMeasurements = useUIStore((s) => s.clearMeasurements)
  const showMeasurementPanel = useUIStore((s) => s.showMeasurementPanel)
  const setShowMeasurementPanel = useUIStore((s) => s.setShowMeasurementPanel)

  if (!showMeasurementPanel) return null

  const handleExportCsv = () => {
    const rows = measurements.map((m, i) => `${i + 1};${m.type};${measurementLabel(m, displayUnit, lang)}`)
    const csv = ['#;Type;Value', ...rows].join('\n')
    const filename = 'measurements.csv'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowMeasurementPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[75vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-800">
            {lang === 'de' ? 'Messungen' : 'Measurements'}
          </h2>
          <div className="flex items-center gap-2">
            {measurements.length > 0 && (
              <>
                <button
                  onClick={handleExportCsv}
                  className="text-xs text-green-700 hover:text-green-900 border border-green-300 hover:border-green-500 px-2 py-0.5 rounded transition-colors"
                >
                  {lang === 'de' ? 'CSV Export' : 'Export CSV'}
                </button>
                <button
                  onClick={clearMeasurements}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded transition-colors"
                >
                  {lang === 'de' ? 'Alle löschen' : 'Clear all'}
                </button>
              </>
            )}
            <button onClick={() => setShowMeasurementPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {measurements.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 italic mb-2">
                {lang === 'de' ? 'Noch keine Messungen.' : 'No measurements yet.'}
              </p>
              <p className="text-xs text-gray-400">
                {lang === 'de'
                  ? 'Nutze die Messwerkzeuge (M / A / Q) im Viewport.'
                  : 'Use the measurement tools (M / A / Q) in the viewport.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {measurements.map((m, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded border border-gray-100 hover:bg-gray-50">
                  <span className="text-base w-6 text-center shrink-0">
                    {typeIcon(m)}
                  </span>
                  <span className="flex-1 text-xs text-gray-700">
                    <span className="text-gray-400 mr-1">#{i + 1}</span>
                    {measurementLabel(m, displayUnit, lang)}
                  </span>
                  <button
                    onClick={() => removeMeasurement(i)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-sm leading-none px-1"
                    title={lang === 'de' ? 'Löschen' : 'Delete'}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 flex justify-between items-center shrink-0">
          <span className="text-xs text-gray-400">
            {measurements.length} {lang === 'de' ? 'Messungen' : 'measurements'}
          </span>
          <button
            onClick={() => setShowMeasurementPanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {lang === 'de' ? 'Schließen' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
