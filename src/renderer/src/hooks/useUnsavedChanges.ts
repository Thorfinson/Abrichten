import { useEffect } from 'react'
import { useProjectStore, isProjectDirty } from '../store/useProjectStore'
import { discardAutoSave } from '../services/storage'

const APP_NAME = 'Abrichten'

/** Cancelling beforeunload makes Electron's main process ask (see 'will-prevent-unload'). */
function blockUnload(e: BeforeUnloadEvent): void {
  e.preventDefault()
  e.returnValue = true   // legacy browsers need a value as well
}

/**
 * Unsaved-changes feedback: the window title carries a bullet while the project
 * differs from the last loaded or saved one, and closing the window asks first.
 * Mount once (App).
 *
 * The close guard is Electron-only: there the main process shows a native dialog.
 * In a plain browser (E2E harness) the auto-save keeps the work, and a browser
 * prompt would block every test that reloads after an edit.
 */
export function useUnsavedChanges(): void {
  const dirty = useProjectStore(isProjectDirty)
  const name = useProjectStore((s) => s.project.name)

  useEffect(() => {
    document.title = dirty ? `${name} • — ${APP_NAME}` : `${name} — ${APP_NAME}`
  }, [dirty, name])

  useEffect(() => {
    if (!dirty || !window.electronAPI) return
    // called by the main process when the user chooses "discard" in the close dialog
    window.__abrichtenDiscard = () => discardAutoSave(useProjectStore.getState().savedProject)
    window.onbeforeunload = blockUnload
    return () => {
      if (window.onbeforeunload === blockUnload) window.onbeforeunload = null
    }
  }, [dirty])
}
