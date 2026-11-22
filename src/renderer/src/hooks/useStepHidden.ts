import { useMemo } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useUIStore, shownStep } from '../store/useUIStore'
import { stepHiddenIds } from '../utils/assemblySteps'

/**
 * Ids of the parts the step view hides right now (empty outside the assembly
 * workspace). Every layer drawn over the boards skips them, so the assembly
 * workspace shows one consistent state (utils/assemblySteps stepHiddenIds).
 */
export function useStepHidden(): Set<string> {
  const current = useUIStore(shownStep)
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const assemblySteps = useProjectStore((s) => s.project.assemblySteps)
  return useMemo(() => stepHiddenIds({ assemblies, assemblySteps }, current), [assemblies, assemblySteps, current])
}
