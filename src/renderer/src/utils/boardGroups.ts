import type { Assembly, Board, BoardRole, Material } from '../types/furniture'
import { getMaterialById } from '../data/materials'
import { cuttingDims } from './cuttingDims'
import { groupByRole, roleKey } from './boardRole'

/**
 * Colour per part role: the group swatches in the parts column. Chosen to stay
 * apart on the dark chrome and from each other in lightness, not hue alone.
 */
export const ROLE_COLORS: Readonly<Record<BoardRole, string>> = Object.freeze({
  visible: '#E8A54B',
  carcass: '#6FA8FF',
  back: '#B58A5A',
  substructure: '#D8C08A',
  drawer: '#C79BE0',
  worktop: '#8E99A6',
  plinth: '#7FD3A0',
  appliance: '#5A616B'
})
/** Parts without a role in the role view */
export const NO_ROLE_COLOR = '#E5484D'

export interface GroupedBoard { assemblyId: string; board: Board }
export interface BoardGroup {
  /** Stable key: the role, 'none', or "<materialId>|<thickness>" */
  key: string
  /** i18n key (role groups) or display text (material groups) */
  label: string
  labelIsKey: boolean
  color: string
  items: GroupedBoard[]
}

/**
 * Parts of the given assemblies as flat groups: by part role (in the order of the
 * roles, parts without one last) or by material and thickness (material name, then
 * thickness). Parts keep their tree order within a group.
 */
export function groupBoards(
  assemblies: readonly Assembly[],
  by: 'role' | 'material',
  customMaterials?: Material[],
  lang: 'de' | 'en' = 'de'
): BoardGroup[] {
  const items: GroupedBoard[] = assemblies.flatMap((a) => a.boards.map((board) => ({ assemblyId: a.id, board })))
  if (by === 'role') {
    return groupByRole(items, (i) => i.board.role).map((g) => ({
      key: g.role ?? 'none',
      label: roleKey(g.role),
      labelIsKey: true,
      color: g.role ? ROLE_COLORS[g.role] : NO_ROLE_COLOR,
      items: g.items
    }))
  }
  const groups = new Map<string, BoardGroup & { name: string; thickness: number }>()
  for (const it of items) {
    const thickness = Math.round(cuttingDims(it.board).thickness * 10) / 10
    const key = `${it.board.materialId}|${thickness}`
    let g = groups.get(key)
    if (!g) {
      const mat = getMaterialById(it.board.materialId, customMaterials)
      const name = mat ? (lang === 'de' ? mat.name : mat.nameEn) : it.board.materialId
      g = { key, label: `${name} ${String(thickness).replace('.', lang === 'de' ? ',' : '.')} mm`, labelIsKey: false,
        color: mat?.color ?? it.board.color, items: [], name, thickness }
      groups.set(key, g)
    }
    g.items.push(it)
  }
  return [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name, lang) || a.thickness - b.thickness) // part-name-ok: material groups, not parts
    .map((g) => ({ key: g.key, label: g.label, labelIsKey: g.labelIsKey, color: g.color, items: g.items }))
}
