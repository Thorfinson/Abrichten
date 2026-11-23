export type Unit = 'mm' | 'cm' | 'm'
export type MaterialCategory = 'solid_wood' | 'panel' | 'stone' | 'glass' | 'metal'
export type GrainDirection = 'width' | 'height' | 'depth'
export type JointType = 'butt' | 'miter' | 'dado' | 'rabbet' | 'dowel' | 'biscuit' | 'screw' | 'pocket_screw' | 'dovetail' | 'lap' | 'glued'
export type FastenerType = 'wood_screw' | 'confirmat' | 'dowel_pin' | 'biscuit' | 'pocket_screw' | 'angle_bracket' | 'joist_hanger' | 'nail'
export type HeadType = 'countersunk' | 'pan' | 'hex'
export type FastenerMaterial = 'steel' | 'stainless' | 'brass'

/**
 * What a part is, the way a cabinetmaker sorts it: decides material, edge and
 * surface requirements. Independent of the assembly tree (which is per cabinet
 * or compartment), so a project can be built by compartment and still be listed
 * and costed by role. The order is the order of the lists.
 *  visible      Sichtteil: front, end panel, filler/cover strip
 *  carcass      Korpus: bottoms, tops, sides, middle sides, shelves
 *  back         Rückwand
 *  substructure Unterkonstruktion: frame, battens, rails
 *  drawer       Schubkasten-Kasten (the box, not its front)
 *  worktop      Arbeitsplatte and what carries it
 *  plinth       Sockel
 *  appliance    Einbaugerät (oven, fridge … as a placeholder part)
 */
export const BOARD_ROLES = ['visible', 'carcass', 'back', 'substructure', 'drawer', 'worktop', 'plinth', 'appliance'] as const
export type BoardRole = (typeof BOARD_ROLES)[number]

export interface EdgeBanding {
  e1?: boolean  // front face edge (along width)
  e2?: boolean  // back face edge (along width)
  e3?: boolean  // left face edge (along depth)
  e4?: boolean  // right face edge (along depth)
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface AttachedHardware {
  hardwareId: string
  quantity: number
}

/** A cutout through the full thickness of a board, lying or standing: a rectangle (a
 *  hole inside, a notch — Ausklinkung — at the edge) or a round hole. It sits on the
 *  board's face (utils/boardFace): x along the face's first axis (u), z along its second
 *  (v), from the face's min corner; width × depth its size there (a circle: its diameter
 *  both ways). On a lying board that is x along the width and z along the depth, as before.
 *  Where it sits in the room and how its edges are named: utils/cutoutPlace.
 *  ponytail: rectangles and circles, always through the thickness. */
export interface BoardCutout {
  id: string
  /** Missing: a rectangle */
  shape?: 'circle'
  x: number      // mm along the face's first axis (u)
  z: number      // mm along the face's second axis (v)
  width: number  // mm along u
  depth: number  // mm along v
  /** The edges it is measured from (Bezugskanten) along u and v: at 0 ('min') or at the
   *  far end ('max'). x and z are its distances from these edges, so it keeps its place
   *  from them when the board changes size. Missing: measured from 0, shown from the nearer
   *  edge. Read it through utils/geometry (faceCutout, clampCutouts), never directly. */
  uFrom?: 'min' | 'max'
  vFrom?: 'min' | 'max'
}

/** A load placed on a board's top face: a w × d patch at x/z from the board's
 *  min corner in its width/depth plane (like cutouts), carrying kg. */
export interface PlacedLoad {
  id: string
  x: number   // mm along the width axis
  z: number   // mm along the depth axis
  kg: number
  w: number   // mm along the width axis
  d: number   // mm along the depth axis
}

export interface Board {
  id: string
  name: string
  width: number   // mm
  height: number  // mm
  depth: number   // mm
  position: Vec3  // mm
  rotation: Vec3  // degrees
  materialId: string
  color: string
  grainDirection?: GrainDirection
  /** Part role (Bauteilart) for lists and costing; missing = not assigned */
  role?: BoardRole
  /**
   * Part number within its assembly (1, 2, 3 …), fixed once given. With the
   * assembly's short word it is the part's label in every list and print:
   * "Herd 2" (utils/partLabel.ts). The store fills in missing numbers.
   */
  partNo?: number
  edgeBanding?: EdgeBanding
  cutouts?: BoardCutout[]
  hardware?: AttachedHardware[]
  /** Payload in kg on this board for the load simulation; missing = the global payload per shelf */
  loadKg?: number  /** Loads placed on the top face for the load simulation (a box of books, a TV) */
  loads?: PlacedLoad[]
  /** Weight of this part in kg (an appliance from its datasheet); missing = volume × material density */
  weightKg?: number
  // Formula strings for parametric dimensions (raw expression, e.g. "H - 40")
  widthFormula?: string
  heightFormula?: string
  depthFormula?: string
}

export interface Assembly {
  id: string
  name: string
  /** Parent assembly; missing = top level. The tree order is the array order among siblings. */
  parentId?: string
  visible: boolean
  /** Short word for the part labels ("Herd" → "Herd 2"); missing = the first word of the name */
  shortName?: string
  boards: Board[]
  joints: Joint[]
}

export interface Joint {
  id: string
  type: JointType
  boardA: string
  boardB: string
  position: Vec3
  fasteners: Fastener[]
  /** Workshop note, e.g. "schräg, vorgebohrt". Joints may reference boards in other assemblies. */
  note?: string
}

export interface Fastener {
  id: string
  type: FastenerType
  diameter: number  // mm
  length: number    // mm
  quantity: number
  headType: HeadType
  material: FastenerMaterial
}

export interface Material {
  id: string
  name: string
  nameEn: string
  category: MaterialCategory
  density: number              // kg/m³
  eModul: number               // N/mm²
  bendingStrength: number      // N/mm²
  compressiveStrength?: number // N/mm²
  /** Strength factor under permanent load (EN 1995-1-1 k_mod); missing = by category (data/materials.ts PERMANENT) */
  kmod?: number
  /** Creep factor (EN 1995-1-1 k_def): final deflection = (1 + k_def) × instant; missing = by category */
  kdef?: number
  defaultThickness: number[]   // mm
  color: string
  grain: boolean
}

/** One step of the assembly instruction (Montageanleitung): the boards installed in it,
 *  in the order of the steps. Fasteners are not stored: a joint belongs to the step in
 *  which the second of its two boards is installed (utils/assemblySteps.ts). */
export interface AssemblyStep {
  id: string
  title: string
  note?: string
  /** Boards installed in this step; a board is in at most one step */
  boardIds: string[]
}

export interface CustomHardwareItem {
  id: string
  name: string
  nameEn: string
  category: string
  drillingDiameter?: number
  unitPrice: number
  manufacturer?: string
}

export interface Project {
  id: string
  name: string
  assemblies: Assembly[]
  displayUnit: Unit
  language: 'de' | 'en'
  createdAt: string
  updatedAt: string
  parameters?: Record<string, number>
  materialPrices?: Record<string, number>  // price per m² in currency
  customMaterials?: Material[]
  customHardware?: CustomHardwareItem[]
  /** Assembly instruction steps in order; boards in no step are not planned yet */
  assemblySteps?: AssemblyStep[]
  laborHours?: number
  laborRate?: number    // per hour
  overheadPct?: number  // 0–1
}
