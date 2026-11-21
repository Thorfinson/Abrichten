import type { Project } from '../types/furniture'
import { validateProject } from './validateProject'

/** Sanity cap for project files; a real project is well under 1 MB. */
export const MAX_FILE_CHARS = 50_000_000

/** The last opened or saved project file, changed outside the app: the startup question. */
export interface ChangedProjectFile {
  path: string
  /** Last modification time of the file (ms since 1970) */
  modifiedAt: number
  /** The file's project, validated, ready to load */
  project: Project
}

export type ChangedFileCheck =
  /** Same project as the one restored from the auto-save: ask whether to load the file */
  | { kind: 'ask'; project: Project }
  /** The file holds another project (e.g. after "New"): nothing to ask */
  | { kind: 'otherProject' }
  /** The file does not load: keep the app's state and say why */
  | { kind: 'invalid'; reason: string }

/**
 * What to do at startup with a project file that changed outside the app.
 * The question only comes for the project the app restored (same project id),
 * so a new project is never swapped for the last file by mistake.
 */
export function checkChangedFile(currentProjectId: string, content: string): ChangedFileCheck {
  try {
    if (content.length > MAX_FILE_CHARS) throw new Error('file too large')
    const project = validateProject(JSON.parse(content))
    return project.id === currentProjectId ? { kind: 'ask', project } : { kind: 'otherProject' }
  } catch (err) {
    return { kind: 'invalid', reason: err instanceof Error ? err.message : String(err) }
  }
}

/** "Musterküche.abrichten.json" from a full path (macOS or Windows). */
export const fileNameOf = (path: string): string => path.split(/[\\/]/).pop() || path

/** The folder part of a full path, without the file name. */
export const folderOf = (path: string): string => {
  const name = fileNameOf(path)
  return path.length > name.length ? path.slice(0, path.length - name.length - 1) : ''
}
