import { useProjectStore } from '../store/useProjectStore'

// Bracket a continuous drag so that:
//  1. The Zustand store can be updated on every pointermove (other canvases
//     see the change live), and
//  2. Undo treats the whole drag as one step instead of 60+ frames.
//
// We snapshot the pre-drag state at beginDragHistory(), pause zundo's
// tracking during the drag, and at endDragHistory() splice the snapshot
// into pastStates manually so undo restores the pre-drag state cleanly.

interface ProjectSnapshot {
  project: ReturnType<typeof useProjectStore.getState>['project']
}

let snapshot: ProjectSnapshot | null = null

export function beginDragHistory(): void {
  if (snapshot !== null) return // already inside a drag — guard against re-entry
  snapshot = { project: useProjectStore.getState().project }
  useProjectStore.temporal.getState().pause()
}

export function endDragHistory(): void {
  const temporal = useProjectStore.temporal
  if (snapshot === null) {
    temporal.getState().resume()
    return
  }
  // If nothing changed (click without movement), drop the snapshot to avoid
  // a no-op undo step.
  const currentProject = useProjectStore.getState().project
  if (currentProject === snapshot.project) {
    snapshot = null
    temporal.getState().resume()
    return
  }
  const current = temporal.getState()
  // Drop any future-states (a fresh action invalidates redo) and append the
  // pre-drag snapshot as the new most-recent past state.
  temporal.setState({
    pastStates: [...current.pastStates, snapshot as unknown as never],
    futureStates: []
  })
  snapshot = null
  temporal.getState().resume()
}
