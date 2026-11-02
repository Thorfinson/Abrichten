import { csvCell, escapeHtml } from '../../utils/textSafety'
import { activeAssemblies, activeJoints } from '../../utils/activeParts'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getMaterialById } from '../../data/materials'
import { exportDxf } from '../../utils/dxf'
import { assemblyPath } from '../../utils/assemblyTree'
import { edgeBandingLengthMm } from '../../utils/boardFace'
import { cuttingDims, type GrainRelation } from '../../utils/cuttingDims'
import { printHtml } from '../../utils/printHtml'
import { Dialog, Button, FIELD_CLASS, TH_CLASS, TD_CLASS, CHECK_CLASS, SECTION_LABEL_CLASS } from '../ui/Dialog'
import { getCsvDelimiter } from '../layout/SettingsDialog'
import { formatNumber } from '../../utils/units'
import { planBars, DEFAULT_BAR_SETTINGS, type BarSettings } from '../../utils/barCutting'
import { BarCutPlan, barPlanHtml, barPlanCsvRows, type LengthFormat } from './BarCutPlan'
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

type SortCol = 'nr' | 'assemblyName' | 'name' | 'material' | 'length' | 'width' | 'thickness'
type SortDir = 'asc' | 'desc'

interface Row {
  nr: number
  assemblyName: string
  name: string
  materialId: string
  material: string
  /** Longer face side, shorter face side, thickness (utils/cuttingDims) */
  length: number
  width: number
  thickness: number
  grain: GrainRelation | null
  ebLabel: string
  ebMm: number
  qty?: number
}

function SortTh({
  col, label, sortCol, sortDir, onSort, align = 'left', title
}: {
  col: SortCol
  label: string
  sortCol: SortCol
  sortDir: SortDir
  onSort: (col: SortCol) => void
  align?: 'left' | 'right'
  title?: string
}) {
  const active = sortCol === col
  return (
    <th
      className={`${TH_CLASS} cursor-pointer select-none whitespace-nowrap hover:text-chrome-text ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => onSort(col)}
      title={title}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {label}
      <span className={`ml-1 text-[10px] ${active ? 'text-accent' : 'text-chrome-hint'}`}>
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
  const [barSettings, setBarSettings] = useState<BarSettings>(DEFAULT_BAR_SETTINGS)

  const showToast = (msg: string) => {
    setExportToast(msg)
    setTimeout(() => setExportToast(null), 3000)
  }

  const grainLabel = (g: GrainRelation | null): string => (g ? t(g === 'along' ? 'dlg.grainAlong' : 'dlg.grainAcross') : '')

  // Build raw rows: length × width × thickness, the way the part is cut
  const rawRows = useMemo<Row[]>(() => {
    const result: Row[] = []
    let nr = 0
    for (const assembly of activeAssemblies(project)) {
      for (const board of assembly.boards) {
        nr++
        const mat = getMaterialById(board.materialId, project.customMaterials)
        const dims = cuttingDims(board)
        result.push({
          nr,
          assemblyName: assemblyPath(project.assemblies, assembly.id),
          name: board.name,
          materialId: board.materialId,
          material: mat ? (lang === 'de' ? mat.name : mat.nameEn) : board.materialId,
          length: dims.length,
          width: dims.width,
          thickness: dims.thickness,
          grain: dims.grain,
          ebLabel: edgeBandingLabel(board),
          ebMm: edgeBandingLengthMm(board)
        })
      }
    }
    return result
  }, [project.assemblies, project.customMaterials, lang])

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

  // Group identical parts (same material, L × B × D, grain, edge banding)
  const grouped = useMemo<Row[]>(() => {
    if (!groupIdentical) return filtered
    const map = new Map<string, Row & { qty: number }>()
    for (const r of filtered) {
      const key = `${r.materialId}|${r.length}|${r.width}|${r.thickness}|${r.grain}|${r.ebLabel}`
      const prev = map.get(key)
      map.set(key, prev ? { ...prev, qty: prev.qty + 1, ebMm: prev.ebMm + r.ebMm } : { ...r, qty: 1 })
    }
    return Array.from(map.values())
  }, [filtered, groupIdentical])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...grouped]
    arr.sort((a, b) => {
      const va = a[sortCol]
      const vb = b[sortCol]
      if (typeof va === 'string' && typeof vb === 'string') {
        const cmp = va.localeCompare(vb)
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

  // Fastener summary over the joints of visible assemblies (joints may span assemblies)
  const fastenerRows = useMemo(() => {
    const map = new Map<string, { type: string; size: string; qty: number }>()
    for (const { joint: j } of activeJoints(project)) for (const f of j.fasteners) {
      const key = `${f.type}|${f.diameter}|${f.length}`
      const prev = map.get(key)
      map.set(key, { type: f.type, size: `${f.diameter} × ${f.length}`, qty: (prev?.qty ?? 0) + f.quantity })
    }
    return [...map.values()].sort((p, q) => p.type.localeCompare(q.type) || p.size.localeCompare(q.size))
  }, [project.assemblies])

  // Battens, rails, square timber (solid wood bar stock) packed onto stock bars
  const barGroups = useMemo(() => planBars(filtered, barSettings, project.customMaterials), [filtered, barSettings, project.customMaterials])

  // Early return only AFTER every hook: a conditional return above the useMemos
  // changes the hook count between renders and crashes React (#310).
  if (!showCuttingList) return null
  const hiddenCount = project.assemblies.length - activeAssemblies(project).length
  const totalPieces = sorted.reduce((s, r) => s + (r.qty ?? 1), 0)

  // Lengths in the project's display unit (status bar), as plain numbers: the headers name the unit
  const unit = project.displayUnit
  const dim = (mm: number): string => formatNumber(mm, unit, lang)
  const lengthFormat: LengthFormat = {
    fmt: dim, unit, lang,
    materialName: (id) => {
      const m = getMaterialById(id, project.customMaterials)
      return m ? (lang === 'de' ? m.name : m.nameEn) : id
    }
  }
  const dimHeaders = [`${t('dlg.length')} (${unit})`, `${t('dlg.width')} (${unit})`, `${t('dlg.thickness')} (${unit})`]

  const buildCsvRows = (rows: Row[]) => {
    const headers = [
      t('cutting.nr'),
      t('cutting.assembly'),
      t('board.name'),
      t('board.material'),
      ...dimHeaders,
      t('cutting.grain'),
      t('cutting.edgeBanding'),
      ...(groupIdentical ? [t('cutting.qty')] : [])
    ]
    const sep = getCsvDelimiter()
    const csvRows = [headers.map(csvCell).join(sep)]
    let rowNr = 0
    for (const r of rows) {
      rowNr++
      csvRows.push([
        rowNr, r.assemblyName, r.name, r.material,
        dim(r.length), dim(r.width), dim(r.thickness), grainLabel(r.grain), r.ebLabel,
        ...(groupIdentical ? [r.qty ?? 1] : [])
      ].map(csvCell).join(sep))
    }
    if (totalEdgeBandingMm > 0) {
      csvRows.push('')
      csvRows.push([t('cutting.edgeBandingTotal'), '', '', '', '', '', '',
        `${(totalEdgeBandingMm / 1000).toFixed(2)} m`].map(csvCell).join(sep))
    }
    if (fastenerRows.length > 0) {
      csvRows.push('')
      csvRows.push([t('cutting.fasteners'), t('cutting.fastenerSize'), t('cutting.qty')].map(csvCell).join(sep))
      for (const f of fastenerRows) csvRows.push([t(`joints.f_${f.type}`), f.size, f.qty].map(csvCell).join(sep))
    }
    csvRows.push(...barPlanCsvRows(barGroups, barSettings, lengthFormat, t, sep))
    return csvRows.join('\n')
  }

  const handlePrint = () => {
    const colHeaders = [
      '#', t('board.name'), t('cutting.assembly'), t('board.material'), ...dimHeaders,
      t('cutting.grain'), t('cutting.edgeBanding'), ...(groupIdentical ? [t('cutting.qty')] : [])
    ]
    const numeric = new Set([0, 4, 5, 6, 9])   // #, length, width, thickness, quantity: right-aligned
    const rows = sorted.map((r, i) => {
      const cols: (string | number)[] = [i + 1, r.name, r.assemblyName, r.material, dim(r.length), dim(r.width), dim(r.thickness), grainLabel(r.grain), r.ebLabel]
      if (groupIdentical) cols.push(r.qty ?? 1)
      return `<tr>${cols.map((c, ci) => `<td${numeric.has(ci) ? ' class="n"' : ''}>${escapeHtml(String(c))}</td>`).join('')}</tr>`
    })
    const title = t('cutting.title')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(project.name)} - ${escapeHtml(title)}</title>
<style>body{font:12px sans-serif;margin:20px}h1{font-size:14px;margin-bottom:8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
td.n{text-align:right;font-variant-numeric:tabular-nums}th{background:#f0f0f0}h2{font-size:13px;margin:18px 0 4px}h3{font-size:12px;margin:12px 0 4px}small{color:#666}
@media print{@page{size:A4;margin:15mm}}</style></head>
<body><h1>${escapeHtml(project.name)} — ${escapeHtml(title)}</h1>
<table><thead><tr>${colHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.join('')}</tbody></table>
${barPlanHtml(barGroups, barSettings, lengthFormat, t)}
</body></html>`
    printHtml(html)
  }

  const handleExportCSV = () => {
    const csv = buildCsvRows(sorted)
    const filename = `${project.name}${t('cutting.csvSuffix')}.csv`
    try {
      if ((window as any).electronAPI?.fileExport) {
        ;(window as any).electronAPI.fileExport(csv, filename)
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
    const allBoards = activeAssemblies(project).flatMap((a) => a.boards)
    const dxfContent = exportDxf(allBoards)
    const filename = `${project.name}.dxf`
    try {
      if ((window as any).electronAPI?.fileExport) {
        ;(window as any).electronAPI.fileExport(dxfContent, filename)
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

  const empty = sorted.length === 0
  const num = `${TD_CLASS} text-right font-mono tabular-nums`

  return (
    <Dialog
      title={t('cutting.title')}
      titleId="cutting-list-title"
      onClose={() => setShowCuttingList(false)}
      className="w-[1000px]"
      bodyClassName="flex flex-col"
      headerExtra={<>
        {exportToast && (
          <span role="status" className={`rounded px-2 py-0.5 text-xs font-medium ${
            exportToast.startsWith('✓') ? 'bg-success-dim/60 text-success-text' : 'bg-danger-dim/60 text-danger-text'
          }`}>
            {exportToast}
          </span>
        )}
        {hiddenCount > 0 && (
          <span className="rounded bg-accent-dim/60 px-2 py-0.5 text-xs font-medium text-accent-text">
            {t('cutting.hiddenExcluded', { count: hiddenCount })}
          </span>
        )}
      </>}
      footer={<>
        <span className="mr-auto text-xs text-chrome-muted">
          {t('cutting.total')}: <span className="font-mono text-chrome-text">{totalPieces}</span> {t('cutting.pieces')}
          {totalEdgeBandingMm > 0 && <> · <span className="font-mono text-chrome-text">{(totalEdgeBandingMm / 1000).toFixed(2)}</span> {t('cutting.edgeBandingM')}</>}
        </span>
        <Button onClick={handleExportDxf} disabled={empty}>{t('cutting.exportDxf')}</Button>
        <Button onClick={handleExportCSV} disabled={empty}>{t('cutting.export')}</Button>
        <Button variant="primary" onClick={handlePrint} disabled={empty}>{lang === 'de' ? 'PDF drucken' : 'Print PDF'}</Button>
        <Button onClick={() => setShowCuttingList(false)}>{t('ui.close')}</Button>
      </>}
    >
      {/* Filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-chrome-border px-4 py-2">
        <input
          type="text"
          placeholder={lang === 'de' ? 'Name / Gruppe filtern…' : 'Filter by name / assembly…'}
          aria-label={lang === 'de' ? 'Name / Gruppe filtern' : 'Filter by name / assembly'}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className={`${FIELD_CLASS} w-52`}
        />
        <select
          value={filterMaterial}
          onChange={(e) => setFilterMaterial(e.target.value)}
          aria-label={t('board.material')}
          className={FIELD_CLASS}
        >
          <option value="">{lang === 'de' ? 'Alle Materialien' : 'All materials'}</option>
          {uniqueMaterials.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-chrome-secondary">
          <input
            type="checkbox"
            checked={groupIdentical}
            onChange={(e) => setGroupIdentical(e.target.checked)}
            className={CHECK_CLASS}
          />
          {lang === 'de' ? 'Gleiche gruppieren' : 'Group identical'}
        </label>
        <span className="ml-auto text-[11px] text-chrome-hint">{t('dlg.cutHint')}</span>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {empty ? (
          <p className="pt-4 text-sm italic text-chrome-hint">{t('cutting.noBoards')}</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <SortTh col="nr"           label={t('cutting.nr')}       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh col="assemblyName" label={t('cutting.assembly')} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="name"         label={t('board.name')}       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="material"     label={t('board.material')}   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="length"       label={dimHeaders[0]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" title={t('dlg.lengthTitle')} />
                <SortTh col="width"        label={dimHeaders[1]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" title={t('dlg.widthTitle')} />
                <SortTh col="thickness"    label={dimHeaders[2]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" title={t('dlg.thicknessTitle')} />
                <th className={`${TH_CLASS} text-center`} title={t('dlg.grainTitle')}>{t('cutting.grain')}</th>
                <th className={`${TH_CLASS} text-center`}>{t('cutting.edgeBanding')}</th>
                {groupIdentical && <th className={`${TH_CLASS} text-right`}>{t('cutting.qty')}</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} className="hover:bg-chrome-surface/40">
                  <td className={`${num} text-chrome-muted`}>{i + 1}</td>
                  <td className={`${TD_CLASS} text-chrome-secondary`}>{r.assemblyName}</td>
                  <td className={TD_CLASS}>{r.name}</td>
                  <td className={`${TD_CLASS} text-chrome-secondary`}>{r.material}</td>
                  <td className={num}>{dim(r.length)}</td>
                  <td className={num}>{dim(r.width)}</td>
                  <td className={`${num} text-chrome-secondary`}>{dim(r.thickness)}</td>
                  <td className={`${TD_CLASS} text-center`}>
                    {r.grain
                      ? <span className="font-medium text-accent">{grainLabel(r.grain)}</span>
                      : <span className="text-chrome-hint">—</span>}
                  </td>
                  <td className={`${TD_CLASS} text-center font-mono`}>
                    {r.ebLabel
                      ? <span className="text-info">{r.ebLabel}</span>
                      : <span className="text-chrome-hint">—</span>}
                  </td>
                  {groupIdentical && <td className={`${num} font-bold`}>{r.qty ?? 1}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {fastenerRows.length > 0 && (
          <section className="mt-5">
            <h3 className={`${SECTION_LABEL_CLASS} mb-1.5`}>{t('cutting.fasteners')}</h3>
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className={TH_CLASS}>{t('joints.fastener')}</th>
                  <th className={TH_CLASS}>{t('cutting.fastenerSize')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('cutting.qty')}</th>
                </tr>
              </thead>
              <tbody>
                {fastenerRows.map((f) => (
                  <tr key={`${f.type}-${f.size}`}>
                    <td className={TD_CLASS}>{t(`joints.f_${f.type}`)}</td>
                    <td className={`${TD_CLASS} font-mono`}>{f.size}</td>
                    <td className={`${num} font-bold`}>{f.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <BarCutPlan groups={barGroups} settings={barSettings} onSettings={setBarSettings} format={lengthFormat} />
      </div>
    </Dialog>
  )
}
