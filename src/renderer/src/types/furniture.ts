export type Unit = 'mm' | 'cm' | 'm'
export type MaterialCategory = 'solid_wood' | 'panel' | 'stone' | 'glass' | 'metal'
export type GrainDirection = 'width' | 'height' | 'depth'
export type JointType = 'butt' | 'miter' | 'dado' | 'rabbet' | 'dowel' | 'biscuit' | 'screw' | 'pocket_screw' | 'dovetail' | 'lap' | 'glued'
export type FastenerType = 'wood_screw' | 'confirmat' | 'dowel_pin' | 'biscuit' | 'pocket_screw' | 'angle_bracket' | 'joist_hanger' | 'nail'
export type HeadType = 'countersunk' | 'pan' | 'hex'
export type FastenerMaterial = 'steel' | 'stainless' | 'brass'

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

/** Rectangular cutout through the full board thickness (height axis),
 *  e.g. for a cooktop or sink in a worktop. x/z are measured from the
 *  board's min-corner in the width/depth plane.
 *  ponytail: rectangles only, always through-thickness — polygonal or
 *  partial-depth cutouts would need a CSG library. */
export interface BoardCutout {
  id: string
  x: number      // mm from board left edge (width axis)
  z: number      // mm from board front edge (depth axis)
  width: number  // mm along width axis
  depth: number  // mm along depth axis
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
  edgeBanding?: EdgeBanding
  cutouts?: BoardCutout[]
  hardware?: AttachedHardware[]
  // Formula strings for parametric dimensions (raw expression, e.g. "H - 40")
  widthFormula?: string
  heightFormula?: string
  depthFormula?: string
}

export interface Assembly {
  id: string
  name: string
  visible: boolean
  /** X-ray highlight: group edges drawn through all other geometry */
  highlight?: boolean
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
  defaultThickness: number[]   // mm
  color: string
  grain: boolean
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
  laborHours?: number
  laborRate?: number    // per hour
  overheadPct?: number  // 0–1
}
