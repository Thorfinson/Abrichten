import { BOARD_ROLES, type BoardRole } from '../types/furniture'

/** A known part role (anything else, e.g. from a newer or broken file, is not). */
export const isBoardRole = (v: unknown): v is BoardRole => BOARD_ROLES.includes(v as BoardRole)

/** i18n key of a role's label; no role → "ohne Bauteilart". */
export const roleKey = (role: BoardRole | undefined): string => `role.${role ?? 'none'}`

export interface RoleGroup<T> {
  /** undefined = parts without a role */
  role: BoardRole | undefined
  items: T[]
}

/**
 * `items` in role groups: in the order of BOARD_ROLES, parts without a role
 * (or with an unknown one) last, empty groups left out. Items keep their order
 * within a group, so a sorted list stays sorted.
 */
export function groupByRole<T>(items: readonly T[], roleOf: (item: T) => BoardRole | undefined): RoleGroup<T>[] {
  const groups = new Map<BoardRole | undefined, T[]>()
  for (const item of items) {
    const r = roleOf(item)
    const role = isBoardRole(r) ? r : undefined
    const list = groups.get(role)
    if (list) list.push(item)
    else groups.set(role, [item])
  }
  return [...BOARD_ROLES, undefined].flatMap((role) => {
    const list = groups.get(role)
    return list ? [{ role, items: list }] : []
  })
}
