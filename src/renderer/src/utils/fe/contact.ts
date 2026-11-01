/**
 * Unilateral contact for the finite-element models (utils/fe/plate.ts, planeStress.ts):
 * supports only push. After each solve, released nodes that sink into their support are
 * held again and held nodes that pull on it are released, both in the same pass (the
 * primal–dual active-set step). A node that has switched MAX_TOGGLES times sits out, so
 * the passes cannot chatter between two states. When only such nodes are left, the
 * deepest sinking one is held again, else every pulling one is released, until nothing
 * is wrong or MAX_PASSES is reached. The last solve always matches its held set, so the
 * reactions balance the load.
 */
export const MAX_PASSES = 24
const MAX_TOGGLES = 3

export interface ContactState {
  /** Node rests on its support now */
  held: Uint8Array
  /** Node lies on a support at all */
  covered: Uint8Array
  /** Node lies on a support that also pulls (never released) */
  bilateral: Uint8Array
  /** How often each node has switched */
  toggles: Uint8Array
}

/**
 * One decision after a solve: `sink(n)` how far a released node went into its support
 * (mm), `reaction(n)` the upward reaction of a held node (N). Returns false when every
 * node is where it belongs.
 */
export function contactStep(
  s: ContactState, sink: (n: number) => number, reaction: (n: number) => number, tolW: number, tolR: number
): boolean {
  const sinks: number[] = [], pulls: number[] = [], allPulls: number[] = []
  let worstSink = -1, deepest = tolW
  for (let n = 0; n < s.held.length; n++) {
    if (!s.covered[n] || s.bilateral[n]) continue
    const free = s.toggles[n] < MAX_TOGGLES
    if (!s.held[n]) {
      const d = sink(n)
      if (d <= tolW) continue
      if (free) sinks.push(n)
      if (d > deepest) { worstSink = n; deepest = d }
    } else if (reaction(n) < -tolR) {
      allPulls.push(n)
      if (free) pulls.push(n)
    }
  }
  const flip = (list: number[], to: 0 | 1): void => { for (const n of list) { s.held[n] = to; s.toggles[n]++ } }
  if (sinks.length || pulls.length) { flip(sinks, 1); flip(pulls, 0) }
  else if (worstSink >= 0) flip([worstSink], 1)
  else if (allPulls.length) flip(allPulls, 0)
  else return false
  return true
}

/** Share of the load a push-only node may still pull when the passes end (cycle or MAX_PASSES). */
const MAX_LEFT_PULL = 0.02

/**
 * True when the passes ended with a push-only node still pulling a real share of the load:
 * the contact state did not settle (the board tips on its contacts), so the solution is not
 * one. The callers then treat the supports as unable to hold the board.
 */
export function unsettled(
  s: Pick<ContactState, 'held' | 'covered' | 'bilateral'>, reaction: (n: number) => number, total: number
): boolean {
  for (let n = 0; n < s.held.length; n++) {
    if (s.held[n] && s.covered[n] && !s.bilateral[n] && reaction(n) < -MAX_LEFT_PULL * total) return true
  }
  return false
}

/**
 * A fingerprint of the held set. When a contact pass would return to a held set already
 * solved, the nodes left are at zero contact force (held they pull a trace, released they
 * sink a trace): the iteration stops there with the last solution.
 */
export function heldKey(held: Uint8Array): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let n = 0; n < held.length; n++) {
    if (!held[n]) continue
    h1 = Math.imul(h1 ^ n, 0x01000193)
    h2 = Math.imul(h2 ^ (n * 2654435761), 0x85ebca6b)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}
