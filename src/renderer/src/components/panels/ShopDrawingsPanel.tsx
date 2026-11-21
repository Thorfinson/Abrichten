import { useTranslation } from 'react-i18next'
import { activeAssemblies } from '../../utils/activeParts'
import { assemblyPath } from '../../utils/assemblyTree'
import { escapeHtml } from '../../utils/textSafety'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getMaterialById } from '../../data/materials'
import { exportDxf } from '../../utils/dxf'
import { boardFace } from '../../utils/boardFace'
import { printHtml } from '../../utils/printHtml'
import { cuttingDims } from '../../utils/cuttingDims'
import { partLabels } from '../../utils/partLabel'
import { Dialog, Button } from '../ui/Dialog'
import type { TFunction } from 'i18next'
import type { Board, Material, Project } from '../../types/furniture'

const SCALE = 0.25          // 1mm → 0.25px (approx 1:4 for print preview)
const MAX_BOARD_PX = 200    // max rendered board face in px

/** Material name for print; unknown ids fall back to the raw id. Not escaped. */
function materialName(board: Board, lang: 'de' | 'en', customMaterials?: Material[]): string {
  const mat = getMaterialById(board.materialId, customMaterials)
  return mat ? (lang === 'de' ? mat.name : mat.nameEn) : board.materialId
}

/** Shorten text to roughly fit widthPx at fontPx (SVG text does not wrap). Not escaped. */
function fitText(text: string, widthPx: number, fontPx: number): string {
  const max = Math.max(4, Math.floor(widthPx / (fontPx * 0.56)))
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** `label`: the part label ("Herd 2", utils/partLabel), in the title block's right column */
function boardSvg(board: Board, projectName: string, lang: 'de' | 'en', customMaterials?: Material[], label = ''): string {
  // Show the face (boardFace): the two dimensions besides the thickness
  const face = boardFace(board)
  const rawW = face.u
  const rawH = face.v
  const scale = Math.min(SCALE, MAX_BOARD_PX / Math.max(rawW, rawH))
  const w = rawW * scale
  const h = rawH * scale
  const dateStr = new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')
  const scaleN = Math.round(1 / scale)

  // Title block: strip below the drawing, two rows
  const tbY = 10 + h + 28
  const tbH = 44
  // Scale bar: 100mm reference bar
  const sbY = 10 + h + 16
  const sbLen = 100 * scale  // 100mm in px
  const sbX = 30

  const svgW = Math.max(w + 60, 220)
  const svgH = tbY + tbH + 2

  // usable width of the wide title-block column; the texts are cut to it
  const colA = svgW * 0.75 - 8
  const colB = svgW * 0.25 - 8
  // the part label as large as the narrow column allows
  const labelPx = Math.max(5, Math.min(9, colB / (Math.max(1, label.length) * 0.56)))
  const matLine = `${materialName(board, lang, customMaterials)} · t=${face.thickness}mm · ${face.u} × ${face.v} mm`

  // Grain arrow (along the first face axis = horizontal, second = vertical)
  let grainLine = ''
  if (board.grainDirection === face.uAxis) {
    const cx = w / 2, cy = h / 2, len = Math.min(w, h) * 0.3
    grainLine = `<line x1="${cx - len}" y1="${cy}" x2="${cx + len}" y2="${cy}" stroke="#d97706" stroke-width="1.5" marker-end="url(#arrow)"/>`
  } else if (board.grainDirection === face.vAxis) {
    const cx = w / 2, cy = h / 2, len = Math.min(w, h) * 0.3
    grainLine = `<line x1="${cx}" y1="${cy - len}" x2="${cx}" y2="${cy + len}" stroke="#d97706" stroke-width="1.5" marker-end="url(#arrow)"/>`
  }

  // Edge banding marks on the board rect at (30, 10): E1/E2 along the first face
  // axis (top/bottom), E3/E4 along the second (left/right)
  const eb = board.edgeBanding ?? {}
  const edge = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${30 + x1}" y1="${10 + y1}" x2="${30 + x2}" y2="${10 + y2}" stroke="#2563eb" stroke-width="3"/>`
  const edgeLines = [
    eb.e1 ? edge(0, 0, w, 0) : '',
    eb.e2 ? edge(0, h, w, h) : '',
    eb.e3 ? edge(0, 0, 0, h) : '',
    eb.e4 ? edge(w, 0, w, h) : ''
  ].join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="display:block;margin:auto">
  <defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#d97706"/>
    </marker>
  </defs>
  <!-- Board rect -->
  <rect x="30" y="10" width="${w}" height="${h}" fill="#f5f0e8" stroke="#333" stroke-width="0.8"/>
  ${edgeLines}
  <g transform="translate(30,10)">${grainLine}</g>
  <!-- First face dim (top) -->
  <text x="${30 + w / 2}" y="8" font-size="7" text-anchor="middle" fill="#333">${face.u}</text>
  <line x1="30" y1="4" x2="${30 + w}" y2="4" stroke="#333" stroke-width="0.5"/>
  <!-- Second face dim (left) -->
  <text x="14" y="${10 + h / 2}" font-size="7" text-anchor="middle" fill="#333" transform="rotate(-90,14,${10 + h / 2})">${face.v}</text>
  <line x1="26" y1="10" x2="26" y2="${10 + h}" stroke="#333" stroke-width="0.5"/>
  <!-- Scale bar: 100mm reference -->
  <line x1="${sbX}" y1="${sbY}" x2="${sbX + sbLen}" y2="${sbY}" stroke="#666" stroke-width="1"/>
  <line x1="${sbX}" y1="${sbY - 3}" x2="${sbX}" y2="${sbY + 3}" stroke="#666" stroke-width="1"/>
  <line x1="${sbX + sbLen}" y1="${sbY - 3}" x2="${sbX + sbLen}" y2="${sbY + 3}" stroke="#666" stroke-width="1"/>
  <text x="${sbX + sbLen / 2}" y="${sbY - 5}" font-size="6" text-anchor="middle" fill="#666">100 mm</text>
  <text x="${sbX + sbLen + 4}" y="${sbY + 2}" font-size="5" fill="#999">1:${scaleN}</text>
  <!-- Title block: part | rev, then project and material | date -->
  <rect x="0" y="${tbY}" width="${svgW}" height="${tbH}" fill="#f8f8f8" stroke="#333" stroke-width="0.5"/>
  <line x1="0" y1="${tbY + tbH / 2}" x2="${svgW}" y2="${tbY + tbH / 2}" stroke="#ccc" stroke-width="0.4"/>
  <line x1="${svgW * 0.75}" y1="${tbY}" x2="${svgW * 0.75}" y2="${tbY + tbH}" stroke="#ccc" stroke-width="0.4"/>
  <text x="4" y="${tbY + 8}" font-size="6" fill="#666">${lang === 'de' ? 'Bauteil' : 'Part'}</text>
  <text x="4" y="${tbY + 18}" font-size="7.5" font-weight="bold" fill="#1e3a5f">${escapeHtml(fitText(board.name, colA, 7.5))}</text>
  <text x="${svgW * 0.75 + 4}" y="${tbY + 8}" font-size="6" fill="#666">${lang === 'de' ? 'Nr.' : 'No.'}</text>
  <text x="${svgW * 0.75 + 4}" y="${tbY + 18}" font-size="${labelPx.toFixed(1)}" font-weight="bold" fill="#111">${escapeHtml(fitText(label, colB, labelPx))}</text>
  <text x="4" y="${tbY + 30}" font-size="6" fill="#1e3a5f">${escapeHtml(fitText(projectName, colA, 6))}</text>
  <text x="4" y="${tbY + 39}" font-size="6" fill="#666">${escapeHtml(fitText(matLine, colA, 6))}</text>
  <text x="${svgW * 0.75 + 4}" y="${tbY + 30}" font-size="6" fill="#666">${dateStr}</text>
</svg>`
}

/**
 * The printable shop drawings: one drawing per part, then the cutting list
 * (length × width × thickness, utils/cuttingDims). Every user string is escaped;
 * the page needs no scripts or external resources (printHtml, preview iframe).
 */
function shopDrawingsHtml(project: Project, lang: 'de' | 'en', t: TFunction): string {
  const grainText = (b: Board): string => {
    const g = cuttingDims(b).grain
    return g ? t(g === 'along' ? 'dlg.grainAlong' : 'dlg.grainAcross') : ''
  }

  const allBoards: { board: Board; assemblyName: string }[] = activeAssemblies(project).flatMap((a) =>
    a.boards.map((b) => ({ board: b, assemblyName: assemblyPath(project.assemblies, a.id) }))
  )

  const labels = partLabels(project.assemblies)
  const rows = allBoards.map(({ board, assemblyName }) => {
    const svg = boardSvg(board, project.name, lang, project.customMaterials, labels.get(board.id))
    const matName = escapeHtml(materialName(board, lang, project.customMaterials))
    const face = boardFace(board)
    const eb = board.edgeBanding ?? {}
    const edges = [eb.e1 && 'E1', eb.e2 && 'E2', eb.e3 && 'E3', eb.e4 && 'E4'].filter(Boolean).join(' ')
    const grain = grainText(board)
    return `<div style="break-inside:avoid;border:1px solid #ddd;border-radius:4px;padding:12px;margin:8px;display:inline-block;vertical-align:top;width:240px">
  ${svg}
  <div style="font-size:9px;color:#555;margin-top:6px;text-align:center">
    <div><strong>${escapeHtml(assemblyName)}</strong></div>
    <div>${matName} · t=${face.thickness}mm · ${face.u} × ${face.v} mm</div>
    ${edges ? `<div style="color:#2563eb">${lang === 'de' ? 'Kantenband' : 'Edge Banding'}: ${edges}</div>` : ''}
    ${grain ? `<div style="color:#d97706">${escapeHtml(t('cutting.grain'))}: ${escapeHtml(grain)}</div>` : ''}
  </div>
</div>`
  }).join('')

  const head = [t('partLabel.nr'), t('board.name'), t('board.material'), t('dlg.length'), t('dlg.width'), t('dlg.thickness'), t('cutting.grain')]
  const assemblyGroups = activeAssemblies(project).map((a) => {
    const boards = a.boards.map((b) => {
      const d = cuttingDims(b)
      const matName = escapeHtml(materialName(b, lang, project.customMaterials))
      return `<tr><td style="white-space:nowrap;font-weight:bold">${escapeHtml(labels.get(b.id) ?? '')}</td><td>${escapeHtml(b.name)}</td><td>${matName}</td><td class="n">${d.length}</td><td class="n">${d.width}</td><td class="n">${d.thickness}</td><td>${escapeHtml(grainText(b))}</td></tr>`
    }).join('')
    return `<h3>${escapeHtml(assemblyPath(project.assemblies, a.id))}</h3><table><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>${boards}</table>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(project.name)} – ${lang === 'de' ? 'Werkstattzeichnung' : 'Shop Drawings'}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:10px;margin:20px;color:#222;background:#fff}
  h1{font-size:16px;margin-bottom:4px}
  h2{font-size:13px;margin-top:20px;border-bottom:2px solid #333;padding-bottom:4px}
  h3{font-size:11px;margin:12px 0 4px}
  table{border-collapse:collapse;width:100%;margin-bottom:12px}
  th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}
  td.n{text-align:right}
  th{background:#f0f0f0;font-weight:bold}
  @media print{@page{size:A4;margin:15mm}}
</style>
</head>
<body>
<h1>${escapeHtml(project.name)}</h1>
<p style="color:#666;font-size:9px">${new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')}</p>
<h2>${lang === 'de' ? 'Bauteilzeichnungen' : 'Part Drawings'}</h2>
<div>${rows}</div>
<div style="page-break-before:always"></div>
<h2>${lang === 'de' ? 'Zuschnittliste' : 'Cutting List'}</h2>
${assemblyGroups}
</body>
</html>`
}

export function ShopDrawingsPanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const project = useProjectStore((s) => s.project)
  const showShopDrawingsPanel = useUIStore((s) => s.showShopDrawingsPanel)
  const setShowShopDrawingsPanel = useUIStore((s) => s.setShowShopDrawingsPanel)

  if (!showShopDrawingsPanel) return null

  const totalBoards = activeAssemblies(project).reduce((s, a) => s + a.boards.length, 0)
  const html = shopDrawingsHtml(project, lang, t)

  const handleDxf = () => {
    const boards = activeAssemblies(project).flatMap((a) => a.boards)
    const content = exportDxf(boards, partLabels(project.assemblies))
    const filename = `${project.name}_shop_drawings.dxf`
    if ((window as any).electronAPI?.fileExport) {
      ;(window as any).electronAPI.fileExport(content, filename)
    } else {
      const blob = new Blob([content], { type: 'application/dxf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <Dialog
      title={t('shopDrawings.title')}
      titleId="shop-drawings-title"
      onClose={() => setShowShopDrawingsPanel(false)}
      className="h-[85vh] w-[960px]"
      bodyClassName="flex flex-col bg-chrome-deep p-3"
      footer={<>
        <span className="mr-auto text-xs text-chrome-muted">{t('dlg.shopSummary', { count: totalBoards })}</span>
        <Button onClick={handleDxf} disabled={totalBoards === 0}>{lang === 'de' ? 'Als DXF exportieren' : 'Export as DXF'}</Button>
        <Button variant="primary" onClick={() => printHtml(html)} disabled={totalBoards === 0}>{lang === 'de' ? 'PDF drucken' : 'Print PDF'}</Button>
        <Button onClick={() => setShowShopDrawingsPanel(false)}>{t('ui.close')}</Button>
      </>}
    >
      {totalBoards === 0 ? (
        <p className="m-auto text-sm italic text-chrome-hint">{t('cutting.noBoards')}</p>
      ) : (
        // sandbox="" : no scripts, no same-origin access; tabIndex -1 keeps focus
        // (and with it Esc and the focus trap) in the dialog
        <iframe
          title={t('dlg.shopPreview')}
          sandbox=""
          srcDoc={html}
          tabIndex={-1}
          className="min-h-0 w-full flex-1 rounded border border-chrome-border bg-white"
        />
      )}
    </Dialog>
  )
}
