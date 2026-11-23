import type { Project } from '../types/furniture'

/**
 * The assembly workspace (Montage) reads the design and writes only the assembly plan:
 * the steps, their order, titles, notes and which part goes into which step. Everything
 * else — parts, joints, assemblies, parameters, materials, prices, hardware — belongs to
 * the design workspace (Entwurf). This is the one rule; the project store applies it to
 * every change (useProjectStore `set`), undo and redo apply it too (services/history.ts),
 * and the UI leaves out or greys what it would refuse (useDesignLocked).
 *
 * Besides the plan, the assembly workspace keeps what is about the file, not the design:
 * the project's name, display unit and language, and the time of the last change.
 */
const ASSEMBLY_FIELDS: ReadonlySet<string> = new Set<keyof Project>(['assemblySteps', 'updatedAt', 'name', 'displayUnit', 'language'])

/** True when `after` differs from `before` in anything the assembly workspace may not change. */
export function designChanged(before: Project, after: Project): boolean {
  if (before === after) return false
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    if (ASSEMBLY_FIELDS.has(key)) continue
    if ((before as unknown as Record<string, unknown>)[key] !== (after as unknown as Record<string, unknown>)[key]) return true
  }
  return false
}

/** What was refused: a change, an undo or a redo. */
export type LockedKind = 'change' | 'undo' | 'redo'

let lockedNow: () => boolean = () => false
let notice: (kind: LockedKind) => void = () => {}

/** The design is read-only now (the assembly workspace is shown). Its one source is the
 *  UI store's workspace, which registers itself here (store/useUIStore.ts). */
export const isDesignLocked = (): boolean => lockedNow()

export function setDesignLockSource(source: () => boolean): void {
  lockedNow = source
}

/** How the app tells the user that something belongs to the design (a toast; App.tsx). */
export function setDesignLockedNotice(fn: (kind: LockedKind) => void): void {
  notice = fn
}

export function tellDesignLocked(kind: LockedKind): void {
  notice(kind)
}
