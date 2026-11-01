import Dexie, { type Table } from 'dexie'
import type { Project } from '../types/furniture'

/** `unsaved`: the auto-save differs from the last file save; `saved` is that version (if any). */
interface AutoSaveEntry { key: string; data: Project; unsaved?: boolean; saved?: Project | null }

class AbrichtenDB extends Dexie {
  projects!: Table<AutoSaveEntry, string>

  constructor() {
    super('abrichten-db')
    this.version(1).stores({
      projects: 'key'
    })
  }
}

const db = new AbrichtenDB()

const CURRENT_KEY = 'current'
/** Unreadable auto-saves are kept under "unreadable-<ISO time>" in the same table. */
const BACKUP_PREFIX = 'unreadable-'

/** Set when the user discards changes on close: a pending auto-save must not undo that. */
let frozen = false

/**
 * Save a project to IndexedDB (auto-save, crash recovery). `saved` is the version
 * last written to a file (null = never saved), so a restore knows what is unsaved.
 */
export async function saveProjectToDB(project: Project, saved: Project | null = project): Promise<void> {
  if (frozen) return
  const unsaved = project !== saved
  await db.projects.put({ key: CURRENT_KEY, data: project, unsaved, saved: unsaved ? saved : undefined })
}

/**
 * Load the auto-saved project from IndexedDB, with whether it holds unsaved changes
 * and the last saved version. Entries from older versions count as saved.
 */
export async function loadProjectFromDB(): Promise<{ project: Project; unsaved: boolean; saved: Project | null } | null> {
  const entry = await db.projects.get(CURRENT_KEY)
  if (!entry) return null
  return { project: entry.data, unsaved: entry.unsaved === true, saved: entry.saved ?? null }
}

/**
 * "Discard changes" on close: the auto-save goes back to the last saved version
 * (or is cleared when there never was one), and no later auto-save may overwrite it.
 */
export async function discardAutoSave(saved: Project | null): Promise<void> {
  frozen = true
  if (saved) await db.projects.put({ key: CURRENT_KEY, data: saved, unsaved: false })
  else await db.projects.delete(CURRENT_KEY)
}

/**
 * Move the auto-save to a backup key when it no longer loads, so the next
 * auto-save cannot overwrite it. Returns the backup key (null if there was none).
 */
export async function backupAutoSave(): Promise<string | null> {
  const key = BACKUP_PREFIX + new Date().toISOString()
  return db.transaction('rw', db.projects, async () => {
    const entry = await db.projects.get(CURRENT_KEY)
    if (!entry) return null
    await db.projects.put({ key, data: entry.data })
    await db.projects.delete(CURRENT_KEY)
    return key
  })
}

/**
 * Clear the auto-saved project.
 */
export async function clearAutoSave(): Promise<void> {
  await db.projects.delete(CURRENT_KEY)
}
