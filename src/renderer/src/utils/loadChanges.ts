/**
 * What loading changed in a project file, found by comparing the file as read with the validated project
 * (utils/validateProject). Finding 23.11.2026 (review data 2, 10, 11): the validator dropped a placed load,
 * a joint, a fastener or a parameter, trimmed names, and nobody was told; the cleaned state then counted as
 * saved. One generic comparison instead of a note in every branch: a new rule in the validator is reported
 * without anyone remembering to. Fields the validator only adds (defaults, part numbers) change nothing
 * that was in the file and are not reported; nor is a value that is null in the file (it counts as absent).
 */
export interface LoadChange {
  kind: 'removed' | 'changed' | 'duplicate'
  /** The part, assembly or "Projekt" the change belongs to, by its name in the file */
  where: string
  /** Path of the field inside it, e.g. "loads[0]" or "cutouts[1].depth" */
  field: string
  before: unknown
  after?: unknown
}

/** Fields the app itself retired on purpose: dropping them is no change to report. */
const RETIRED = new Set(['highlight'])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const idOf = (v: unknown): string | null => (isRecord(v) && typeof v.id === 'string' ? v.id : null)
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export function describeLoadChanges(raw: unknown, cleaned: unknown): LoadChange[] {
  const out: LoadChange[] = []
  const walk = (r: unknown, c: unknown, where: string, path: string): void => {
    if (Array.isArray(r)) {
      if (!Array.isArray(c)) { out.push({ kind: 'changed', where, field: path, before: r, after: c }); return }
      const at = (i: number) => `${path}[${i}]`
      const inner = (x: unknown, i: number): [string, string] => (named(x) ? [label(x, where), ''] : [where, at(i)])
      // two entries with the same id: said, and then compared in order (an id lookup would mix them up)
      const ids = r.map(idOf)
      const dup = new Set(ids.filter((id, i) => id !== null && ids.indexOf(id) !== i))
      for (const id of dup) out.push({ kind: 'duplicate', where, field: path, before: id })
      if (ids.every((id) => id !== null) && !dup.size && c.every((x) => idOf(x) !== null)) {
        const index = new Map(c.map((x) => [idOf(x) as string, x]))
        r.forEach((x, i) => {
          const twin = index.get(idOf(x) as string)
          if (twin === undefined) out.push({ kind: 'removed', where: label(x, where), field: at(i), before: x })
          else walk(x, twin, ...inner(x, i))
        })
        return
      }
      // no ids: the validator only removes entries and never reorders them, so align in order
      // (longest common run of equal entries); what is left pairs up as changed, or was removed
      const pairs = align(r, c)
      r.forEach((x, i) => {
        const j = pairs.get(i)
        if (j === undefined) out.push({ kind: 'removed', where: named(x) ? label(x, where) : where, field: at(i), before: x })
        else walk(x, c[j], ...inner(x, i))
      })
      return
    }
    if (isRecord(r)) {
      if (!isRecord(c)) { out.push({ kind: 'changed', where, field: path, before: r, after: c }); return }
      for (const [k, v] of Object.entries(r)) {
        const p = path ? `${path}.${k}` : k
        if (v === undefined || v === null || RETIRED.has(k)) continue
        if (!(k in c) || c[k] === undefined) out.push({ kind: 'removed', where, field: p, before: v })
        else walk(v, c[k], where, p)
      }
      return
    }
    if (r !== c && !(typeof r === 'number' && typeof c === 'number' && Number.isNaN(r) && Number.isNaN(c)))
      out.push({ kind: 'changed', where, field: path, before: r, after: c })
  }
  walk(raw, cleaned, 'Projekt', '')
  return out
}

/**
 * Raw index → cleaned index. Equal entries are matched in order first (longest common subsequence);
 * an unmatched raw entry then takes the next unmatched cleaned one between its matched neighbours
 * (it was changed, not removed), as long as there is one.
 */
function align(r: unknown[], c: unknown[]): Map<number, number> {
  const n = r.length, m = c.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = same(r[i], c[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const match = new Map<number, number>()
  for (let i = 0, j = 0; i < n && j < m;) {
    if (same(r[i], c[j])) { match.set(i, j); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) i++
    else j++
  }
  // gaps between matched pairs: pair up in order, the surplus of raw entries was removed
  const out = new Map(match)
  let lastI = -1, lastJ = -1
  const anchors = [...match.entries(), [n, m] as [number, number]]
  for (const [ai, aj] of anchors) {
    const freeI: number[] = [], freeJ: number[] = []
    for (let i = lastI + 1; i < ai; i++) freeI.push(i)
    for (let j = lastJ + 1; j < aj; j++) freeJ.push(j)
    // the surplus is removed at the end of the gap only when the kept ones look alike; pair from the start
    for (let k = 0; k < Math.min(freeI.length, freeJ.length); k++) out.set(freeI[k], freeJ[k])
    lastI = ai; lastJ = aj
  }
  return out
}

const named = (x: unknown): boolean => isRecord(x) && typeof x.name === 'string' && x.name.trim() !== ''
/** The name an element is known by in the file, or the context it is in. */
function label(x: unknown, fallback: string): string {
  return named(x) ? (x as { name: string }).name : fallback
}

const WORDS_DE: Record<string, string> = {
  loads: 'Last', joints: 'Verbindung', fasteners: 'Verbindungsmittel', cutouts: 'Ausschnitt', boards: 'Teil',
  assemblies: 'Baugruppe', hardware: 'Beschlag', parameters: 'Parameter', name: 'Name', shortName: 'Kurzwort',
  color: 'Farbe', position: 'Lage', rotation: 'Drehung', width: 'Breite', height: 'Höhe', depth: 'Tiefe',
  kg: 'Gewicht', quantity: 'Anzahl', steps: 'Montageschritt', boardIds: 'Teil im Schritt', headType: 'Kopfform',
  materialId: 'Werkstoff', customMaterials: 'eigener Werkstoff', customHardware: 'eigener Beschlag'
}
const WORDS_EN: Record<string, string> = {
  loads: 'load', joints: 'joint', fasteners: 'fastener', cutouts: 'cutout', boards: 'part', assemblies: 'assembly',
  hardware: 'hardware', parameters: 'parameter', name: 'name', shortName: 'short word', color: 'colour',
  position: 'position', rotation: 'rotation', width: 'width', height: 'height', depth: 'depth', kg: 'weight',
  quantity: 'quantity', steps: 'assembly step', boardIds: 'part in step', headType: 'head type', materialId: 'material',
  customMaterials: 'custom material', customHardware: 'custom hardware'
}

/** "cutouts[1].depth" → "Ausschnitt 2, Tiefe"; unknown fields stay as they are. */
function fieldWords(path: string, lang: string): string {
  const words = lang === 'de' ? WORDS_DE : WORDS_EN
  return path.split('.').map((seg) => {
    const m = seg.match(/^([^[]+)(?:\[(\d+)\])?$/)
    if (!m) return seg
    const w = words[m[1]] ?? m[1]
    return m[2] !== undefined ? `${w} ${Number(m[2]) + 1}` : w
  }).join(', ')
}

/** A value in words: a load by its weight, a joint by its kind, a text in quotes, else short JSON. */
function valueWords(x: unknown): string {
  if (typeof x === 'string') return `„${x}“`
  if (isRecord(x)) {
    if (typeof x.kg === 'number') return `${x.kg} kg`
    if (typeof x.name === 'string') return `„${x.name}“`
    if (typeof x.type === 'string') return String(x.type)
    if (typeof x.hardwareId === 'string') return `${x.hardwareId}${typeof x.quantity === 'number' ? ` × ${x.quantity}` : ''}`
  }
  const s = JSON.stringify(x) ?? String(x)
  return s.length > 40 ? s.slice(0, 39) + '…' : s
}

/** One line per change, in words, for the list after opening a file. */
export function formatLoadChange(c: LoadChange, lang: string): string {
  const de = lang === 'de'
  const field = c.field ? fieldWords(c.field, lang) : (de ? 'Eintrag' : 'entry')
  if (c.kind === 'duplicate') return de ? `${c.where}: zwei Einträge in „${field}“ haben dieselbe Kennung ${valueWords(c.before)}` : `${c.where}: two entries in "${field}" share the id ${valueWords(c.before)}`
  if (c.kind === 'removed') return `${c.where}: ${field} ${de ? 'entfernt' : 'removed'} (${valueWords(c.before)})`
  return `${c.where}: ${field} ${valueWords(c.before)} → ${valueWords(c.after)}`
}
