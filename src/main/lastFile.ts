import { createHash } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'

/*
 * The project file last opened or saved in the app, remembered across restarts
 * (a small JSON file in the app's data folder) together with a fingerprint of
 * what it held at that moment. At startup the app asks whether that file has
 * been changed outside the app since — by a script, another program or a sync —
 * and offers to load it (the start itself restores the auto-save, not the file).
 *
 * Only the main process knows the path: the renderer never names a file to read.
 */

/** What the app last read from or wrote to a project file. */
export interface RememberedFile {
  path: string
  /** sha256 of the file content as read or written */
  hash: string
}

/** The remembered file, changed since the app last read or wrote it. */
export interface ChangedFile {
  path: string
  content: string
  /** Last modification time (ms since 1970) */
  modifiedAt: number
}

export const contentHash = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex')

export class LastFile {
  private readonly dir: string
  private readonly memo: string
  /** The changed version last reported, until the user has seen it */
  private reported: RememberedFile | null = null

  /** `dir`: where the memo is kept (the app's userData folder). */
  constructor(dir: string) {
    this.dir = dir
    this.memo = join(dir, 'last-project-file.json')
  }

  /** The remembered file, or null (none yet, or the memo is unreadable). */
  async read(): Promise<RememberedFile | null> {
    try {
      const raw = JSON.parse(await readFile(this.memo, 'utf-8'))
      return typeof raw?.path === 'string' && typeof raw?.hash === 'string'
        ? { path: raw.path, hash: raw.hash }
        : null
    } catch {
      return null
    }
  }

  /** The app has just opened or saved `path` with this content. */
  async remember(path: string, content: string): Promise<void> {
    this.reported = null
    await this.write({ path, hash: contentHash(content) })
  }

  /**
   * The remembered file when its content differs from what the app last read or
   * wrote; null when it is unchanged, gone, unreadable or there is none.
   */
  async changed(): Promise<ChangedFile | null> {
    const known = await this.read()
    if (!known) return null
    let content: string
    let modifiedAt: number
    try {
      content = await readFile(known.path, 'utf-8')
      modifiedAt = (await stat(known.path)).mtimeMs
    } catch {
      return null
    }
    const hash = contentHash(content)
    if (hash === known.hash) return null
    this.reported = { path: known.path, hash }
    return { path: known.path, content, modifiedAt }
  }

  /**
   * The user has answered about the reported version (loaded it or kept the
   * app's state): it counts as known, so the app does not ask about it again.
   */
  async seen(): Promise<void> {
    const reported = this.reported
    if (!reported) return
    this.reported = null
    await this.write(reported)
  }

  private async write(entry: RememberedFile): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.memo, JSON.stringify(entry), 'utf-8')
  }
}
