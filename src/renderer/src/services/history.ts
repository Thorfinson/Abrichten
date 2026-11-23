import { useProjectStore } from '../store/useProjectStore'
import { designChanged, isDesignLocked, tellDesignLocked } from '../store/designLock'

// Undo and redo for the whole app (⌘Z, ⇧⌘Z, the toolbar). Undo history bypasses the
// project store's `set`, so the design lock (store/designLock.ts) is applied here: in
// the assembly workspace a step back or forward that would change the design is not
// taken, and the user is told to take it in the design workspace.

/** One step back; false when there is none or it belongs to the design. */
export function undo(): boolean {
  const temporal = useProjectStore.temporal.getState()
  const before = temporal.pastStates.at(-1)
  if (!before) return false
  if (isDesignLocked() && before.project && designChanged(useProjectStore.getState().project, before.project)) {
    tellDesignLocked('undo')
    return false
  }
  temporal.undo()
  return true
}

/** One step forward again; false when there is none or it belongs to the design. */
export function redo(): boolean {
  const temporal = useProjectStore.temporal.getState()
  const after = temporal.futureStates.at(-1)
  if (!after) return false
  if (isDesignLocked() && after.project && designChanged(useProjectStore.getState().project, after.project)) {
    tellDesignLocked('redo')
    return false
  }
  temporal.redo()
  return true
}
