import { useMemo } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { partLabels } from '../utils/partLabel'

/** The part labels ("Herd 2") of the current project by board id, recomputed only when the parts change. */
export function usePartLabels(): Map<string, string> {
  const assemblies = useProjectStore((s) => s.project.assemblies)
  return useMemo(() => partLabels(assemblies), [assemblies])
}
