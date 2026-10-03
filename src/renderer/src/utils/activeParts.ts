import type { Assembly, Joint, Project } from '../types/furniture'

/**
 * Assemblies that count. Hiding an assembly (eye icon in the assembly drawer)
 * takes it out of the 3D view AND out of every list and total — cutting list,
 * fastener summary, cost, nesting, boring list, shop drawings. This is how
 * design variants of one project are switched.
 */
export function activeAssemblies(project: Project): Assembly[] {
  return project.assemblies.filter((a) => a.visible !== false)
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
