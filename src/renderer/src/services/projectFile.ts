import i18n from '../i18n'
import { useProjectStore } from '../store/useProjectStore'
import { useUIStore } from '../store/useUIStore'

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
