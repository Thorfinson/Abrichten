import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { useStaticSimulation } from '../../store/useStaticStore'
import { usePartLabels } from '../../hooks/usePartLabels'
import { PartName } from '../ui/PartName'
import { GRAVITY, utilisationCss, type StaticStatus } from '../../services/static-calc'
import { jointAir, type BoardStatic } from '../../services/static-sim'
import { partTitle } from '../../utils/partLabel'
import type { Assembly, Board } from '../../types/furniture'
import { assemblyCounts } from '../../utils/activeParts'

const STATUS_BADGE: Record<StaticStatus, string> = {
  critical: 'bg-danger-dim text-danger-text',
  unsupported: 'bg-ai-dim text-ai-text',
  warning: 'bg-accent-dim text-accent-text',
  ok: 'bg-success-dim text-success-text',
  wallHung: 'bg-chrome-surface text-chrome-muted'
}

const STATUS_ORDER: Record<StaticStatus, number> = { critical: 0, unsupported: 1, warning: 2, ok: 3, wallHung: 4 }

interface SummaryRow {
  board: Board
  assembly: Assembly
  r: BoardStatic
}

/** Static summary: every part's load, utilisation and deflection from the load simulation. */
export function StaticSummaryPanel() {
  const showStaticSummary = useUIStore((s) => s.showStaticSummary)
  return showStaticSummary ? <SummaryDialog /> : null
}

function SummaryDialog() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const labels = usePartLabels()
  const setShowStaticSummary = useUIStore((s) => s.setShowStaticSummary)
  const payloadKg = useUIStore((s) => s.staticLoadKg)
  const sim = useStaticSimulation()
  const [onlyIssues, setOnlyIssues] = useState(false)

  const rows = useMemo<SummaryRow[]>(() => {
    const out: SummaryRow[] = []
    for (const assembly of assemblies) {
      if (!assemblyCounts(assembly)) continue
      for (const board of assembly.boards) {
        const r = sim.results.get(board.id)
        if (r) out.push({ board, assembly, r })
      }
    }
    return out.sort((a, b) => STATUS_ORDER[a.r.status] - STATUS_ORDER[b.r.status] || b.r.uMax - a.r.uMax)
  }, [assemblies, sim])

  // a part named in a note, by its label as everywhere (utils/partLabel)
  const titles = useMemo(() => new Map(assemblies.flatMap((a) => a.boards).map((b) => [b.id, partTitle(labels.get(b.id), b.name)])), [assemblies, labels])
  const mmText = (v: number): string => v.toLocaleString(lang, { maximumFractionDigits: 1 })
  /**
   * Why a support does not count (services/static-sim SupportAir): a joint across air is a
   * mistake (amber: close the gap or enter the hardware that bridges it); air at a contact is
   * no support (grey), the rating already follows from that.
   */
  /** A loop where load was not counted (services/static-sim BoardStatic.unsure): the numbers are unsure. */
  const unsureNotes = (r: BoardStatic) => (r.unsure ?? []).map((u, i) => (
    <div key={`u${i}`} className="text-[10px] font-normal text-amber-400 whitespace-normal" data-testid="static-unsure">
      {u.reason === 'wahl'
        ? t('sim.unsureChoice', { u: Math.round((u.uOther ?? 0) * 100), kg: mmText(Math.abs(u.kg)) })
        : t(u.reason === 'folge' ? 'sim.unsureDownstream' : u.role === 'fehlt' ? 'sim.unsureMissing' : 'sim.unsureLoop',
          { part: titles.get(u.withId) ?? u.withId, kg: mmText(u.kg), count: u.count ?? 1 })}
    </div>
  ))
  const kgText = (N: number): string => (N / GRAVITY).toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const lost = sim.balance.droppedN + sim.balance.stuckN
  const notChecked = rows.filter((row) => row.r.status === 'wallHung').length
  const airNotes = (r: BoardStatic) => {
    const joints = (r.air ?? []).filter((a) => a.kind === 'joint')
    const contacts = new Map<number, string[]>()
    for (const a of r.air ?? []) if (a.kind !== 'joint') contacts.set(a.mm, [...(contacts.get(a.mm) ?? []), titles.get(a.by) ?? a.by])
    if (!joints.length && !contacts.size) return null
    return (
      <>
        {joints.map((a, i) => (
          <div key={`j${i}`} className="text-[10px] font-normal text-amber-400 whitespace-normal" data-testid="static-joint-air">
            {t('sim.jointAir', { type: t(`joints.${a.jointType}`), mm: mmText(a.mm), part: titles.get(a.by) ?? a.by })}
          </div>
        ))}
        {[...contacts].map(([mm, parts]) => (
          <div key={`c${mm}`} className="text-[10px] font-normal text-chrome-muted whitespace-normal" data-testid="static-air">
            {t('sim.airNote', { mm: mmText(mm), parts: parts.join(', ') })}
          </div>
        ))}
      </>
    )
  }

  const close = (): void => setShowStaticSummary(false)
  const select = (row: SummaryRow): void => {
    useUIStore.getState().selectBoard(row.assembly.id, row.board.id)
    close()
  }
  const num = (v: number, digits = 1): string => v.toLocaleString(lang, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  const rated = (r: BoardStatic): boolean => r.status !== 'unsupported' && r.status !== 'wallHung'
  const statusText = (s: StaticStatus): string =>
    s === 'unsupported' ? t('sim.unsupported') : s === 'wallHung' ? t('sim.notChecked') : t(`sim.${s}`)
  // Where it is used most, on the board's face from its min corner: x / z on a lying
  // board (left, back), along / height on a standing one
  const location = (r: BoardStatic): string => {
    const [a, b] = r.field.axes
    return t('sim.location', { a: `${a} ${Math.round(r.maxLocal.a)}`, b: `${b} ${Math.round(r.maxLocal.b)}` })
  }

  // "only problems" shows every state that is not a clean ok: also not checked (hung on a wall) and unsure
  const displayed = onlyIssues ? rows.filter((row) => row.r.status !== 'ok' || jointAir(row.r) !== null || !!row.r.unsure) : rows
  const th = 'px-2 py-1.5 font-medium border-b border-chrome-border'
  const td = 'px-2 py-1 border-b border-chrome-border/60 whitespace-nowrap'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="static-summary-title"
        className="bg-chrome-bg text-chrome-text border border-chrome-border rounded-lg shadow-2xl w-[960px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-chrome-border flex items-center gap-3 shrink-0">
          <h2 id="static-summary-title" className="text-sm font-semibold flex-1">{t('sim.summaryTitle')}</h2>
          <span className="text-xs text-chrome-muted tabular-nums">
            {t('sim.counts', { critical: sim.critical, warning: sim.warning, unsupported: sim.unsupported })}
            {notChecked > 0 && ` · ${t('sim.countNotChecked', { count: notChecked })}`}
            {sim.unsureCount > 0 && ` · ${t('sim.countUnsure', { count: sim.unsureCount })}`}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-chrome-secondary cursor-pointer">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-[var(--color-action)]" />
            {t('sim.onlyIssues')}
          </label>
          <button onClick={close} aria-label={t('sim.close')} title={t('sim.close')} className="text-chrome-muted hover:text-chrome-text text-lg leading-none">×</button>
        </div>

        <div className="px-4 py-2 border-b border-chrome-border text-xs text-chrome-secondary shrink-0">
          {t('sim.payloadNote', { kg: payloadKg })}
        </div>
        {/* self-check of the whole run: where the load ends up (services/static-sim StaticBalance) */}
        <div
          data-testid="static-balance"
          className={`px-4 py-2 border-b border-chrome-border text-xs shrink-0 ${lost > 0.5 * GRAVITY ? 'text-amber-400' : 'text-chrome-secondary'}`}
        >
          {lost > 0.5 * GRAVITY
            ? t('sim.balanceUnsure', { lost: kgText(lost), total: kgText(sim.balance.inN), loop: kgText(sim.balance.droppedN), stuck: kgText(sim.balance.stuckN) })
            : t('sim.balanceOk', { total: kgText(sim.balance.inN) })}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {displayed.length === 0 ? (
            <div className="p-8 text-center text-sm text-chrome-muted">
              {/* no single board stands out, but the balance is unsure: never a plain "no problems" next to it */}
              {onlyIssues ? (lost > 0.5 * GRAVITY ? t('sim.noIssuesButBalance') : t('sim.noIssues')) : t('sim.noBoards')}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-chrome-deep text-chrome-muted">
                <tr>
                  <th className={`${th} text-left`}>{t('sim.colPart')}</th>
                  <th className={`${th} text-left`}>{t('sim.colGroup')}</th>
                  <th className={`${th} text-right`}>{t('sim.colLoad')}</th>
                  <th className={`${th} text-right`}>{t('sim.colSpan')}</th>
                  <th className={`${th} text-right`}>{t('sim.colUtilisation')}</th>
                  <th className={`${th} text-right`}>{t('sim.colLocation')}</th>
                  <th className={`${th} text-right`}>{t('sim.colDeflection')}</th>
                  <th className={`${th} text-right`}>{t('sim.colMinThickness')}</th>
                  <th className={`${th} text-center`}>{t('sim.colRating')}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((row) => {
                  const { r } = row
                  const spans = rated(r) && r.allowableDeflectionMm > 0
                  return (
                    <tr
                      key={row.board.id}
                      tabIndex={0}
                      title={t('sim.selectHint')}
                      onClick={() => select(row)}
                      onKeyDown={(e) => { if (e.key === 'Enter') select(row) }}
                      className="cursor-pointer hover:bg-chrome-hover focus:bg-chrome-hover outline-none"
                    >
                      <td className={`${td} font-medium`}>
                        <PartName label={labels.get(row.board.id)} name={row.board.name} labelClassName="text-chrome-muted font-normal" />
                        {airNotes(r)}
                        {unsureNotes(r)}
                      </td>
                      <td className={`${td} text-chrome-muted`}>{row.assembly.name}</td>
                      <td className={`${td} text-right font-mono`}>{num(r.totalLoadN / GRAVITY)}</td>
                      <td className={`${td} text-right font-mono`}>
                        {spans && r.spanMm > 0 ? `${Math.round(r.spanMm)}${r.cantilever ? ` (${t('sim.cantilever')})` : ''}` : '—'}
                      </td>
                      <td className={`${td} text-right font-mono font-semibold`} style={rated(r) ? { color: utilisationCss(r.uMax) } : undefined}>
                        {rated(r) ? `${Math.round(r.uMax * 100)} %` : '—'}
                      </td>
                      <td className={`${td} text-right font-mono text-chrome-secondary`}>
                        {rated(r) && r.model !== 'none' && r.uMax > 0 ? location(r) : '—'}
                      </td>
                      <td className={`${td} text-right font-mono`}>
                        {spans ? `${num(r.deflectionMm)} / ${num(r.allowableDeflectionMm)}` : '—'}
                      </td>
                      <td className={`${td} text-right font-mono`}>
                        {rated(r) && r.status !== 'ok' && r.minThicknessMm !== null
                          ? <span className="text-danger font-semibold">{r.minThicknessMm}</span>
                          : '—'}
                        <span className="text-chrome-hint"> / {num(r.thicknessMm, 0)}</span>
                      </td>
                      <td className={`${td} text-center`}>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${STATUS_BADGE[r.status]}`}>
                          {statusText(r.status)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-chrome-border flex justify-end shrink-0">
          <button onClick={close} className="h-7 px-4 rounded text-xs bg-action hover:bg-action-hover text-action-text transition-colors">
            {t('sim.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
