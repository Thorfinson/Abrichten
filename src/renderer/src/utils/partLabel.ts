import type { Assembly, Board } from '../types/furniture'
import { treeOrder } from './assemblySteps'

/*
 * Part labels for the workshop: the assembly's short word plus the part's number
 * within the assembly — "Herd 2", "Schub 4", "Unterbau 12". A plain word, not a
 * code to learn; the full name stands next to it wherever there is room. The
 * label is the same in the parts column, the properties card, the cutting list,
 * the nesting sheets, the shop drawings, the boring list and the assembly
 * instruction.
 *
 * The number is stored on the board (Board.partNo) and stays when other parts
 * change; the store gives every new part the next free number of its assembly
 * (numberParts), and renumberParts closes the gaps before printing.
 */

/** Longest short word; it has to fit on a batten. */
export const MAX_SHORT_NAME = 16
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** A usable short word: one line, trimmed, at most MAX_SHORT_NAME characters; '' when empty. */
export function cleanShortName(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SHORT_NAME).trim()
}

/** The first word of the assembly name, whole: "Herdfach links" → "Herdfach" (the length limit is for words you type). */
export const defaultShortName = (name: string): string =>
  (name.replace(CONTROL_CHARS, ' ').split(/\s+/).find(Boolean) ?? '').trim()

/** The assembly's short word: set by the user, else the first word of its name. */
export const shortNameOf = (a: Pick<Assembly, 'name' | 'shortName'>): string =>
  cleanShortName(a.shortName) || defaultShortName(a.name)

/** A usable part number: a whole number from 1 to 99 999. */
export const isPartNo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99_999

/** "Herd 2"; a part without a number yet shows "Herd –". */
export const partLabel = (a: Pick<Assembly, 'name' | 'shortName'>, b: Pick<Board, 'partNo'>): string =>
  `${shortNameOf(a)} ${isPartNo(b.partNo) ? b.partNo : '–'}`

/**
 * How a part is named in running text, options and tooltips: label and name,
 * "Herd 2 Seitenwand Herdfach rechts". Every place that names a part uses this
 * (or components/ui/PartName in JSX); tests/unit/part-name-guard.test.mjs checks it.
 */
export const partTitle = (label: string | undefined, name: string): string => (label ? `${label} ${name}` : name)

/** The label of every numbered part, by board id (the store numbers every part; one without stays unlabelled). */
export function partLabels(assemblies: Assembly[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const a of assemblies) for (const b of a.boards) if (isPartNo(b.partNo)) out.set(b.id, partLabel(a, b))
  return out
}

/** Sort key of every part: the assembly in tree order (as the parts column lists it), then the number. */
export function partOrder(assemblies: Assembly[]): Map<string, number> {
  const out = new Map<string, number>()
  treeOrder(assemblies).forEach((a, i) => {
    for (const b of a.boards) out.set(b.id, i * 100_000 + (isPartNo(b.partNo) ? b.partNo : 99_999))
  })
  return out
}

/**
 * Several labels in short: "Herd 1–3, 5 · Eck 2". Numbers of one short word are
 * sorted and runs joined; the short words keep their first-seen order.
 */
export function joinLabels(labels: string[]): string {
  const byWord = new Map<string, number[]>()
  const loose: string[] = []
  for (const l of labels) {
    const m = /^(.*) (\d+)$/.exec(l)
    if (!m) { if (!loose.includes(l)) loose.push(l); continue }
    const nums = byWord.get(m[1]) ?? []
    if (!nums.includes(Number(m[2]))) nums.push(Number(m[2]))
    byWord.set(m[1], nums)
  }
  const parts = [...byWord].map(([word, nums]) => {
    nums.sort((x, y) => x - y)
    const runs: string[] = []
    for (let i = 0; i < nums.length; i++) {
      let j = i
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
      runs.push(j > i + 1 ? `${nums[i]}–${nums[j]}` : j === i + 1 ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`)
      i = j
    }
    return `${word} ${runs.join(', ')}`
  })
  return [...parts, ...loose].join(' · ')
}

/**
 * Every part gets a number: missing or doubled numbers (a later part with the
 * same number) become the next free one of the assembly (highest + 1), in list
 * order. Returns the same arrays and objects where nothing changes.
 */
export function numberParts(assemblies: Assembly[]): Assembly[] {
  let changed = false
  const next = assemblies.map((a) => {
    const used = new Set<number>()
    let ok = true
    for (const b of a.boards) {
      if (!isPartNo(b.partNo) || used.has(b.partNo)) { ok = false; break }
      used.add(b.partNo)
    }
    if (ok) return a
    changed = true
    const taken = new Set<number>()
    const valid = a.boards.map((b) => {
      const keep = isPartNo(b.partNo) && !taken.has(b.partNo)
      if (keep) taken.add(b.partNo as number)
      return keep
    })
    let max = Math.max(0, ...taken)
    return { ...a, boards: a.boards.map((b, i) => (valid[i] ? b : { ...b, partNo: ++max })) }
  })
  return changed ? next : assemblies
}

/** Every assembly numbered 1, 2, 3 … in list order, without gaps. Same arrays where nothing changes. */
export function renumberParts(assemblies: Assembly[]): Assembly[] {
  let changed = false
  const next = assemblies.map((a) => {
    if (a.boards.every((b, i) => b.partNo === i + 1)) return a
    changed = true
    return { ...a, boards: a.boards.map((b, i) => (b.partNo === i + 1 ? b : { ...b, partNo: i + 1 })) }
  })
  return changed ? next : assemblies
}

/** Short words (lower case) that more than one assembly with parts uses: their labels would be ambiguous. */
export function doubledShortNames(assemblies: Assembly[]): Set<string> {
  const seen = new Set<string>()
  const doubled = new Set<string>()
  for (const a of assemblies) {
    if (a.boards.length === 0) continue
    const key = shortNameOf(a).toLocaleLowerCase('de')
    if (seen.has(key)) doubled.add(key)
    seen.add(key)
  }
  return doubled
}
