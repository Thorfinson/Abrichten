import { csvCell, escapeHtml } from '../../utils/textSafety'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getMaterialById, materials } from '../../data/materials'
import { exportDxf } from '../../utils/dxf'
import type { Board } from '../../types/furniture'

function edgeBandingLabel(board: Board): string {
  const eb = board.edgeBanding
  if (!eb) return ''
  const parts: string[] = []
  if (eb.e1) parts.push('E1')
  if (eb.e2) parts.push('E2')
  if (eb.e3) parts.push('E3')
  if (eb.e4) parts.push('E4')
  return parts.join('+')
}

function edgeBandingLengthMm(board: Board): number {
  const eb = board.edgeBanding
  if (!eb) return 0
  let total = 0
  if (eb.e1) total += board.width
  if (eb.e2) total += board.width
  if (eb.e3) total += board.depth
  if (eb.e4) total += board.depth
  return total
}

type SortCol = 'nr' | 'assemblyName' | 'name' | 'material' | 'width' | 'height' | 'depth'
type SortDir = 'asc' | 'desc'

interface Row {
  nr: number
  assemblyName: string
  name: string
  materialId: string
  material: string
  width: number
  height: number
  depth: number
  grain: string
  ebLabel: string
  ebMm: number
  qty?: number
  board: Board
}

function SortTh({
  col, label, sortCol, sortDir, onSort
}: {
  col: SortCol
  label: string
  sortCol: SortCol
  sortDir: SortDir
  onSort: (col: SortCol) => void
}) {
  const active = sortCol === col
  return (
    <th
      className="border border-gray-300 px-2 py-1 text-left cursor-pointer select-none hover:bg-gray-200 whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}
      <span className="ml-1 text-gray-400 text-[10px]">
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  )
}

export function CuttingList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const project = useProjectStore((s) => s.project)
  const showCuttingList = useUIStore((s) => s.showCuttingList)
  const setShowCuttingList = useUIStore((s) => s.setShowCuttingList)

  const [sortCol, setSortCol] = useState<SortCol>('nr')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterText, setFilterText] = useState('')
  const [filterMaterial, setFilterMaterial] = useState('')
  const [groupIdentical, setGroupIdentical] = useState(false)
  const [exportToast, setExportToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setExportToast(msg)
    setTimeout(() => setExportToast(null), 3000)
  }

  // Build raw rows
  const rawRows = useMemo<Row[]>(() => {
    const result: Row[] = []
    let nr = 0
    for (const assembly of project.assemblies) {
      for (const board of assembly.boards) {
        nr++
        const mat = getMaterialById(board.materialId)
        result.push({
          nr,
          assemblyName: assembly.name,
          name: board.name,
          materialId: board.materialId,
          material: mat ? (lang === 'de' ? mat.name : mat.nameEn) : board.materialId,
          width: board.width,
          height: board.height,
          depth: board.depth,
          grain: board.grainDirection
            ? t(`board.grain${board.grainDirection.charAt(0).toUpperCase() + board.grainDirection.slice(1)}`)
            : '',
          ebLabel: edgeBandingLabel(board),
          ebMm: edgeBandingLengthMm(board),
          board
        })
      }
    }
    return result
  }, [project.assemblies, lang, t])

  // Apply text + material filters
  const filtered = useMemo(() => {
    let rows = rawRows
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase()
      rows = rows.filter((r) =>
        r.name.toLowerCase().includes(q) || r.assemblyName.toLowerCase().includes(q)
      )
    }
    if (filterMaterial) {
      rows = rows.filter((r) => r.materialId === filterMaterial)
    }
    return rows
  }, [rawRows, filterText, filterMaterial])

  // Group identical boards (same material, W, H, D, grain, edge banding)
  const grouped = useMemo<Row[]>(() => {
    if (!groupIdentical) return filtered
    const map = new Map<string, Row & { qty: number }>()
    for (const r of filtered) {
      const key = `${r.materialId}|${r.width}|${r.height}|${r.depth}|${r.grain}|${r.ebLabel}`
      if (map.has(key)) {
        map.get(key)!.qty++
        map.get(key)!.ebMm += r.ebMm
      } else {
        map.set(key, { ...r, qty: 1 })
      }
    }
    return Array.from(map.values())
  }, [filtered, groupIdentical])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...grouped]
    arr.sort((a, b) => {
      let va: string | number = a[sortCol] ?? 0
      let vb: string | number = b[sortCol] ?? 0
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb as string)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
    return arr
  }, [grouped, sortCol, sortDir])

  const totalEdgeBandingMm = sorted.reduce((sum, r) => sum + r.ebMm, 0)

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // Unique materials for filter dropdown
  const uniqueMaterials = useMemo(() => {
    const seen = new Set<string>()
    const result: { id: string; label: string }[] = []
    for (const r of rawRows) {
      if (!seen.has(r.materialId)) {
        seen.add(r.materialId)
        result.push({ id: r.materialId, label: r.material })
      }
    }
    return result
  }, [rawRows])

  // Fastener summary over all joints (joints may span assemblies)
  const fastenerRows = useMemo(() => {
    const map = new Map<string, { type: string; size: string; qty: number }>()
    for (const a of project.assemblies) for (const j of a.joints) for (const f of j.fasteners) {
      const key = `${f.type}|${f.diameter}|${f.length}`
      const prev = map.get(key)
      map.set(key, { type: f.type, size: `${f.diameter} × ${f.length}`, qty: (prev?.qty ?? 0) + f.quantity })
    }
    return [...map.values()].sort((p, q) => p.type.localeCompare(q.type) || p.size.localeCompare(q.size))
  }, [project.assemblies])

  // Early return only AFTER every hook: a conditional return above the useMemos
  // changes the hook count between renders and crashes React (#310).
  if (!showCuttingList) return null

  const buildCsvRows = (rows: Row[]) => {
    const headers = [
      t('cutting.nr'),
      t('cutting.assembly'),
      t('board.name'),
      t('board.material'),
      `${t('board.width')} (mm)`,
      `${t('board.height')} (mm)`,
      `${t('board.depth')} (mm)`,
      t('cutting.grain'),
      t('cutting.edgeBanding'),
      ...(groupIdentical ? ['Qty'] : [])
    ]
    const csvRows = [headers.map(csvCell).join(';')]
    let rowNr = 0
    for (const r of rows) {
      rowNr++
      csvRows.push([
        rowNr, r.assemblyName, r.name, r.material,
        r.width, r.height, r.depth, r.grain, r.ebLabel,
        ...(groupIdentical ? [r.qty ?? 1] : [])
      ].map(csvCell).join(';'))
    }
    if (totalEdgeBandingMm > 0) {
      csvRows.push('')
      csvRows.push([t('cutting.edgeBandingTotal'), '', '', '', '', '', '',
        `${(totalEdgeBandingMm / 1000).toFixed(2)} m`].map(csvCell).join(';'))
    }
    if (fastenerRows.length > 0) {
      csvRows.push('')
      csvRows.push([t('cutting.fasteners'), t('cutting.fastenerSize'), t('cutting.qty')].map(csvCell).join(';'))
      for (const f of fastenerRows) csvRows.push([t(`joints.f_${f.type}`), f.size, f.qty].map(csvCell).join(';'))
    }
    return csvRows.join('\n')
  }

  const handlePrint = () => {
    const colHeaders = groupIdentical
      ? (lang === 'de' ? ['#', 'Name', 'Baugruppe', 'Material', 'B (mm)', 'H (mm)', 'T (mm)', 'Anz.'] : ['#', 'Name', 'Assembly', 'Material', 'W (mm)', 'H (mm)', 'D (mm)', 'Qty'])
      : (lang === 'de' ? ['#', 'Name', 'Baugruppe', 'Material', 'B (mm)', 'H (mm)', 'T (mm)'] : ['#', 'Name', 'Assembly', 'Material', 'W (mm)', 'H (mm)', 'D (mm)'])
    const rows = sorted.map((r, i) => {
      const cols = [i + 1, r.name, r.assemblyName, r.material, r.width, r.height, r.depth]
      if (groupIdentical) cols.push((r as any).qty ?? 1)
      return `<tr>${cols.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`
    })
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(project.name)} - ${lang === 'de' ? 'Zuschnittliste' : 'Cutting List'}</title>
<style>body{font:12px sans-serif;margin:20px}h1{font-size:14px;margin-bottom:8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
th{background:#f0f0f0}@media print{@page{size:A4;margin:15mm}}</style></head>
<body><h1>${escapeHtml(project.name)} — ${lang === 'de' ? 'Zuschnittliste' : 'Cutting List'}</h1>
<table><thead><tr>${colHeaders.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.join('')}</tbody></table>
<script>window.onload=function(){window.print()}</script></body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const handleExportCSV = () => {
    const csv = buildCsvRows(sorted)
    const filename = `${project.name}${t('cutting.csvSuffix')}.csv`
    try {
      if ((window as any).electronAPI?.fileExportCsv) {
        ;(window as any).electronAPI.fileExportCsv(csv, filename)
      } else {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      }
      showToast(`✓ ${lang === 'de' ? 'Exportiert' : 'Exported'}: ${filename}`)
    } catch {
      showToast(`⚠ ${lang === 'de' ? 'Export fehlgeschlagen' : 'Export failed'}`)
    }
  }

  const handleExportDxf = () => {
    const allBoards = project.assemblies.flatMap((a) => a.boards)
    const dxfContent = exportDxf(allBoards)
    const filename = `${project.name}.dxf`
    try {
      if ((window as any).electronAPI?.fileExportText) {
        ;(window as any).electronAPI.fileExportText(dxfContent, filename)
      } else {
        const blob = new Blob([dxfContent], { type: 'application/dxf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      }
      showToast(`✓ ${lang === 'de' ? 'Exportiert' : 'Exported'}: ${filename}`)
    } catch {
      showToast(`⚠ ${lang === 'de' ? 'Export fehlgeschlagen' : 'Export failed'}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCuttingList(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[960px] max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center gap-3 shrink-0 flex-wrap">
          <h2 className="text-base font-bold flex-1">{t('cutting.title')}</h2>

          {/* Export toast */}
          {exportToast && (
            <span className={`text-xs font-medium px-2 py-1 rounded ${
              exportToast.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {exportToast}
            </span>
          )}

          {/* Filters */}
          <input
            type="text"
            placeholder={lang === 'de' ? 'Name / Gruppe filtern…' : 'Filter by name / assembly…'}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 w-44 outline-none focus:border-blue-400"
          />
          <select
            value={filterMaterial}
            onChange={(e) => setFilterMaterial(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-400"
          >
            <option value="">{lang === 'de' ? 'Alle Materialien' : 'All materials'}</option>
            {uniqueMaterials.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={groupIdentical}
              onChange={(e) => setGroupIdentical(e.target.checked)}
              className="rounded"
            />
            {lang === 'de' ? 'Gleiche gruppieren' : 'Group identical'}
          </label>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{t('cutting.noBoards')}</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <SortTh col="nr"           label={t('cutting.nr')}       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="assemblyName" label={t('cutting.assembly')} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="name"         label={t('board.name')}       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="material"     label={t('board.material')}   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="width"        label={`${t('board.width')} (mm)`}  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="height"       label={`${t('board.height')} (mm)`} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="depth"        label={`${t('board.depth')} (mm)`}  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th className="border border-gray-300 px-2 py-1 text-center">{t('cutting.grain')}</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">{t('cutting.edgeBanding')}</th>
                  {groupIdentical && (
                    <th className="border border-gray-300 px-2 py-1 text-center">
                      {lang === 'de' ? 'Anz.' : 'Qty'}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i} className="hover:bg-blue-50">
                    <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                    <td className="border border-gray-300 px-2 py-1">{r.assemblyName}</td>
                    <td className="border border-gray-300 px-2 py-1">{r.name}</td>
                    <td className="border border-gray-300 px-2 py-1">{r.material}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right font-mono">{r.width}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right font-mono">{r.height}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right font-mono">{r.depth}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">
                      {r.grain
                        ? <span className="text-amber-600 font-medium">{r.grain}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-center">
                      {r.ebLabel
                        ? <span className="text-blue-600">{r.ebLabel}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    {groupIdentical && (
                      <td className="border border-gray-300 px-2 py-1 text-center font-mono font-bold">
                        {r.qty ?? 1}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 px-2 py-1" colSpan={4}>
                    {t('cutting.total')}: {sorted.length} {t('cutting.pieces')}
                    {groupIdentical && sorted.reduce((s, r) => s + (r.qty ?? 1), 0) !== sorted.length && (
                      <span className="font-normal text-gray-500 ml-1">
                        ({sorted.reduce((s, r) => s + (r.qty ?? 1), 0)} {lang === 'de' ? 'Stk.' : 'pcs'} total)
                      </span>
                    )}
                  </td>
                  <td className="border border-gray-300 px-2 py-1" colSpan={3} />
                  <td className="border border-gray-300 px-2 py-1" />
                  <td className="border border-gray-300 px-2 py-1 text-center text-blue-700">
                    {totalEdgeBandingMm > 0 && `${(totalEdgeBandingMm / 1000).toFixed(2)} ${t('cutting.edgeBandingM')}`}
                  </td>
                  {groupIdentical && <td className="border border-gray-300 px-2 py-1" />}
                </tr>
              </tfoot>
            </table>
          )}
          {fastenerRows.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold text-gray-600 mb-1">{t('cutting.fasteners')}</h3>
              <table className="text-xs border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-2 py-1 text-left">{t('joints.fastener')}</th>
                    <th className="border border-gray-300 px-2 py-1 text-left">{t('cutting.fastenerSize')}</th>
                    <th className="border border-gray-300 px-2 py-1 text-right">{t('cutting.qty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fastenerRows.map((f) => (
                    <tr key={`${f.type}-${f.size}`}>
                      <td className="border border-gray-300 px-2 py-1">{t(`joints.f_${f.type}`)}</td>
                      <td className="border border-gray-300 px-2 py-1 font-mono">{f.size}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right font-mono font-bold">{f.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 shrink-0">
          <button
            onClick={handlePrint}
            disabled={sorted.length === 0}
            className="text-sm px-4 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {lang === 'de' ? 'PDF drucken' : 'Print PDF'}
          </button>
          <button
            onClick={handleExportDxf}
            disabled={sorted.length === 0}
            className="text-sm px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('cutting.exportDxf')}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={sorted.length === 0}
            className="text-sm px-4 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {t('cutting.export')}
          </button>
          <button
            onClick={() => setShowCuttingList(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
