import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { csvCell, escapeHtml } from '../../utils/textSafety'
import { BAR_MAX_WIDTH_MM, type BarGroup, type BarSettings } from '../../utils/barCutting'
import { FIELD_CLASS, TH_CLASS, TD_CLASS, SECTION_LABEL_CLASS } from '../ui/Dialog'

/** How the cut list shows lengths: a mm value as a number in the display unit, and that unit. */
export interface LengthFormat {
  fmt: (mm: number) => string
  unit: string
  lang: string
  materialName: (materialId: string) => string
}

const SETTING_FIELDS: [keyof BarSettings, string][] = [
  ['stockMm', 'cutting.barStock'], ['kerfMm', 'cutting.barKerf'], ['trimMm', 'cutting.barTrim']
]

const metres = (mm: number, lang: string): string =>
  (mm / 1000).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 })

const groupTitle = (g: BarGroup, f: LengthFormat): string => `${f.materialName(g.materialId)} ${f.fmt(g.width)} × ${f.fmt(g.thickness)} ${f.unit}`

const groupSummary = (g: BarGroup, s: BarSettings, f: LengthFormat, t: TFunction): string =>
  t('cutting.barSummary', { count: g.count, total: metres(g.totalMm, f.lang), bars: t('cutting.barBars', { count: g.bars.length }), stock: metres(s.stockMm, f.lang) })

const lengths = (b: BarGroup['bars'][number], f: LengthFormat): string => b.pieces.map((p) => f.fmt(p.length)).join(' + ')
const names = (b: BarGroup['bars'][number]): string => b.pieces.map((p) => p.name).join(' · ')
const tooLongText = (g: BarGroup, f: LengthFormat, t: TFunction): string =>
  t('cutting.barTooLong', { parts: g.tooLong.map((p) => `${p.name} (${f.fmt(p.length)} ${f.unit})`).join(', ') })

interface BarCutPlanProps {
  groups: BarGroup[]
  settings: BarSettings
  onSettings: (settings: BarSettings) => void
  format: LengthFormat
}

/** The cut plan for bar stock in the cut list: per section the bars with their pieces and what is left. */
export function BarCutPlan({ groups, settings, onSettings, format: f }: BarCutPlanProps) {
  const { t } = useTranslation()
  if (groups.length === 0) return null
  return (
    <section className="mt-5" data-testid="bar-plan">
      <h3 className={`${SECTION_LABEL_CLASS} mb-1.5`}>{t('cutting.barPlan')}</h3>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-chrome-secondary">
        {SETTING_FIELDS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            {t(label)}
            <input
              type="number"
              min={key === 'stockMm' ? 1 : 0}
              step={1}
              value={settings[key]}
              data-testid={`bar-${key}`}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (e.target.value !== '' && Number.isFinite(v) && v >= (key === 'stockMm' ? 1 : 0)) onSettings({ ...settings, [key]: v })
              }}
              className={`${FIELD_CLASS} w-20 text-right`}
            />
            mm
          </label>
        ))}
        <span className="text-[11px] text-chrome-hint">{t('cutting.barHint', { width: BAR_MAX_WIDTH_MM / 10 })}</span>
      </div>
      {groups.map((g) => (
        <div key={`${g.materialId}-${g.width}-${g.thickness}`} className="mb-3" data-testid="bar-group">
          <div className="mb-1 text-xs">
            <span className="font-semibold text-chrome-text">{groupTitle(g, f)}</span>
            <span className="text-chrome-muted"> — {groupSummary(g, settings, f, t)}</span>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={`${TH_CLASS} w-14 text-right`}>{t('cutting.barNr')}</th>
                <th className={TH_CLASS}>{t('cutting.barPieces', { unit: f.unit })}</th>
                <th className={`${TH_CLASS} w-24 text-right`}>{t('cutting.barRest', { unit: f.unit })}</th>
              </tr>
            </thead>
            <tbody>
              {g.bars.map((b, i) => (
                <tr key={i} data-testid="bar-row" className="hover:bg-chrome-surface/40">
                  <td className={`${TD_CLASS} text-right font-mono text-chrome-muted`}>{i + 1}</td>
                  <td className={TD_CLASS}>
                    <div className="font-mono text-chrome-text">{lengths(b, f)}</div>
                    <div className="text-[11px] text-chrome-muted">{names(b)}</div>
                  </td>
                  <td className={`${TD_CLASS} text-right font-mono`}>{f.fmt(b.restMm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g.tooLong.length > 0 && <p className="mt-1 text-xs text-danger-text">{tooLongText(g, f, t)}</p>}
        </div>
      ))}
    </section>
  )
}

/** The cut plan for the printed cut list (empty without bar stock). */
export function barPlanHtml(groups: BarGroup[], s: BarSettings, f: LengthFormat, t: TFunction): string {
  if (groups.length === 0) return ''
  const settingsLine = `${t('cutting.barStock')} ${s.stockMm} mm · ${t('cutting.barKerf')} ${s.kerfMm} mm · ${t('cutting.barTrim')} ${s.trimMm} mm`
  return `<h2>${escapeHtml(t('cutting.barPlan'))}</h2><p>${escapeHtml(settingsLine)}</p>` + groups.map((g) => `
<h3>${escapeHtml(groupTitle(g, f))} — ${escapeHtml(groupSummary(g, s, f, t))}</h3>
<table><thead><tr><th>${escapeHtml(t('cutting.barNr'))}</th><th>${escapeHtml(t('cutting.barPieces', { unit: f.unit }))}</th><th>${escapeHtml(t('cutting.barRest', { unit: f.unit }))}</th></tr></thead>
<tbody>${g.bars.map((b, i) => `<tr><td class="n">${i + 1}</td><td>${escapeHtml(lengths(b, f))}<br><small>${escapeHtml(names(b))}</small></td><td class="n">${escapeHtml(f.fmt(b.restMm))}</td></tr>`).join('')}</tbody></table>
${g.tooLong.length ? `<p>${escapeHtml(tooLongText(g, f, t))}</p>` : ''}`).join('')
}

/** The cut plan as CSV rows (none without bar stock). */
export function barPlanCsvRows(groups: BarGroup[], s: BarSettings, f: LengthFormat, t: TFunction, sep: string): string[] {
  if (groups.length === 0) return []
  const row = (cells: unknown[]): string => cells.map(csvCell).join(sep)
  return ['', row([t('cutting.barPlan')]), ...groups.flatMap((g) => [
    row([groupTitle(g, f), groupSummary(g, s, f, t)]),
    row([t('cutting.barNr'), t('cutting.barPieces', { unit: f.unit }), t('cutting.barRest', { unit: f.unit }), t('cutting.barParts')]),
    ...g.bars.map((b, i) => row([i + 1, lengths(b, f), f.fmt(b.restMm), names(b)])),
    ...(g.tooLong.length ? [row([tooLongText(g, f, t)])] : [])
  ])]
}
