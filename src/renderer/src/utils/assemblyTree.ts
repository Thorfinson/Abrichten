import type { Assembly } from '../types/furniture'

/**
 * Assemblies form a tree through `parentId`; the project keeps them in one flat
 * array and siblings keep their array order. Visibility and X-ray are copied down
 * the subtree when toggled, so code that filters on `visible` needs no tree walk.
 */

export const PATH_SEP = ' › '

/** The assembly and every assembly nested below it. */
export function subtreeIds(assemblies: Assembly[], id: string): Set<string> {
  const ids = new Set([id])
  // ponytail: rescans until nothing is added, O(n·depth); fine for tens of groups
  for (let grew = true; grew; ) {
    grew = false
    for (const a of assemblies) {
      if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) { ids.add(a.id); grew = true }
    }
  }
  return ids
}

/** Names from the top level down, e.g. "Küche 1 › Backofen". */
export function assemblyPath(assemblies: Assembly[], id: string): string {
  const byId = new Map(assemblies.map((a) => [a.id, a]))
  const names: string[] = []
  const seen = new Set<string>()
  for (let a = byId.get(id); a && !seen.has(a.id); a = a.parentId ? byId.get(a.parentId) : undefined) {
    seen.add(a.id)
    names.unshift(a.name)
  }
  return names.join(PATH_SEP)
}

/** Ids of all assemblies above the given one, nearest first. */
export function ancestorIds(assemblies: Assembly[], id: string): string[] {
  const byId = new Map(assemblies.map((a) => [a.id, a]))
  const out: string[] = []
  for (let p = byId.get(id)?.parentId; p && !out.includes(p) && p !== id; p = byId.get(p)?.parentId) out.push(p)
  return out
}

/** Drop parent links that point nowhere, at the assembly itself, or around a cycle. */
export function sanitizeParents(assemblies: Assembly[]): Assembly[] {
  const ids = new Set(assemblies.map((a) => a.id))
  const parent = new Map(assemblies.map((a) => [
    a.id,
    typeof a.parentId === 'string' && a.parentId !== a.id && ids.has(a.parentId) ? a.parentId : undefined
  ]))
  for (const a of assemblies) {
    const seen = new Set([a.id])
    let cur = a.id
    let p = parent.get(cur)
    while (p) {
      if (seen.has(p)) { parent.set(cur, undefined); break }
      seen.add(p)
      cur = p
      p = parent.get(cur)
    }
  }
  return assemblies.map((a) => ({ ...a, parentId: parent.get(a.id) }))
}
