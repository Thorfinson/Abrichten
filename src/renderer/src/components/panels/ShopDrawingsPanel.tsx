import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getMaterialById } from '../../data/materials'
import { exportDxf } from '../../utils/dxf'
import type { Board } from '../../types/furniture'

const SCALE = 0.25          // 1mm → 0.25px (approx 1:4 for print preview)
const MAX_BOARD_PX = 200    // max rendered board face in px

function boardSvg(board: Board, projectName: string, lang: 'de' | 'en'): string {
  const mat = getMaterialById(board.materialId)
  // Show the widest face: width × depth
  const rawW = board.width
  const rawH = board.depth
  const scale = Math.min(SCALE, MAX_BOARD_PX / Math.max(rawW, rawH))
  const w = rawW * scale
  const h = rawH * scale
  const dateStr = new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')
  const scaleN = Math.round(1 / scale)

  // Title block: strip below the drawing, 30px tall
  const tbY = 10 + h + 28
  const tbH = 32
  // Scale bar: 100mm reference bar
  const sbY = 10 + h + 16
  const sbLen = 100 * scale  // 100mm in px
  const sbX = 30

  const svgW = Math.max(w + 60, 220)
  const svgH = h + 80 + tbH

  const matName = mat ? (lang === 'de' ? mat.name : mat.nameEn) : board.materialId

  // Grain arrow
  let grainLine = ''
  if (board.grainDirection === 'width') {
    const cx = w / 2, cy = h / 2, len = Math.min(w, h) * 0.3
    grainLine = `<line x1="${cx - len}" y1="${cy}" x2="${cx + len}" y2="${cy}" stroke="#d97706" stroke-width="1.5" marker-end="url(#arrow)"/>`
  } else if (board.grainDirection === 'depth') {
    const cx = w / 2, cy = h / 2, len = Math.min(w, h) * 0.3
    grainLine = `<line x1="${cx}" y1="${cy - len}" x2="${cx}" y2="${cy + len}" stroke="#d97706" stroke-width="1.5" marker-end="url(#arrow)"/>`
  }

  // Edge banding marks
  const eb = board.edgeBanding ?? {}
  const edgeLines = [
    eb.e1 ? `<line x1="0" y1="0" x2="${w}" y2="0" stroke="#2563eb" stroke-width="3"/>` : '',
    eb.e2 ? `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#2563eb" stroke-width="3"/>` : '',
    eb.e3 ? `<line x1="0" y1="0" x2="0" y2="${h}" stroke="#2563eb" stroke-width="3"/>` : '',
    eb.e4 ? `<line x1="${w}" y1="0" x2="${w}" y2="${h}" stroke="#2563eb" stroke-width="3"/>` : ''
  ].join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="display:block;margin:auto">
  <defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#d97706"/>
    </marker>
  </defs>
  <!-- Board rect -->
  <rect x="30" y="10" width="${w}" height="${h}" fill="#f5f0e8" stroke="#333" stroke-width="0.8"/>
  ${edgeLines.replace(/x1="/g, `x1="${30}`).replace(/x2="/g, `x2="${30}`).replace(/y1="0"/g, `y1="10"`).replace(/y2="0"/g, `y2="10"`).replace(/y2="${h}"/g, `y2="${h + 10}"`).replace(/y1="${h}"/g, `y1="${h + 10}"`)}
  <g transform="translate(30,10)">${grainLine}</g>
  <!-- Width dim (top) -->
  <text x="${30 + w / 2}" y="8" font-size="7" text-anchor="middle" fill="#333">${board.width}</text>
  <line x1="30" y1="4" x2="${30 + w}" y2="4" stroke="#333" stroke-width="0.5"/>
  <!-- Height dim (left) -->
  <text x="14" y="${10 + h / 2}" font-size="7" text-anchor="middle" fill="#333" transform="rotate(-90,14,${10 + h / 2})">${board.depth}</text>
  <line x1="26" y1="10" x2="26" y2="${10 + h}" stroke="#333" stroke-width="0.5"/>
  <!-- Scale bar: 100mm reference -->
  <line x1="${sbX}" y1="${sbY}" x2="${sbX + sbLen}" y2="${sbY}" stroke="#666" stroke-width="1"/>
  <line x1="${sbX}" y1="${sbY - 3}" x2="${sbX}" y2="${sbY + 3}" stroke="#666" stroke-width="1"/>
  <line x1="${sbX + sbLen}" y1="${sbY - 3}" x2="${sbX + sbLen}" y2="${sbY + 3}" stroke="#666" stroke-width="1"/>
  <text x="${sbX + sbLen / 2}" y="${sbY - 5}" font-size="6" text-anchor="middle" fill="#666">100 mm</text>
  <text x="${sbX + sbLen + 4}" y="${sbY + 2}" font-size="5" fill="#999">1:${scaleN}</text>
  <!-- Title block -->
  <rect x="0" y="${tbY}" width="${svgW}" height="${tbH}" fill="#f8f8f8" stroke="#333" stroke-width="0.5"/>
  <line x1="0" y1="${tbY + tbH / 2}" x2="${svgW}" y2="${tbY + tbH / 2}" stroke="#ccc" stroke-width="0.4"/>
  <!-- Row 1: Project | Board name | Date -->
  <text x="4" y="${tbY + 9}" font-size="6" fill="#666">${lang === 'de' ? 'Projekt' : 'Project'}</text>
  <text x="4" y="${tbY + 17}" font-size="7.5" font-weight="bold" fill="#1e3a5f">${projectName}</text>
  <line x1="${svgW * 0.5}" y1="${tbY}" x2="${svgW * 0.5}" y2="${tbY + tbH}" stroke="#ccc" stroke-width="0.4"/>
  <text x="${svgW * 0.5 + 4}" y="${tbY + 9}" font-size="6" fill="#666">${lang === 'de' ? 'Bauteil' : 'Part'}</text>
  <text x="${svgW * 0.5 + 4}" y="${tbY + 17}" font-size="7.5" font-weight="bold" fill="#1e3a5f">${board.name}</text>
  <!-- Row 2: Material | Dimensions | Rev -->
  <text x="4" y="${tbY + tbH - 12}" font-size="6" fill="#666">${matName} · t=${board.depth}mm</text>
  <text x="4" y="${tbY + tbH - 4}" font-size="6" fill="#666">${board.width} × ${board.height} mm</text>
  <line x1="${svgW * 0.75}" y1="${tbY}" x2="${svgW * 0.75}" y2="${tbY + tbH}" stroke="#ccc" stroke-width="0.4"/>
  <text x="${svgW * 0.5 + 4}" y="${tbY + tbH - 12}" font-size="6" fill="#666">${dateStr}</text>
  <text x="${svgW * 0.75 + 4}" y="${tbY + 9}" font-size="6" fill="#666">Rev</text>
  <text x="${svgW * 0.75 + 4}" y="${tbY + 17}" font-size="8" font-weight="bold" fill="#333">1</text>
</svg>`
}

export function ShopDrawingsPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const project = useProjectStore((s) => s.project)
  const showShopDrawingsPanel = useUIStore((s) => s.showShopDrawingsPanel)
  const setShowShopDrawingsPanel = useUIStore((s) => s.setShowShopDrawingsPanel)

  if (!showShopDrawingsPanel) return null

  const handlePrint = () => {
    const allBoards: { board: Board; assemblyName: string }[] = project.assemblies.flatMap((a) =>
      a.boards.map((b) => ({ board: b, assemblyName: a.name }))
    )

    const rows = allBoards.map(({ board, assemblyName }) => {
      const svg = boardSvg(board, project.name, lang)
      const mat = getMaterialById(board.materialId)
      const matName = mat ? (lang === 'de' ? mat.name : mat.nameEn) : board.materialId
      const eb = board.edgeBanding ?? {}
      const edges = [eb.e1 && 'E1', eb.e2 && 'E2', eb.e3 && 'E3', eb.e4 && 'E4'].filter(Boolean).join(' ')
      return `<div style="break-inside:avoid;border:1px solid #ddd;border-radius:4px;padding:12px;margin:8px;display:inline-block;vertical-align:top;width:240px">
  ${svg}
  <div style="font-size:9px;color:#555;margin-top:6px;text-align:center">
    <div><strong>${assemblyName}</strong></div>
    <div>${matName} · t=${board.depth}mm · L=${board.width} × H=${board.height}</div>
    ${edges ? `<div style="color:#2563eb">${lang === 'de' ? 'Kantenband' : 'Edge Banding'}: ${edges}</div>` : ''}
    ${board.grainDirection ? `<div style="color:#d97706">${lang === 'de' ? 'Faser' : 'Grain'}: ${board.grainDirection}</div>` : ''}
  </div>
</div>`
    }).join('')

    const assemblyGroups = project.assemblies.map((a) => {
      const boards = a.boards.map((b) => {
        const mat = getMaterialById(b.materialId)
        const matName = mat ? (lang === 'de' ? mat.name : mat.nameEn) : b.materialId
        return `<tr><td>${b.name}</td><td>${matName}</td><td>${b.width}</td><td>${b.height}</td><td>${b.depth}</td></tr>`
      }).join('')
      return `<h3>${a.name}</h3><table><tr><th>Name</th><th>Material</th><th>B</th><th>H</th><th>T</th></tr>${boards}</table>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${project.name} – ${lang === 'de' ? 'Werkstattzeichnung' : 'Shop Drawings'}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:10px;margin:20px;color:#222}
  h1{font-size:16px;margin-bottom:4px}
  h2{font-size:13px;margin-top:20px;border-bottom:2px solid #333;padding-bottom:4px}
  h3{font-size:11px;margin:12px 0 4px}
  table{border-collapse:collapse;width:100%;margin-bottom:12px}
  th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}
  th{background:#f0f0f0;font-weight:bold}
  @media print{@page{size:A4;margin:15mm}.no-print{display:none}}
</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">
  ${lang === 'de' ? 'Drucken' : 'Print'}
</button>
<h1>${project.name}</h1>
<p style="color:#666;font-size:9px">${new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')}</p>
<h2>${lang === 'de' ? 'Bauteilzeichnungen' : 'Part Drawings'}</h2>
<div>${rows}</div>
<div style="page-break-before:always"></div>
<h2>${lang === 'de' ? 'Zuschnittliste' : 'Cutting List'}</h2>
${assemblyGroups}
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const handleDxf = () => {
    const boards = project.assemblies.flatMap((a) => a.boards)
    const content = exportDxf(boards)
    const filename = `${project.name}_shop_drawings.dxf`
    if ((window as any).electronAPI?.fileExportCsv) {
      ;(window as any).electronAPI.fileExportCsv(content, filename)
    } else {
      const blob = new Blob([content], { type: 'application/dxf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const totalBoards = project.assemblies.reduce((s, a) => s + a.boards.length, 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowShopDrawingsPanel(false) }}>
      <div className="bg-white rounded-lg shadow-xl w-[400px] overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">
            {lang === 'de' ? 'Werkstattzeichnung drucken' : 'Print Shop Drawings'}
          </h2>
          <button onClick={() => setShowShopDrawingsPanel(false)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
        </div>

        <div className="p-5">
          <p className="text-sm text-gray-600 mb-4">
            {lang === 'de'
              ? `Erzeugt eine druckbare HTML-Seite mit ${totalBoards} Bauteilzeichnungen, Maßangaben, Faserrichtung, Kantenbandmarkierung und Zuschnittliste.`
              : `Generates a printable HTML page with ${totalBoards} part drawings, dimensions, grain direction, edge banding marks, and cutting list.`}
          </p>

          {totalBoards === 0 ? (
            <p className="text-xs text-red-500">{t('cutting.noBoards')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { handlePrint(); setShowShopDrawingsPanel(false) }}
                className="w-full py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                {lang === 'de' ? 'Werkstattzeichnung öffnen & drucken' : 'Open & Print Shop Drawings'}
              </button>
              <button
                onClick={() => { handleDxf(); setShowShopDrawingsPanel(false) }}
                className="w-full py-2 bg-teal-600 text-white text-sm rounded hover:bg-teal-700"
              >
                {lang === 'de' ? 'Als DXF exportieren' : 'Export as DXF'}
              </button>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={() => setShowShopDrawingsPanel(false)}
            className="text-sm px-4 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
