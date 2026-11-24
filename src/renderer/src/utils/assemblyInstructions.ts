import type { Board, Project } from '../types/furniture'
import { getMaterialById } from '../data/materials'
import { fastenerLines, partLines, type AssemblyPlan, type FastenerLine, type PartLine } from './assemblySteps'
import { roleKey } from './boardRole'
import { joinLabels, partLabels } from './partLabel'
import { escapeHtml } from './textSafety'
import { formatNumber } from './units'

/**
 * The printable assembly instruction (IKEA style): a cover page with the whole
 * model, all parts (with their labels, "Herd 2", utils/partLabel) and all fixings,
 * then one page per step with its picture, its parts and the fixings it needs. Every
 * text is escaped; pictures are accepted only as PNG/JPEG data URLs, so the
 * document needs nothing from outside (utils/printHtml).
 */

export type Translate = (key: string, options?: Record<string, unknown>) => string

export interface InstructionImages {
  /** The finished model */
  overview?: string
  /** One per step: the state after the step, its parts highlighted */
  steps: (string | undefined)[]
}

const SAFE_IMAGE = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/
const SCREW_TYPES = new Set(['wood_screw', 'confirmat', 'pocket_screw'])

/** "Holzschraube Senkkopf 4 × 40", "Holzdübel 8 × 35", "Verleimt" — without count and note. */
export function fastenerLabel(l: FastenerLine, t: Translate, lang: 'de' | 'en'): string {
  if (l.kind === 'joint') return t(`joints.${l.jointType}`)
  const n = (v: number): string => v.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1, useGrouping: false })
  const head = SCREW_TYPES.has(l.type) ? ` ${t(`montage.head_${l.headType}`)}` : ''
  return `${t(`joints.f_${l.type}`)}${head} ${n(l.diameter)} × ${n(l.length)}`
}

/** Builds the whole HTML document for printHtml. */
export function assemblyInstructionHtml(
  project: Project,
  plan: AssemblyPlan,
  images: InstructionImages,
  t: Translate,
  lang: 'de' | 'en'
): string {
  const unit = project.displayUnit
  const e = (v: string | number): string => escapeHtml(String(v))
  const dims = (p: PartLine): string => `${formatNumber(p.length, unit, lang)} × ${formatNumber(p.width, unit, lang)} × ${formatNumber(p.thickness, unit, lang)}`
  const material = (id: string): string => {
    const m = getMaterialById(id, project.customMaterials)
    return m ? (lang === 'de' ? m.name : m.nameEn) : id
  }
  const picture = (src: string | undefined, alt: string): string =>
    src && SAFE_IMAGE.test(src) ? `<img src="${src}" alt="${e(alt)}">` : ''

  // Part labels ("Herd 2", utils/partLabel): the same as in the cutting list and on the parts
  const boardsOf = (list: { board: Board }[]): Board[] => list.map((p) => p.board)
  const allParts = partLines([...plan.steps.flatMap((s) => boardsOf(s.boards)), ...boardsOf(plan.unplanned)])
  const labels = partLabels(project.assemblies)
  const labelOf = (p: PartLine): string => joinLabels(p.boardIds.map((id) => labels.get(id) ?? ''))

  const dimHeader = `${t('dlg.length')} × ${t('dlg.width')} × ${t('dlg.thickness')} (${unit})`
  const partsTable = (lines: PartLine[], full: boolean): string => `<table><thead><tr>
<th>${e(t('montage.nr'))}</th><th class="r">${e(t('cutting.qty'))}</th><th>${e(t('board.name'))}</th><th>${e(dimHeader)}</th>${full ? `<th>${e(t('board.material'))}</th><th>${e(t('role.label'))}</th>` : ''}
</tr></thead><tbody>${lines.map((p) => `<tr><td class="nr">${e(labelOf(p))}</td><td class="r"><b>${p.qty} ×</b></td><td>${e(p.name)}</td><td>${e(dims(p))}</td>${
    full ? `<td>${e(material(p.materialId))}</td><td>${p.role ? e(t(roleKey(p.role))) : ''}</td>` : ''}</tr>`).join('')}</tbody></table>`
  const fastenerList = (lines: FastenerLine[], empty: string): string => lines.length === 0
    ? `<p class="muted">${e(empty)}</p>`
    : `<ul class="fx">${lines.map((l) => `<li><b>${l.qty} ×</b> ${e(fastenerLabel(l, t, lang))}${l.note ? `<span class="note">, ${e(l.note)}</span>` : ''}</li>`).join('')}</ul>`

  const total = plan.steps.length
  const cover = `<section class="cover">
<h1>${e(project.name)}</h1>
<h2>${e(t('montage.instruction'))}</h2>
${picture(images.overview, project.name)}
<h3>${e(t('montage.partsAll'))}</h3>
${partsTable(allParts, true)}
<h3>${e(t('montage.fastenersAll'))}</h3>
${fastenerList(fastenerLines([...plan.steps.flatMap((s) => s.joints), ...plan.unplannedJoints], false), t('montage.noFasteners'))}
${plan.unplanned.length ? `<p class="warn">${e(t('montage.unplannedCount', { count: plan.unplanned.length }))}</p>` : ''}
</section>`

  const steps = plan.steps.map((s, i) => `<section class="step">
<h2><span class="n">${i + 1}</span>${e(s.step.title)}<small>${e(t('montage.stepOf', { n: i + 1, total }))}</small></h2>
${s.step.note ? `<p class="note">${e(s.step.note)}</p>` : ''}
${picture(images.steps[i], s.step.title)}
<div class="cols">
<div><h3>${e(t('montage.parts'))}</h3>${s.boards.length ? partsTable(partLines(boardsOf(s.boards)), false) : `<p class="muted">${e(t('montage.noParts'))}</p>`}</div>
<div><h3>${e(t('montage.fasteners'))}</h3>${fastenerList(fastenerLines(s.joints), t('montage.noFasteners'))}</div>
</div>
</section>`)

  const unplanned = plan.unplanned.length ? `<section class="step">
<h2>${e(t('montage.unplanned'))}</h2>
${partsTable(partLines(boardsOf(plan.unplanned)), false)}
${plan.unplannedJoints.length ? `<h3>${e(t('montage.unplannedJoints', { count: plan.unplannedJoints.length }))}</h3>${fastenerList(fastenerLines(plan.unplannedJoints), '')}` : ''}
</section>` : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${e(project.name)} - ${e(t('montage.instruction'))}</title>
<style>
@page{size:A4;margin:12mm}
body{font:11px/1.4 sans-serif;color:#111;margin:0}
section{break-after:page;page-break-after:always}
section:last-child{break-after:auto;page-break-after:auto}
h1{font-size:22px;margin:0}
h2{font-size:16px;margin:0 0 8px;display:flex;align-items:center;gap:8px}
h2 small{margin-left:auto;font-size:10px;font-weight:normal;color:#666}
h3{font-size:10px;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.06em;color:#555}
.n{display:inline-block;min-width:30px;height:30px;border-radius:50%;background:#111;color:#fff;text-align:center;line-height:30px;font-size:15px}
img{display:block;width:100%;max-height:125mm;object-fit:contain;border:1px solid #ddd;margin:6px 0}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#f0f0f0}
.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.nr{white-space:nowrap;font-weight:bold}
.cols{display:grid;grid-template-columns:3fr 2fr;gap:12px}
ul.fx{list-style:none;padding:0;margin:0}
ul.fx li{padding:3px 0;border-bottom:1px solid #eee}
.note{color:#555}
p.note{background:#fff7e0;border-left:3px solid #f59e0b;padding:4px 8px;color:#111;white-space:pre-line}
.muted{color:#888;font-style:italic}
.warn{color:#b45309;font-weight:bold}
</style></head>
<body>${cover}${steps.join('')}${unplanned}</body></html>`
}
