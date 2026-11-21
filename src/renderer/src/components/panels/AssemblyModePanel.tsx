import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore, topModal } from '../../store/useUIStore'
import { planAssembly, fastenerLines, suggestSteps, type PlacedBoard } from '../../utils/assemblySteps'
import { assemblyInstructionHtml, fastenerLabel, type Translate } from '../../utils/assemblyInstructions'
import { renderAssemblySnapshots } from '../../utils/assemblySnapshots'
import { assemblyPath } from '../../utils/assemblyTree'
import { cuttingDims } from '../../utils/cuttingDims'
import { partLabels } from '../../utils/partLabel'
import { formatNumber } from '../../utils/units'
import { printHtml } from '../../utils/printHtml'
import { keyCombo } from '../../utils/shortcutKeys'

const OPTION_DARK = 'bg-gray-800 text-white'
const BTN = 'text-[10px] font-medium px-2 py-1 rounded bg-white/8 text-white/75 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-35 disabled:pointer-events-none'
const LABEL = 'text-[9px] font-bold text-white/35 uppercase tracking-widest'
const UNPLANNED = '__unplanned'

/** Text field that commits once, on blur or Enter (Esc puts the stored value back): one undo step per edit. */
function CommitField({ value, onCommit, multiline = false, ...rest }: {
  value: string
  onCommit: (v: string) => void
  multiline?: boolean
  placeholder?: string
  className?: string
  'aria-label': string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => { if (draft !== value) onCommit(draft) }
  const props = {
    ...rest,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') { e.preventDefault(); setDraft(value); (e.target as HTMLElement).blur() }
      if (e.key === 'Enter' && !multiline) (e.target as HTMLElement).blur()
    }
  }
  return multiline ? <textarea rows={2} {...props} /> : <input type="text" {...props} />
}

/**
 * Assembly mode (Montage): the 3D view shows one step at a time — earlier steps
 * ghosted, this step highlighted, later parts hidden (views3d/Board3D). The panel
 * plans the steps (order, title, note, which parts), lists the fixings each step
 * needs (derived from the joints) and prints the IKEA-style instruction.
 * ←/→ (and ↑/↓) step through while no field has focus and no dialog is open.
 */
export function AssemblyModePanel() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'de' | 'en'
  const tr = t as unknown as Translate

  const on = useUIStore((s) => s.assemblyMode)
  const stepIndex = useUIStore((s) => s.assemblyStep)
  const setAssemblyMode = useUIStore((s) => s.setAssemblyMode)
  const setAssemblyStep = useUIStore((s) => s.setAssemblyStep)
  const selectedBoardIds = useUIStore((s) => s.selectedBoardIds)
  const selectBoard = useUIStore((s) => s.selectBoard)
  const project = useProjectStore((s) => s.project)
  const store = useProjectStore.getState

  const plan = useMemo(() => planAssembly(project), [project.assemblies, project.assemblySteps])
  const labels = useMemo(() => partLabels(project.assemblies), [project.assemblies])
  const total = plan.steps.length
  const index = Math.min(stepIndex, Math.max(0, total - 1))

  // keep the shown step inside the list (after deleting the last one, loading another project …)
  useEffect(() => { if (on && stepIndex !== index) setAssemblyStep(index) }, [on, stepIndex, index, setAssemblyStep])

  // ←/→ step through; captured before the global shortcuts, which would nudge the selection
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!dir) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (topModal(useUIStore.getState()) || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      e.stopPropagation()
      const ui = useUIStore.getState()
      const count = useProjectStore.getState().project.assemblySteps?.length ?? 0
      if (count) ui.setAssemblyStep(Math.max(0, Math.min(count - 1, ui.assemblyStep + dir)))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [on])

  if (!on) return null

  const unit = project.displayUnit
  const dims = (p: PlacedBoard): string => {
    const d = cuttingDims(p.board)
    return [d.length, d.width, d.thickness].map((v) => formatNumber(v, unit, lang)).join(' × ')
  }
  const current = plan.steps[index]

  const suggest = (): void => {
    const steps = suggestSteps(project, (kind, path) => t(`montage.s_${kind}`, { path }))
    store().setAssemblySteps(steps)
    setAssemblyStep(0)
  }
  const addStep = (): void => {
    store().addAssemblyStep(t('montage.newStep'), total ? index + 1 : 0)
    setAssemblyStep(total ? index + 1 : 0)
  }
  const move = (to: number): void => {
    if (!current) return
    store().moveAssemblyStep(current.step.id, to)
    setAssemblyStep(to)
  }
  const print = (): void => {
    const images = renderAssemblySnapshots(project, plan)
    printHtml(assemblyInstructionHtml(project, plan, images, tr, lang))
  }

  const stepOptions = (
    <>
      {plan.steps.map((s, i) => (
        <option key={s.step.id} value={s.step.id} className={OPTION_DARK}>{`${i + 1} · ${s.step.title}`}</option>
      ))}
      <option value={UNPLANNED} className={OPTION_DARK}>{t('montage.unplan')}</option>
    </>
  )
  const toAdd = current ? selectedBoardIds.filter((id) => !current.step.boardIds.includes(id)) : []
  const fasteners = current ? fastenerLines(current.joints) : []

  return (
    <div
      className="w-80 shrink-0 min-h-0 border-l border-chrome-border bg-chrome-bg text-white flex flex-col"
      onPointerDown={(e) => e.stopPropagation()}
      role="region"
      aria-label={t('montage.modeTitle')}
      data-testid="assembly-panel"
    >
      {/* Header: title, step navigation, close */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/8 shrink-0">
        <span className="text-[11px] font-semibold flex-1">{t('montage.title')}</span>
        {total > 0 && (
          <>
            <button type="button" className={BTN} onClick={() => setAssemblyStep(index - 1)} disabled={index === 0}
              title={t('montage.prev')} aria-label={t('montage.prev')}>‹</button>
            <span className="text-[10px] text-white/70 tabular-nums" data-testid="assembly-step-label">
              {t('montage.stepOf', { n: index + 1, total })}
            </span>
            <button type="button" className={BTN} onClick={() => setAssemblyStep(index + 1)} disabled={index >= total - 1}
              title={t('montage.next')} aria-label={t('montage.next')}>›</button>
          </>
        )}
        <button
          type="button"
          onClick={() => setAssemblyMode(false)}
          className="ml-1 text-white/40 hover:text-white/80 text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
          title={t('montage.close')}
          aria-label={t('montage.close')}
        >×</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
        {!current ? (
          <div className="space-y-2">
            <p className="text-[11px] text-white/60">{t('montage.noSteps')}</p>
            <div className="flex gap-1.5">
              <button type="button" className={`${BTN} bg-action! text-action-text!`} onClick={suggest} title={t('montage.suggestTitle', { shortcut: keyCombo('Z', ['cmd']) })}>
                {t('montage.suggest')}
              </button>
              <button type="button" className={BTN} onClick={addStep}>{t('montage.addStep')}</button>
            </div>
          </div>
        ) : (
          <>
            {/* Title, note, order */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 shrink-0 rounded-full bg-white text-gray-900 text-[11px] font-bold flex items-center justify-center">{index + 1}</span>
                <CommitField
                  key={`t-${current.step.id}`}
                  value={current.step.title}
                  onCommit={(title) => store().updateAssemblyStep(current.step.id, { title })}
                  aria-label={t('montage.stepTitle')}
                  className="flex-1 min-w-0 bg-white/8 border border-white/15 rounded px-1.5 py-1 text-[11px] font-medium outline-none focus:border-action"
                />
              </div>
              <CommitField
                key={`n-${current.step.id}`}
                multiline
                value={current.step.note ?? ''}
                onCommit={(note) => store().updateAssemblyStep(current.step.id, { note })}
                placeholder={t('montage.notePlaceholder')}
                aria-label={t('montage.stepNote')}
                className="w-full resize-y bg-white/8 border border-white/15 rounded px-1.5 py-1 text-[10px] outline-none focus:border-action placeholder:text-white/30"
              />
              <div className="flex flex-wrap gap-1">
                <button type="button" className={BTN} onClick={() => move(index - 1)} disabled={index === 0} title={t('montage.moveEarlier')} aria-label={t('montage.moveEarlier')}>↑</button>
                <button type="button" className={BTN} onClick={() => move(index + 1)} disabled={index >= total - 1} title={t('montage.moveLater')} aria-label={t('montage.moveLater')}>↓</button>
                <button type="button" className={BTN} onClick={addStep} title={t('montage.addStepTitle')}>{t('montage.addStep')}</button>
                <button type="button" className={`${BTN} text-red-300!`} onClick={() => store().removeAssemblyStep(current.step.id)} title={t('montage.removeStepTitle')}>
                  {t('montage.removeStep')}
                </button>
              </div>
            </div>

            {/* Parts of this step */}
            <section>
              <div className="flex items-center justify-between mb-1">
                <h3 className={LABEL}>{t('montage.parts')}</h3>
                {toAdd.length > 0 && (
                  <button type="button" className={BTN} onClick={() => store().assignBoardsToStep(toAdd, current.step.id)}>
                    {t('montage.addSelection', { count: toAdd.length })}
                  </button>
                )}
              </div>
              {current.boards.length === 0 ? (
                <p className="text-[10px] italic text-white/40">{t('montage.noParts')}</p>
              ) : (
                <ul className="space-y-0.5" data-testid="assembly-step-parts">
                  {current.boards.map((p) => (
                    <li key={p.board.id} className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left truncate hover:text-action"
                        onClick={() => selectBoard(p.assemblyId, p.board.id)}
                        title={assemblyPath(project.assemblies, p.assemblyId)}
                      >
                        <span className="font-mono text-white/70">{labels.get(p.board.id)}</span> {p.board.name} <span className="text-white/40 font-mono">{dims(p)}</span>
                      </button>
                      <select
                        value={current.step.id}
                        onChange={(e) => store().assignBoardsToStep([p.board.id], e.target.value === UNPLANNED ? null : e.target.value)}
                        className="w-20 shrink-0 text-[9px] bg-white/8 border border-white/15 text-white rounded px-1 py-0.5 outline-none"
                        aria-label={`${t('montage.moveTo')}: ${p.board.name}`}
                        title={t('montage.moveTo')}
                      >
                        {stepOptions}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Fixings of this step, from its joints */}
            <section>
              <h3 className={`${LABEL} mb-1`}>{t('montage.fasteners')}</h3>
              {fasteners.length === 0 ? (
                <p className="text-[10px] italic text-white/40">{t('montage.noFasteners')}</p>
              ) : (
                <ul className="space-y-0.5 text-[10px]" data-testid="assembly-step-fasteners">
                  {fasteners.map((l, i) => (
                    <li key={i}>
                      <span className="font-mono font-bold tabular-nums">{l.qty} ×</span> {fastenerLabel(l, tr, lang)}
                      {l.note && <span className="text-white/45">, {l.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* Parts in no step */}
        {plan.unplanned.length > 0 && (
          <details className="text-[10px]" data-testid="assembly-unplanned">
            <summary className="cursor-pointer text-amber-300/90 select-none">
              {t('montage.unplannedCount', { count: plan.unplanned.length })}
            </summary>
            {current && (
              <button type="button" className={`${BTN} mt-1`} onClick={() => store().assignBoardsToStep(plan.unplanned.map((p) => p.board.id), current.step.id)}>
                {t('montage.addAllHere')}
              </button>
            )}
            <ul className="mt-1 space-y-0.5">
              {plan.unplanned.map((p) => (
                <li key={p.board.id} className="flex items-center gap-1.5">
                  <span className="flex-1 min-w-0 truncate" title={assemblyPath(project.assemblies, p.assemblyId)}>
                    <span className="font-mono text-white/70">{labels.get(p.board.id)}</span> {p.board.name} <span className="text-white/40 font-mono">{dims(p)}</span>
                  </span>
                  {current && (
                    <button type="button" className={BTN} onClick={() => store().assignBoardsToStep([p.board.id], current.step.id)}>
                      {t('montage.addHere')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Footer: re-suggest, print */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-white/8 shrink-0">
        {total > 0 && (
          <button type="button" className={BTN} onClick={suggest} title={t('montage.suggestTitle', { shortcut: keyCombo('Z', ['cmd']) })}>{t('montage.suggest')}</button>
        )}
        <span className="flex-1 text-[9px] text-white/35">{total > 0 ? t('montage.keysHint') : ''}</span>
        <button
          type="button"
          className={`${BTN} bg-action! text-action-text! hover:brightness-110`}
          onClick={print}
          disabled={total === 0}
          title={t('montage.printTitle')}
        >
          {t('montage.print')}
        </button>
      </div>
    </div>
  )
}
