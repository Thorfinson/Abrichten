import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { subtreeIds } from '../../utils/assemblyTree'
import type { Assembly } from '../../types/furniture'
import { assemblyCounts } from '../../utils/activeParts'

/** Ticked, not ticked, or some of the subgroups ticked. */
export type CountsState = 'on' | 'off' | 'some'

export function countsStateOf(assemblies: Assembly[], id: string): CountsState {
  const ids = subtreeIds(assemblies, id)
  const on = assemblies.filter((a) => ids.has(a.id)).map(assemblyCounts)
  return on.every(Boolean) ? 'on' : on.some(Boolean) ? 'some' : 'off'
}

/**
 * The tick of an assembly (a design variant): it counts — in the cutting list, costs,
 * sheet layout, plans, statics, assembly steps and the view — or it does not. Saved in
 * the file, for the assembly and all its subgroups (Assembly.visible, utils/activeParts).
 * Only real assemblies have it; what only hides from view is the eye (EyeToggle).
 */
// design-lock-ok: shown only in the parts column, which the assembly workspace does not show
export function CountsCheck({ assembly }: { assembly: Assembly }) {
  const { t } = useTranslation()
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const toggle = useProjectStore((s) => s.toggleAssemblyVisibility)
  const state = countsStateOf(assemblies, assembly.id)
  const title = t(state === 'on' ? 'counts.on' : state === 'off' ? 'counts.off' : 'counts.some')
  return (
    <button
      type="button"
      data-testid="counts-check"
      data-state={state}
      onClick={(e) => { e.stopPropagation(); toggle(assembly.id) }}
      onDragStart={(e) => e.preventDefault()}
      className={`shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-chrome-hover ${
        state === 'off' ? 'text-chrome-hint' : 'text-chrome-secondary'
      }`}
      title={title}
      aria-label={`${title}: ${assembly.name}`}
      role="checkbox"
      aria-checked={state === 'on' ? true : state === 'off' ? false : 'mixed'}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        {state === 'on' && <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5" />}
        {state === 'some' && <path strokeLinecap="round" d="M8.5 12h7" />}
      </svg>
    </button>
  )
}
