import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, viewStateOf, type ViewState } from '../../store/useUIStore'

/**
 * The view switches of a part or a group in the parts column — the same on every level of
 * every grouping (assembly, subgroup, part role, material, single part):
 *  - the eye hides parts in the view only (they still count in every list);
 *  - the X-ray picks parts out, everything else is ghosted around them, to show where they sit.
 * Neither is saved in the file. A group that is only partly hidden or picked out shows it
 * (dashed eye, half X-ray); a click then turns it back for all. `quiet` (single parts):
 * the switch shows while the row is hovered or focused, or when it is not in its usual state.
 */
function PartsSwitch({ ids, name, list, toggle, testId, titles, quiet, active, children }: {
  ids: readonly string[]
  name: string
  list: readonly string[]
  toggle: (ids: string[]) => void
  testId: string
  titles: Record<ViewState, string>
  quiet: boolean
  /** The unusual state is "in the list" (hidden, picked out) */
  active: (state: ViewState) => boolean
  children: (state: ViewState) => ReactNode
}) {
  if (ids.length === 0) return <span className="shrink-0 w-5 h-5" aria-hidden="true" />
  const state = viewStateOf(ids, list)
  const title = titles[state]
  return (
    <button
      type="button"
      data-testid={testId}
      data-state={state}
      onClick={(e) => { e.stopPropagation(); toggle([...ids]) }}
      onDragStart={(e) => e.preventDefault()}
      className={`shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-chrome-hover focus-visible:opacity-100 ${
        quiet && !active(state) ? 'opacity-0 group-hover/row:opacity-100' : ''
      }`}
      title={title}
      aria-label={`${title}: ${name}`}
      aria-pressed={state === 'mixed' ? 'mixed' : state === 'hidden'}
    >
      {children(state)}
    </button>
  )
}

export function EyeToggle({ ids, name, quiet = false }: { ids: readonly string[]; name: string; quiet?: boolean }) {
  const { t } = useTranslation()
  const hiddenParts = useUIStore((s) => s.hiddenParts)
  const toggle = useUIStore((s) => s.togglePartsInView)
  return (
    <PartsSwitch
      ids={ids} name={name} list={hiddenParts} toggle={toggle} testId="view-eye" quiet={quiet}
      titles={{ shown: t('eye.hide'), hidden: t('eye.show'), mixed: t('eye.mixed') }}
      active={(s) => s !== 'shown'}
    >
      {(state) => state === 'hidden' ? (
        <svg className="w-3.5 h-3.5 text-chrome-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-chrome-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeDasharray={state === 'mixed' ? '3 2.5' : undefined} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </PartsSwitch>
  )
}

export function HighlightToggle({ ids, name, quiet = false }: { ids: readonly string[]; name: string; quiet?: boolean }) {
  const { t } = useTranslation()
  const highlightedParts = useUIStore((s) => s.highlightedParts)
  const toggle = useUIStore((s) => s.togglePartsHighlight)
  return (
    <PartsSwitch
      ids={ids} name={name} list={highlightedParts} toggle={toggle} testId="view-xray" quiet={quiet}
      titles={{ shown: t('xray.on'), hidden: t('xray.off'), mixed: t('xray.mixed') }}
      active={(s) => s !== 'shown'}
    >
      {(state) => (
        <svg className={`w-3.5 h-3.5 ${state === 'hidden' ? 'text-accent' : state === 'mixed' ? 'text-accent/60' : 'text-chrome-hint'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13v13H8zM3 3h13v13H3zM3 3l5 3M16 3l5 3M3 16l5 3M16 16l5 3" />
        </svg>
      )}
    </PartsSwitch>
  )
}
