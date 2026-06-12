import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getMaterialById, materials } from '../../data/materials'
import { hardwareItems } from '../../data/hardware'

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
  const prices = project.materialPrices ?? {}
  const laborHours   = project.laborHours   ?? 0
  const laborRate    = project.laborRate     ?? 0
  const overheadPct  = project.overheadPct  ?? 0

  // ── Material cost ────────────────────────────────────────────────────────
  const usageMap: Record<string, { name: string; areaSqm: number; cost: number }> = {}
  for (const assembly of project.assemblies) {
    for (const board of assembly.boards) {
      const mat = getMaterialById(board.materialId)
      if (!mat) continue
      const areaSqm = (board.width * board.depth) / 1_000_000
      const pricePerSqm = prices[board.materialId] ?? 0
      const cost = areaSqm * pricePerSqm
      if (!usageMap[board.materialId]) {
        usageMap[board.materialId] = { name: lang === 'de' ? mat.name : mat.nameEn, areaSqm: 0, cost: 0 }
      }
      usageMap[board.materialId].areaSqm += areaSqm
      usageMap[board.materialId].cost += cost
    }
  }
  const matRows = Object.entries(usageMap)
  const totalMaterialCost = matRows.reduce((s, [, v]) => s + v.cost, 0)

  // ── Hardware cost ────────────────────────────────────────────────────────
  const hwMap: Record<string, { name: string; qty: number; unitPrice: number; total: number }> = {}
  for (const assembly of project.assemblies) {
    for (const board of assembly.boards) {
      for (const attached of board.hardware ?? []) {
        const hw = hardwareItems.find((h) => h.id === attached.hardwareId)
        if (!hw) continue
        if (!hwMap[hw.id]) {
          hwMap[hw.id] = { name: lang === 'de' ? hw.name : hw.nameEn, qty: 0, unitPrice: hw.unitPrice, total: 0 }
        }
        hwMap[hw.id].qty += attached.quantity
        hwMap[hw.id].total += attached.quantity * hw.unitPrice
      }
    }
  }
  const hwRows = Object.entries(hwMap)
  const totalHardwareCost = hwRows.reduce((s, [, v]) => s + v.total, 0)

  // ── Labor & overhead ─────────────────────────────────────────────────────
  const laborSubtotal = laborHours * laborRate
  const baseForOverhead = totalMaterialCost + totalHardwareCost + laborSubtotal
  const overheadAmount = baseForOverhead * overheadPct
  const grandTotal = baseForOverhead + overheadAmount

  const hasData = matRows.length > 0 || hwRows.length > 0

  const handlePrint = () => {
    const matSection = matRows.map(([, v]) =>
      `<tr><td>${lang === 'de' ? 'Material' : 'Material'}</td><td>${v.name}</td><td>${formatArea(v.areaSqm, lang)} m²</td><td>${cur}${formatCurrency(v.cost, lang)}</td></tr>`
    ).join('')
    const hwSection = hwRows.map(([, v]) =>
      `<tr><td>${lang === 'de' ? 'Beschlag' : 'Hardware'}</td><td>${v.name}</td><td>${v.qty}</td><td>${cur}${formatCurrency(v.total, lang)}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${project.name} - ${lang === 'de' ? 'Kosten' : 'Cost'}</title>
<style>body{font:12px sans-serif;margin:20px}h1{font-size:14px;margin-bottom:4px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
th{background:#f0f0f0}tfoot td{font-weight:bold;background:#e8f0fe}
@media print{@page{size:A4;margin:15mm}}</style></head>
<body><h1>${project.name} — ${lang === 'de' ? 'Kostenkalkulation' : 'Cost Summary'}</h1>
<table><thead><tr>
<th>${lang === 'de' ? 'Typ' : 'Type'}</th>
<th>${lang === 'de' ? 'Name' : 'Name'}</th>
<th>${lang === 'de' ? 'Menge' : 'Quantity'}</th>
<th>${lang === 'de' ? 'Kosten' : 'Cost'}</th>
</tr></thead><tbody>${matSection}${hwSection}</tbody>
<tfoot><tr><td colspan="3">${lang === 'de' ? 'Gesamt' : 'Total'}</td><td>${cur}${formatCurrency(grandTotal, lang)}</td></tr></tfoot>
</table><script>window.onload=function(){window.print()}</script></body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const handleExportCsv = () => {
    const rows: string[] = []
    rows.push(lang === 'de' ? 'Typ;Name;Menge;Einheitspreis;Gesamt' : 'Type;Name;Quantity;Unit Price;Total')
    for (const [matId, v] of matRows) {
      const pricePerSqm = prices[matId] ?? 0
      rows.push(`${lang === 'de' ? 'Material' : 'Material'};${v.name};${formatArea(v.areaSqm, lang)} m²;${cur}${formatCurrency(pricePerSqm, lang)};${cur}${formatCurrency(v.cost, lang)}`)
    }
    for (const [, v] of hwRows) {
      rows.push(`${lang === 'de' ? 'Beschlag' : 'Hardware'};${v.name};${v.qty};${cur}${formatCurrency(v.unitPrice, lang)};${cur}${formatCurrency(v.total, lang)}`)
    }
    if (laborSubtotal > 0) {
      rows.push(`${lang === 'de' ? 'Arbeit' : 'Labor'};${laborHours}h × ${cur}${formatCurrency(laborRate, lang)};;;${cur}${formatCurrency(laborSubtotal, lang)}`)
    }
    if (overheadAmount > 0) {
      rows.push(`${lang === 'de' ? 'Overhead' : 'Overhead'};${(overheadPct * 100).toFixed(0)}%;;;${cur}${formatCurrency(overheadAmount, lang)}`)
    }
    rows.push(`;;;;${cur}${formatCurrency(grandTotal, lang)}`)
    const csv = rows.join('\n')
    const filename = `${project.name}_cost.csv`
    if ((window as any).electronAPI?.fileSave) {
      ;(window as any).electronAPI.fileSave(csv, filename)
    } else {
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCostPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[640px] max-h-[88vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-800">{t('cost.title')}</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingPrices((v) => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {editingPrices ? '✓ ' + t('actions.apply') : t('cost.editPrices')}
            </button>
            <button onClick={() => setShowCostPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Price editor */}
          {editingPrices && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-xs text-blue-700 font-medium mb-2">
                {t('cost.pricePerSqm')} ({cur})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {materials.map((mat) => (
                  <div key={mat.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 flex-1 truncate">
                      {lang === 'de' ? mat.name : mat.nameEn}
                    </span>
                    <input
                      type="number"
                      defaultValue={prices[mat.id] ?? 0}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v)) setMaterialPrice(mat.id, v)
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="w-20 text-xs text-right border border-gray-300 rounded px-1 py-0.5"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Material costs */}
          {matRows.length === 0 ? (
            <p className="text-xs text-gray-400 italic">{t('cutting.noBoards')}</p>
          ) : (
            <section>
              <h3 className="text-xs font-bold text-gray-600 uppercase mb-1">{t('cost.materialCost')}</h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-200 px-2 py-1 text-left">{t('board.material')}</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('cost.area')} (m²)</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('cost.pricePerSqm')}</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('cost.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {matRows.map(([matId, v]) => (
                    <tr key={matId} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-2 py-1">{v.name}</td>
                      <td className="border border-gray-200 px-2 py-1 text-right font-mono">{formatArea(v.areaSqm, lang)}</td>
                      <td className="border border-gray-200 px-2 py-1 text-right">
                        {prices[matId]
                          ? `${cur}${formatCurrency(prices[matId], lang)}`
                          : <span className="text-gray-400 italic">{t('cost.noPrice')}</span>}
                      </td>
                      <td className="border border-gray-200 px-2 py-1 text-right font-medium font-mono">
                        {v.cost > 0 ? `${cur}${formatCurrency(v.cost, lang)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td className="border border-gray-200 px-2 py-1" colSpan={3}>{t('cost.materialCost')}</td>
                    <td className="border border-gray-200 px-2 py-1 text-right text-green-700 font-mono">
                      {cur}{formatCurrency(totalMaterialCost, lang)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {/* Hardware costs */}
          {hwRows.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-600 uppercase mb-1">{t('cost.hardwareCost')}</h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-200 px-2 py-1 text-left">{t('hardware.name')}</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('cost.quantity')}</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('hardware.unitPrice')}</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">{t('cost.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {hwRows.map(([hwId, v]) => (
                    <tr key={hwId} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-2 py-1">{v.name}</td>
                      <td className="border border-gray-200 px-2 py-1 text-right font-mono">{v.qty}</td>
                      <td className="border border-gray-200 px-2 py-1 text-right font-mono">
                        {cur}{formatCurrency(v.unitPrice, lang)}
                      </td>
                      <td className="border border-gray-200 px-2 py-1 text-right font-medium font-mono">
                        {cur}{formatCurrency(v.total, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td className="border border-gray-200 px-2 py-1" colSpan={3}>{t('cost.hardwareCost')}</td>
                    <td className="border border-gray-200 px-2 py-1 text-right text-orange-700 font-mono">
                      {cur}{formatCurrency(totalHardwareCost, lang)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {/* Labor & overhead */}
          <section>
            <h3 className="text-xs font-bold text-gray-600 uppercase mb-2">
              {lang === 'de' ? 'Arbeitskosten & Overhead' : 'Labor & Overhead'}
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <label className="flex items-center gap-2">
                <span className="text-gray-600 flex-1">{lang === 'de' ? 'Arbeitsstunden' : 'Labor hours'}</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={laborHours}
                  onChange={(e) => setLaborDetails(parseFloat(e.target.value) || 0, laborRate, overheadPct)}
                  className="w-16 text-right border border-gray-300 rounded px-1 py-0.5 text-xs"
                />
                <span className="text-gray-400">h</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-gray-600 flex-1">{lang === 'de' ? 'Stundensatz' : 'Hourly rate'}</span>
                <span className="text-gray-400">{cur}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={laborRate}
                  onChange={(e) => setLaborDetails(laborHours, parseFloat(e.target.value) || 0, overheadPct)}
                  className="w-16 text-right border border-gray-300 rounded px-1 py-0.5 text-xs"
                />
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <span className="text-gray-600 flex-1">{lang === 'de' ? 'Overhead-Aufschlag' : 'Overhead markup'}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(overheadPct * 100)}
                  onChange={(e) => setLaborDetails(laborHours, laborRate, (parseFloat(e.target.value) || 0) / 100)}
                  className="w-16 text-right border border-gray-300 rounded px-1 py-0.5 text-xs"
                />
                <span className="text-gray-400">%</span>
              </label>
            </div>
            {(laborSubtotal > 0 || overheadAmount > 0) && (
              <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                {laborSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span>{lang === 'de' ? 'Arbeit' : 'Labor'}</span>
                    <span className="font-mono">{cur}{formatCurrency(laborSubtotal, lang)}</span>
                  </div>
                )}
                {overheadAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Overhead ({(overheadPct * 100).toFixed(0)}%)</span>
                    <span className="font-mono">{cur}{formatCurrency(overheadAmount, lang)}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Sticky grand total footer */}
        <div className="border-t border-gray-300 bg-blue-50 shrink-0">
          {hasData && (
            <div className="px-4 py-2 flex items-center gap-4 text-xs text-gray-600 border-b border-gray-200">
              <span className="flex-1">{lang === 'de' ? 'Material' : 'Material'}: {cur}{formatCurrency(totalMaterialCost, lang)}</span>
              {totalHardwareCost > 0 && <span>{lang === 'de' ? 'Beschläge' : 'Hardware'}: {cur}{formatCurrency(totalHardwareCost, lang)}</span>}
              {laborSubtotal > 0 && <span>{lang === 'de' ? 'Arbeit' : 'Labor'}: {cur}{formatCurrency(laborSubtotal, lang)}</span>}
            </div>
          )}
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-blue-900">{t('cost.totalCost')}</span>
            <span className="text-xl font-bold text-blue-700 font-mono">
              {cur}{formatCurrency(grandTotal, lang)}
            </span>
          </div>
          <div className="px-4 pb-3 flex justify-end gap-2">
            {hasData && (
              <>
                <button
                  onClick={handlePrint}
                  className="text-xs px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700"
                >
                  {lang === 'de' ? 'PDF drucken' : 'Print PDF'}
                </button>
                <button
                  onClick={handleExportCsv}
                  className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700"
                >
                  {t('actions.export')} CSV
                </button>
              </>
            )}
            <button
              onClick={() => setShowCostPanel(false)}
              className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
