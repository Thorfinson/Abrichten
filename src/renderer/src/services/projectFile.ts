import i18n from '../i18n'
import { useProjectStore, isProjectDirty } from '../store/useProjectStore'
import { useUIStore } from '../store/useUIStore'
import { loadProjectFromDB, backupAutoSave } from './storage'
import { validateProject } from '../utils/validateProject'

const MAX_FILE_CHARS = 50_000_000 // ponytail: sanity cap, a real project is well under 1 MB

/**
 * Native open dialog → validate → load. Shared by toolbar, palette and Ctrl+O
 * so every path gets the same validation and the same error feedback.
 * Returns true when a project was loaded.
 */
export async function openProjectFile(): Promise<boolean> {
  try {
    const result = await window.electronAPI?.fileOpen()
    if (!result) return false
    if (result.content.length > MAX_FILE_CHARS) throw new Error('file too large')
    useProjectStore.getState().loadProject(JSON.parse(result.content))
    useUIStore.getState().deselectAll()
    return true
  } catch (err) {
    console.error('Failed to open project:', err)
    const reason = err instanceof Error ? err.message : String(err)
    useUIStore.getState().setExportStatus(i18n.t('actions.invalidProjectFile', { reason }))
    return false
  }
}

/** Browser fallback (no Electron, e.g. the E2E harness): hand the file to the browser as a download. */
function downloadFile(data: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Save the current project: the native save dialog in Electron, a download in a
 * plain browser. On success the project counts as saved (no unsaved changes).
 * Shared by toolbar, palette and Ctrl+S. Returns true when the file was written.
 */
export async function saveProjectFile(): Promise<boolean> {
  const project = useProjectStore.getState().project
  const data = JSON.stringify(project, null, 2)
  const fileName = `${project.name}.abrichten.json`
  try {
    if (window.electronAPI) {
      const path = await window.electronAPI.fileSave(data, fileName)
      if (!path) return false   // dialog cancelled
      useUIStore.getState().setExportStatus(i18n.t('func.savedTo', { path }))
    } else {
      downloadFile(data, fileName)
    }
    // the project as written: edits made while the dialog was open stay unsaved
    useProjectStore.getState().markSaved(project)
    return true
  } catch (err) {
    console.error('Failed to save project:', err)
    const reason = err instanceof Error ? err.message : String(err)
    useUIStore.getState().setExportStatus(i18n.t('func.saveFailed', { reason }))
    return false
  }
}

/**
 * Ask before New / Open would throw away unsaved changes. True when there is
 * nothing unsaved or the user agrees to discard it.
 */
export function confirmDiscardChanges(action?: 'new' | 'open'): boolean {
  if (!isProjectDirty(useProjectStore.getState())) return true
  const key = action === 'new' ? 'actions.confirmNew' : action === 'open' ? 'actions.confirmOpen' : 'func.confirmDiscard'
  return window.confirm(i18n.t(key))
}

let restoring: Promise<void> | null = null

/**
 * Startup restore from the IndexedDB auto-save. An auto-save that no longer
 * validates is moved to a backup key before anything can overwrite it, and
 * the user is told; the app then starts with an empty project.
 * Runs once per app start (React StrictMode mounts effects twice in dev).
 */
export function restoreAutoSave(): Promise<void> {
  restoring ??= restore()
  return restoring
}

async function restore(): Promise<void> {
  try {
    const entry = await loadProjectFromDB()
    if (entry) {
      useProjectStore.getState().loadProject(entry.project)
      // crash recovery: changes that never reached a file stay marked as unsaved
      if (entry.unsaved) useProjectStore.setState({ savedProject: entry.saved ? validateProject(entry.saved) : null })
    }
  } catch (err) {
    console.error('Failed to restore project:', err)
    const reason = err instanceof Error ? err.message : String(err)
    const backup = await backupAutoSave().catch((e) => { console.error('Auto-save backup failed:', e); return null })
    useUIStore.getState().setExportStatus(backup
      ? i18n.t('store.restoreFailedBackup', { reason, backup })
      : i18n.t('store.restoreFailed', { reason }))
  }
}
