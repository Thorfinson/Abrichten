import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { planAssembly } from '../../utils/assemblySteps'

/*
 * The frame of the assembly workspace around the step panel (AssemblyModePanel):
 * an amber band under the toolbar that says which step is shown, the list of all
 * steps in the left column, and a step timeline at the bottom of the canvas.
 */

function usePlan() {
  const project = useProjectStore((s) => s.project)
  return useMemo(() => planAssembly(project), [project.assemblies, project.assemblySteps])
}

/** Amber band under the toolbar: the assembly workspace is on, which step is shown, how to leave */
export function AssemblyBand() {
  const { t } = useTranslation()
  const on = useUIStore((s) => s.workspace === 'assembly')
  const stepIndex = useUIStore((s) => s.assemblyStep)
  const setWorkspace = useUIStore((s) => s.setWorkspace)
  const plan = usePlan()
  if (!on) return null
  const total = plan.steps.length
  const index = Math.min(stepIndex, Math.max(0, total - 1))
  return (
    <div
      className="h-8 shrink-0 flex items-center gap-3 px-3 bg-ws-assembly text-ws-assembly-text text-xs"
      role="status"
      data-testid="assembly-band"
    >
      <strong className="font-semibold">{t('montage.title')}</strong>
      <span className="truncate">
        {total > 0 ? `${t('montage.stepOf', { n: index + 1, total })} · ${plan.steps[index].step.title}` : t('montage.noSteps')}
      </span>
      {total > 0 && <span className="ml-auto opacity-80 hidden md:inline">{t('montage.keysHint')}</span>}
      <button
        type="button"
        onClick={() => setWorkspace('design')}
        className={`${total > 0 ? '' : 'ml-auto '}h-6 px-2.5 rounded border border-ws-assembly-text/60 font-semibold hover:bg-ws-assembly-text/10`}
      >
        {t('montage.leave')}
      </button>
    </div>
  )
}

/** Left column in the assembly workspace: every step, the shown one highlighted */
export function AssemblyStepList() {
  const { t } = useTranslation()
  const on = useUIStore((s) => s.workspace === 'assembly')
  const stepIndex = useUIStore((s) => s.assemblyStep)
  const setAssemblyStep = useUIStore((s) => s.setAssemblyStep)
  const plan = usePlan()
  if (!on) return null
  const total = plan.steps.length
  const index = Math.min(stepIndex, Math.max(0, total - 1))
  return (
    <aside
      aria-label={t('montage.instruction')}
      data-testid="assembly-step-list"
      className="w-60 shrink-0 bg-chrome-bg text-chrome-text border-r border-chrome-border flex flex-col min-h-0"
    >
      <div className="flex items-center h-8 px-3 border-b border-chrome-border shrink-0">
        <h3 className="text-[11px] font-semibold text-chrome-muted uppercase tracking-wider">{t('montage.steps')}</h3>
        <span className="ml-auto font-mono text-[10px] text-chrome-muted tabular-nums">{total}</span>
      </div>
      <ol className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
        {total === 0 && <li className="px-2 py-1 text-xs text-chrome-muted">{t('montage.noStepsHint')}</li>}
        {plan.steps.map((s, i) => {
          const current = i === index
          const done = i < index
          return (
            <li key={s.step.id}>
              <button
                type="button"
                onClick={() => setAssemblyStep(i)}
                aria-current={current ? 'step' : undefined}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs ${
                  current ? 'bg-ws-assembly/20 text-chrome-text' : done ? 'text-chrome-muted hover:bg-chrome-surface' : 'text-chrome-secondary hover:bg-chrome-surface'
                }`}
              >
                <span className={`w-5 h-5 shrink-0 rounded-full grid place-items-center font-mono text-[10px] ${
                  current ? 'bg-ws-assembly text-ws-assembly-text' : done ? 'bg-chrome-surface text-chrome-secondary' : 'border border-chrome-divider'
                }`}>{i + 1}</span>
                <span className="flex-1 min-w-0 truncate">{s.step.title}</span>
                <span className="font-mono text-[10px] text-chrome-muted tabular-nums">{s.boards.length}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {plan.unplanned.length > 0 && (
        <div className="shrink-0 m-2 px-2 py-1.5 rounded bg-ws-assembly/15 text-[11px] text-amber-200">
          {t('montage.unplannedCount', { count: plan.unplanned.length })}
        </div>
      )}
    </aside>
  )
}

/** Step timeline at the bottom of the canvas: one tick per step, ‹ › around it */
export function AssemblyTimeline() {
  const { t } = useTranslation()
  const on = useUIStore((s) => s.workspace === 'assembly')
  const stepIndex = useUIStore((s) => s.assemblyStep)
  const setAssemblyStep = useUIStore((s) => s.setAssemblyStep)
  const plan = usePlan()
  const total = plan.steps.length
  if (!on || total === 0) return null
  const index = Math.min(stepIndex, total - 1)
  const nav = 'w-7 h-7 rounded bg-chrome-surface text-chrome-text hover:bg-chrome-hover disabled:opacity-30 disabled:pointer-events-none'
  return (
    <div
      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-2 py-1.5 rounded-lg border border-chrome-border bg-chrome-bg/90 backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="assembly-timeline"
    >
      <button type="button" className={nav} onClick={() => setAssemblyStep(index - 1)} disabled={index === 0} aria-label={t('montage.prev')}>‹</button>
      <div className="flex items-center gap-1">
        {plan.steps.map((s, i) => (
          <button
            key={s.step.id}
            type="button"
            onClick={() => setAssemblyStep(i)}
            title={`${i + 1} · ${s.step.title}`}
            aria-label={`${t('montage.step', { n: i + 1 })}: ${s.step.title}`}
            aria-current={i === index ? 'step' : undefined}
            className={`h-2.5 rounded-sm transition-colors ${i === index ? 'w-8 bg-ws-assembly' : i < index ? 'w-5 bg-chrome-muted' : 'w-5 bg-chrome-surface hover:bg-chrome-hover'}`}
          />
        ))}
      </div>
      <button type="button" className={nav} onClick={() => setAssemblyStep(index + 1)} disabled={index >= total - 1} aria-label={t('montage.next')}>›</button>
    </div>
  )
}
