export type Unit = 'mm' | 'cm' | 'm'
export type MaterialCategory = 'solid_wood' | 'panel' | 'stone' | 'glass' | 'metal'
export type GrainDirection = 'width' | 'height' | 'depth'
export type JointType = 'butt' | 'miter' | 'dado' | 'rabbet' | 'dowel' | 'biscuit' | 'screw' | 'pocket_screw'
export type FastenerType = 'wood_screw' | 'confirmat' | 'dowel_pin' | 'biscuit' | 'pocket_screw'
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
