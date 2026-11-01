import { useState } from 'react'
import { activeAssemblies } from '../../utils/activeParts'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getMaterialById, materials } from '../../data/materials'
import { hardwareItems } from '../../data/hardware'
import { resolvePrice, type PriceSource } from '../../data/defaultPrices'
import { faceAreaSqm } from '../../utils/boardFace'
import { csvCell, escapeHtml } from '../../utils/textSafety'
import { printHtml } from '../../utils/printHtml'
import { getCsvDelimiter } from '../layout/SettingsDialog'
import { Dialog, Button, FIELD_CLASS, TH_CLASS, TD_CLASS, SECTION_LABEL_CLASS } from '../ui/Dialog'

/** Format a number as currency, locale-aware */
function formatCurrency(value: number, lang: 'de' | 'en'): string {
  return value.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

/** Format area (m²) locale-aware */
function formatArea(value: number, lang: 'de' | 'en'): string {
  return value.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  })
}

/** Small tag telling a guide price ("Richtwert") from the project's own price */
function PriceTag({ source }: { source: PriceSource }) {
  const { t } = useTranslation()
  if (source === 'none') return null
  return source === 'default'
    ? <span className="ml-1.5 rounded bg-accent-dim/60 px-1 py-px text-[10px] font-medium text-accent-text" title={t('dlg.guidePriceTitle')}>{t('dlg.guidePrice')}</span>
    : <span className="ml-1.5 rounded bg-chrome-surface px-1 py-px text-[10px] font-medium text-chrome-secondary">{t('dlg.ownPrice')}</span>
}

export function CostPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const project = useProjectStore((s) => s.project)
  const setMaterialPrice = useProjectStore((s) => s.setMaterialPrice)
  const setLaborDetails = useProjectStore((s) => s.setLaborDetails)
  const showCostPanel = useUIStore((s) => s.showCostPanel)
  const setShowCostPanel = useUIStore((s) => s.setShowCostPanel)
  const [editingPrices, setEditingPrices] = useState(false)

  if (!showCostPanel) return null

  const cur = t('cost.currency')
  // project price first, then the built-in guide value (data/defaultPrices)
  const priceOf = (id: string) => resolvePrice(id, project.materialPrices)
  const customMaterials = project.customMaterials ?? []
  const laborHours   = project.laborHours   ?? 0
  const laborRate    = project.laborRate     ?? 0
  const overheadPct  = project.overheadPct  ?? 0

  // ── Material cost ────────────────────────────────────────────────────────
  // Maps, not objects keyed by id: ids come from project files.
  // Boards with an unknown material (older files) still count, under their raw id.
  const usageMap = new Map<string, { name: string; areaSqm: number; cost: number }>()
  for (const assembly of activeAssemblies(project)) {
    for (const board of assembly.boards) {
      const mat = getMaterialById(board.materialId, customMaterials)
      const areaSqm = faceAreaSqm(board)
      const prev = usageMap.get(board.materialId) ?? {
        name: mat ? (lang === 'de' ? mat.name : mat.nameEn) : `${board.materialId} (${t('calc.unknownMaterial')})`,
        areaSqm: 0,
        cost: 0
      }
      usageMap.set(board.materialId, { ...prev, areaSqm: prev.areaSqm + areaSqm, cost: prev.cost + areaSqm * priceOf(board.materialId).price })
    }
  }
  const matRows = [...usageMap.entries()]
  const totalMaterialCost = matRows.reduce((s, [, v]) => s + v.cost, 0)
  const usesGuidePrices = matRows.some(([id]) => priceOf(id).source === 'default')

  // Price editor: materials in use first, then the other project and built-in
  // materials (a project material overrides a built-in one with the same id)
  const allMaterials = [
    ...customMaterials.map((m) => ({ id: m.id, name: lang === 'de' ? m.name : m.nameEn })),
    ...materials.filter((m) => !customMaterials.some((c) => c.id === m.id)).map((m) => ({ id: m.id, name: lang === 'de' ? m.name : m.nameEn }))
  ]
  const priceEditorRows = [
    ...matRows.map(([id, v]) => ({ id, name: allMaterials.find((m) => m.id === id)?.name ?? v.name })),
    ...allMaterials.filter((m) => !usageMap.has(m.id))
  ]

  // ── Hardware cost ────────────────────────────────────────────────────────
  const hwMap = new Map<string, { name: string; qty: number; unitPrice: number; total: number }>()
  for (const assembly of activeAssemblies(project)) {
    for (const board of assembly.boards) {
      for (const attached of board.hardware ?? []) {
        const hw = hardwareItems.find((h) => h.id === attached.hardwareId)
          ?? project.customHardware?.find((h) => h.id === attached.hardwareId)   // project-defined hardware counts too
        if (!hw) continue
        const prev = hwMap.get(hw.id) ?? { name: lang === 'de' ? hw.name : hw.nameEn, qty: 0, unitPrice: hw.unitPrice, total: 0 }
        hwMap.set(hw.id, { ...prev, qty: prev.qty + attached.quantity, total: prev.total + attached.quantity * hw.unitPrice })
      }
    }
  }
  const hwRows = [...hwMap.entries()]
  const totalHardwareCost = hwRows.reduce((s, [, v]) => s + v.total, 0)

  // ── Labor & overhead ─────────────────────────────────────────────────────
  const laborSubtotal = laborHours * laborRate
  const baseForOverhead = totalMaterialCost + totalHardwareCost + laborSubtotal
  const overheadAmount = baseForOverhead * overheadPct
  const grandTotal = baseForOverhead + overheadAmount

  const hasData = matRows.length > 0 || hwRows.length > 0
  const breakdown = [
    { label: t('cost.materialCost'), value: totalMaterialCost, show: matRows.length > 0 },
    { label: t('cost.hardwareCost'), value: totalHardwareCost, show: totalHardwareCost > 0 },
    { label: lang === 'de' ? 'Arbeit' : 'Labor', value: laborSubtotal, show: laborSubtotal > 0 },
    { label: `Overhead (${(overheadPct * 100).toFixed(0)} %)`, value: overheadAmount, show: overheadAmount > 0 }
  ].filter((r) => r.show)
  const money = (v: number) => `${cur}${formatCurrency(v, lang)}`
  const guideMark = (id: string) => (priceOf(id).source === 'default' ? ' *' : '')

  const handlePrint = () => {
    const matSection = matRows.map(([id, v]) =>
      `<tr><td>Material</td><td>${escapeHtml(v.name)}</td><td>${formatArea(v.areaSqm, lang)} m²</td><td>${escapeHtml(money(v.cost))}${guideMark(id)}</td></tr>`
    ).join('')
    const hwSection = hwRows.map(([, v]) =>
      `<tr><td>${lang === 'de' ? 'Beschlag' : 'Hardware'}</td><td>${escapeHtml(v.name)}</td><td>${escapeHtml(String(v.qty))}</td><td>${escapeHtml(money(v.total))}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(project.name)} - ${lang === 'de' ? 'Kosten' : 'Cost'}</title>
<style>body{font:12px sans-serif;margin:20px}h1{font-size:14px;margin-bottom:4px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
th{background:#f0f0f0}tfoot td{font-weight:bold;background:#e8f0fe}p{color:#666;font-size:10px}
@media print{@page{size:A4;margin:15mm}}</style></head>
<body><h1>${escapeHtml(project.name)} — ${lang === 'de' ? 'Kostenkalkulation' : 'Cost Summary'}</h1>
<table><thead><tr>
<th>${lang === 'de' ? 'Typ' : 'Type'}</th>
<th>${lang === 'de' ? 'Name' : 'Name'}</th>
<th>${lang === 'de' ? 'Menge' : 'Quantity'}</th>
<th>${lang === 'de' ? 'Kosten' : 'Cost'}</th>
</tr></thead><tbody>${matSection}${hwSection}</tbody>
<tfoot><tr><td colspan="3">${lang === 'de' ? 'Gesamt' : 'Total'}</td><td>${escapeHtml(money(grandTotal))}</td></tr></tfoot>
</table>${usesGuidePrices ? `<p>* ${escapeHtml(t('dlg.guidePriceNote'))}</p>` : ''}</body></html>`
    printHtml(html)
  }

  const handleExportCsv = () => {
    const rows: unknown[][] = []
    rows.push(lang === 'de' ? ['Typ', 'Name', 'Menge', 'Einheitspreis', 'Gesamt'] : ['Type', 'Name', 'Quantity', 'Unit Price', 'Total'])
    for (const [matId, v] of matRows) {
      const p = priceOf(matId)
      const unit = p.source === 'default' ? `${money(p.price)} (${t('dlg.guidePrice')})` : money(p.price)
      rows.push(['Material', v.name, `${formatArea(v.areaSqm, lang)} m²`, unit, money(v.cost)])
    }
    for (const [, v] of hwRows) {
      rows.push([lang === 'de' ? 'Beschlag' : 'Hardware', v.name, v.qty, money(v.unitPrice), money(v.total)])
    }
    if (laborSubtotal > 0) {
      rows.push([lang === 'de' ? 'Arbeit' : 'Labor', `${laborHours}h × ${money(laborRate)}`, '', '', money(laborSubtotal)])
    }
    if (overheadAmount > 0) {
      rows.push(['Overhead', `${(overheadPct * 100).toFixed(0)}%`, '', '', money(overheadAmount)])
    }
    rows.push(['', '', '', '', money(grandTotal)])
    const sep = getCsvDelimiter()
    const csv = rows.map((r) => r.map(csvCell).join(sep)).join('\n')
    const filename = `${project.name}_cost.csv`
    if ((window as any).electronAPI?.fileExport) {
      ;(window as any).electronAPI.fileExport(csv, filename)
    } else {
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const num = `${TD_CLASS} text-right font-mono tabular-nums`
  const numInput = `${FIELD_CLASS} w-20 text-right`

  return (
    <Dialog
      title={t('cost.title')}
      titleId="cost-panel-title"
      onClose={() => setShowCostPanel(false)}
      className="w-[680px]"
      headerExtra={
        <Button variant="ghost" size="sm" aria-pressed={editingPrices} onClick={() => setEditingPrices((v) => !v)}>
          {editingPrices ? t('dlg.donePrices') : t('cost.editPrices')}
        </Button>
      }
      footer={<>
        <div className="mr-auto flex items-baseline gap-3">
          <span className="text-sm font-semibold text-chrome-secondary">{t('cost.totalCost')}</span>
          <span className="font-mono text-xl font-bold tabular-nums text-chrome-text" data-testid="cost-total">{money(grandTotal)}</span>
        </div>
        <Button onClick={handleExportCsv} disabled={!hasData}>{t('cutting.export')}</Button>
        <Button variant="primary" onClick={handlePrint} disabled={!hasData}>{lang === 'de' ? 'PDF drucken' : 'Print PDF'}</Button>
        <Button onClick={() => setShowCostPanel(false)}>{t('ui.close')}</Button>
      </>}
    >
      <div className="space-y-5">
        {/* Price editor */}
        {editingPrices && (
          <section className="rounded border border-chrome-border bg-chrome-deep/60 p-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className={SECTION_LABEL_CLASS}>{t('cost.pricePerSqm')} ({cur})</h3>
              <span className="text-[11px] text-chrome-hint">
                <span className="text-accent">{t('dlg.guidePrice')}</span> · {t('dlg.priceEditorHint')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {priceEditorRows.map((mat) => {
                const p = priceOf(mat.id)
                return (
                  <label key={mat.id} className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-xs ${usageMap.has(mat.id) ? 'text-chrome-text' : 'text-chrome-muted'}`}>{mat.name}</span>
                    {/* guide values in accent, own prices tagged: the editor stays quiet for the common case */}
                    {p.source === 'project' && <span className="text-[10px] text-chrome-hint">{t('dlg.ownPrice')}</span>}
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      key={`${mat.id}:${p.price}:${p.source}`} /* remount so undo shows the restored value */
                      aria-label={`${t('cost.pricePerSqm')} ${mat.name}`}
                      defaultValue={p.price || ''}
                      placeholder="0"
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value)
                        // only an actual change becomes an own price; tabbing past keeps the guide value
                        if (!isNaN(v) && v !== p.price) setMaterialPrice(mat.id, v)
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      title={p.source === 'default' ? t('dlg.guidePriceTitle') : undefined}
                      className={`${numInput} ${p.source === 'default' ? 'text-accent!' : ''}`}
                    />
                  </label>
                )
              })}
            </div>
          </section>
        )}

        {/* Material costs */}
        {matRows.length === 0 ? (
          <p className="text-xs italic text-chrome-hint">{t('cutting.noBoards')}</p>
        ) : (
          <section>
            <h3 className={`${SECTION_LABEL_CLASS} mb-1.5`}>{t('cost.materialCost')}</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={TH_CLASS}>{t('board.material')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('cost.area')} (m²)</th>
                  <th className={`${TH_CLASS} text-right`}>{t('cost.pricePerSqm')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('cost.total')}</th>
                </tr>
              </thead>
              <tbody>
                {matRows.map(([matId, v]) => {
                  const p = priceOf(matId)
                  return (
                    <tr key={matId} className="hover:bg-chrome-surface/40">
                      <td className={TD_CLASS}>{v.name}</td>
                      <td className={num}>{formatArea(v.areaSqm, lang)}</td>
                      <td className={`${TD_CLASS} text-right`}>
                        {p.price
                          ? <><span className="font-mono tabular-nums">{money(p.price)}</span><PriceTag source={p.source} /></>
                          : <span className="italic text-chrome-hint">{t('cost.noPrice')}</span>}
                      </td>
                      <td className={`${num} font-medium`}>{v.cost > 0 ? money(v.cost) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-2 py-1.5" colSpan={3}>{t('cost.materialCost')}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{money(totalMaterialCost)}</td>
                </tr>
              </tfoot>
            </table>
            {usesGuidePrices && (
              <p className="mt-1.5 text-[11px] text-chrome-muted">{t('dlg.guidePriceNote')}</p>
            )}
          </section>
        )}

        {/* Hardware costs */}
        {hwRows.length > 0 && (
          <section>
            <h3 className={`${SECTION_LABEL_CLASS} mb-1.5`}>{t('cost.hardwareCost')}</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={TH_CLASS}>{t('hardware.name')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('cost.quantity')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('hardware.unitPrice')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('cost.total')}</th>
                </tr>
              </thead>
              <tbody>
                {hwRows.map(([hwId, v]) => (
                  <tr key={hwId} className="hover:bg-chrome-surface/40">
                    <td className={TD_CLASS}>{v.name}</td>
                    <td className={num}>{v.qty}</td>
                    <td className={num}>{money(v.unitPrice)}</td>
                    <td className={`${num} font-medium`}>{money(v.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-2 py-1.5" colSpan={3}>{t('cost.hardwareCost')}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{money(totalHardwareCost)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {/* Labor & overhead */}
        <section>
          <h3 className={`${SECTION_LABEL_CLASS} mb-2`}>
            {lang === 'de' ? 'Arbeitskosten & Overhead' : 'Labor & Overhead'}
          </h3>
          <div className="grid grid-cols-3 gap-x-5 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="flex-1 text-chrome-secondary">{lang === 'de' ? 'Arbeitsstunden' : 'Labor hours'}</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={laborHours}
                onChange={(e) => setLaborDetails(parseFloat(e.target.value) || 0, laborRate, overheadPct)}
                className={`${FIELD_CLASS} w-16 text-right`}
              />
              <span className="text-chrome-hint">h</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="flex-1 text-chrome-secondary">{lang === 'de' ? 'Stundensatz' : 'Hourly rate'}</span>
              <input
                type="number"
                min="0"
                step="1"
                value={laborRate}
                onChange={(e) => setLaborDetails(laborHours, parseFloat(e.target.value) || 0, overheadPct)}
                className={`${FIELD_CLASS} w-16 text-right`}
              />
              <span className="text-chrome-hint">{cur}/h</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="flex-1 text-chrome-secondary">{lang === 'de' ? 'Aufschlag' : 'Markup'}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(overheadPct * 100)}
                onChange={(e) => setLaborDetails(laborHours, laborRate, (parseFloat(e.target.value) || 0) / 100)}
                className={`${FIELD_CLASS} w-16 text-right`}
              />
              <span className="text-chrome-hint">%</span>
            </label>
          </div>
        </section>

        {/* Breakdown — only when the total is made of more than the material */}
        {breakdown.length > 1 && (
          <section className="rounded border border-chrome-border bg-chrome-deep/60 px-3 py-2 text-xs">
            {breakdown.map((r) => (
              <div key={r.label} className="flex justify-between py-0.5 text-chrome-secondary">
                <span>{r.label}</span>
                <span className="font-mono tabular-nums text-chrome-text">{money(r.value)}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </Dialog>
  )
}
