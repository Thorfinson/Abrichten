import Dexie, { type Table } from 'dexie'
import type { Project } from '../types/furniture'

class AbrichtenDB extends Dexie {
  projects!: Table<{ key: string; data: Project }, string>

  constructor() {
    super('abrichten-db')
    this.version(1).stores({
      projects: 'key'
    })
  }
}

const db = new AbrichtenDB()

const CURRENT_KEY = 'current'

/**
 * Save a project to IndexedDB (auto-save).
 */
export async function saveProjectToDB(project: Project): Promise<void> {
  await db.projects.put({ key: CURRENT_KEY, data: project })
}

/**
 * Load saved project from IndexedDB.
 */
export async function loadProjectFromDB(): Promise<Project | null> {
  const entry = await db.projects.get(CURRENT_KEY)
  return entry?.data ?? null
}

/**
 * Clear the auto-saved project.
 */
export async function clearAutoSave(): Promise<void> {
  await db.projects.delete(CURRENT_KEY)
}
