import type { Assembly, Joint, Project } from '../types/furniture'

/**
 * Does this assembly count? The one reading of its tick (Assembly.visible, the tick in the
 * parts column, components/ui/CountsCheck): an unticked assembly is out of the 3D view AND
 * out of every list and total — cutting list, fastener summary, cost, nesting, boring list,
 * shop drawings, statics, assembly steps. This is how design variants of one project are
 * switched. No tick saved means it counts (older files). What only hides from view is the
 * eye (store/useUIStore hiddenParts), not this. A guard test keeps every reading here.
 */
export function assemblyCounts(a: { visible?: unknown }): boolean {
  return a.visible !== false
}

/** The assemblies that count (assemblyCounts). */
export function activeAssemblies(project: Pick<Project, 'assemblies'>): Assembly[] {
  return project.assemblies.filter(assemblyCounts)
}

export interface ActiveJoint {
  joint: Joint
  /** Assembly that stores the joint (needed to remove it). */
  ownerId: string
}

/** Joints stored in a visible assembly whose two boards are both in visible assemblies. */
export function activeJoints(project: Project): ActiveJoint[] {
  const active = activeAssemblies(project)
  const boardIds = new Set(active.flatMap((a) => a.boards.map((b) => b.id)))
  return active.flatMap((a) =>
    a.joints
      .filter((j) => boardIds.has(j.boardA) && boardIds.has(j.boardB))
      .map((joint) => ({ joint, ownerId: a.id }))
  )
}
