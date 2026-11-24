import { useMemo } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useUIStore, viewHiddenIds } from '../store/useUIStore'

/**
 * Ids of the parts the view hides right now: in the assembly workspace what the step
 * view hides, in the design workspace what the eye hides (store/useUIStore viewHiddenIds).
 * Every layer drawn over the boards skips them, so the view shows one consistent state.
 */
export function useViewHidden(): Set<string> {
  const workspace = useUIStore((s) => s.workspace)
  const assemblyStep = useUIStore((s) => s.assemblyStep)
  const hiddenParts = useUIStore((s) => s.hiddenParts)
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const assemblySteps = useProjectStore((s) => s.project.assemblySteps)
  return useMemo(
    () => viewHiddenIds({ assemblies, assemblySteps }, { workspace, assemblyStep, hiddenParts }),
    [assemblies, assemblySteps, workspace, assemblyStep, hiddenParts]
  )
}
