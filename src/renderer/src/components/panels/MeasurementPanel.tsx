import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { Dialog, Button } from '../ui/Dialog'
import { formatValue } from '../../utils/units'
import type { Measurement } from '../../types/measurement'

function measurementLabel(m: Measurement, displayUnit: string, lang: 'de' | 'en'): string {
  if (m.type === 'distance') {
    return `${lang === 'de' ? 'Abstand' : 'Distance'}: ${formatValue(m.distance, displayUnit as any, lang)}`
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
  const { t, i18n } = useTranslation()
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
    <Dialog
      title={lang === 'de' ? 'Messungen' : 'Measurements'}
      titleId="measurements-title"
      onClose={() => setShowMeasurementPanel(false)}
      className="w-[480px]"
      headerExtra={measurements.length > 0 && (
        <Button variant="danger" size="sm" onClick={clearMeasurements}>
          {lang === 'de' ? 'Alle löschen' : 'Clear all'}
        </Button>
      )}
      footer={<>
        <span className="mr-auto text-xs text-chrome-muted">
          {measurements.length} {lang === 'de' ? 'Messungen' : 'measurements'}
        </span>
        <Button variant="primary" onClick={handleExportCsv} disabled={measurements.length === 0}>
          {lang === 'de' ? 'CSV Export' : 'Export CSV'}
        </Button>
        <Button onClick={() => setShowMeasurementPanel(false)}>{t('ui.close')}</Button>
      </>}
    >
      {measurements.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mb-2 text-sm italic text-chrome-muted">
            {lang === 'de' ? 'Noch keine Messungen.' : 'No measurements yet.'}
          </p>
          <p className="text-xs text-chrome-hint">
            {t('dlg.measureHint')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {measurements.map((m, i) => (
            <li key={i} className="flex items-center gap-2 rounded border border-chrome-border px-2 py-1.5 hover:bg-chrome-surface/40">
              <span className="w-6 shrink-0 text-center text-base text-accent" aria-hidden="true">
                {typeIcon(m)}
              </span>
              <span className="flex-1 text-xs text-chrome-text">
                <span className="mr-1 font-mono text-chrome-hint">#{i + 1}</span>
                {measurementLabel(m, displayUnit, lang)}
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => removeMeasurement(i)}
                title={t('measurements.delete')}
                aria-label={t('measurements.delete')}
              >×</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
