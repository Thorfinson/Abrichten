import type { Material, MaterialCategory } from '../types/furniture'

// eModul = mean bending modulus in N/mm². Solid wood: along the grain, clear wood
// (DIN 68364); panels: the EN minimum for the usual 13–20 mm board.
// bendingStrength = characteristic bending strength f_m,k in N/mm² (5 % fractile, what a
// real board with knots and scatter reaches), not the clear-wood laboratory mean.
// compressiveStrength = f_c,0,k along the grain / the material's compressive strength.
export const materials: Material[] = [
  // Massivholz
  {
    id: 'buche',
    name: 'Buche',
    nameEn: 'Beech',
    category: 'solid_wood',
    density: 720,
    eModul: 14000,
    bendingStrength: 35,     // EN 338 D35 (graded beech: D30–D40 by grade, EN 1912)
    compressiveStrength: 25, // EN 338:2009 D35
    defaultThickness: [18, 20, 25, 30, 40, 50],
    color: '#D4A574',
    grain: true
  },
  {
    id: 'eiche',
    name: 'Eiche',
    nameEn: 'Oak',
    category: 'solid_wood',
    density: 670,
    eModul: 12000,
    bendingStrength: 30,     // EN 338 D30 (oak, EN 1912)
    compressiveStrength: 23, // EN 338:2009 D30
    defaultThickness: [18, 20, 25, 30, 40, 50],
    color: '#B8860B',
    grain: true
  },
  {
    id: 'fichte',
    name: 'Fichte',
    nameEn: 'Spruce',
    category: 'solid_wood',
    density: 470,
    eModul: 11000,     // EN 338 C24 E0,mean (= DIN 68364 clear spruce)
    bendingStrength: 24,     // EN 338 C24
    compressiveStrength: 21, // EN 338 C24
    defaultThickness: [18, 20, 24, 30, 40],
    color: '#F5DEB3',
    grain: true
  },
  {
    id: 'birke',
    name: 'Birke',
    nameEn: 'Birch',
    category: 'solid_wood',
    density: 650,
    eModul: 15000,
    bendingStrength: 35,     // not graded in EN 1912; EN 338 D35 assumed
    compressiveStrength: 25, // EN 338:2009 D35
    defaultThickness: [18, 20, 25, 30, 40],
    color: '#FAEBD7',
    grain: true
  },
  {
    id: 'kiefer',
    name: 'Kiefer',
    nameEn: 'Pine',
    category: 'solid_wood',
    density: 520,
    eModul: 12000,
    bendingStrength: 24,     // EN 338 C24
    compressiveStrength: 21, // EN 338 C24
    defaultThickness: [18, 20, 24, 30, 40],
    color: '#DEB887',
    grain: true
  },
  // Plattenwerkstoffe
  {
    id: 'mdf',
    name: 'MDF',
    nameEn: 'MDF',
    category: 'panel',
    density: 750,
    eModul: 2200,      // EN 622-5 MDF, >12–19 mm
    bendingStrength: 20, // EN 622-5 MDF, >12–19 mm
    kmod: 0.2, kdef: 2.25, // EN 1995-1-1 MDF.LA
    defaultThickness: [3, 6, 9, 12, 16, 19, 22, 25],
    color: '#C4A882',
    grain: false
  },
  {
    id: 'spanplatte',
    name: 'Spanplatte',
    nameEn: 'Chipboard',
    category: 'panel',
    density: 680,
    eModul: 1600,      // EN 312 P2 (furniture), >13–20 mm
    bendingStrength: 11, // EN 312 P2, >13–20 mm
    kmod: 0.3, kdef: 2.25, // EN 1995-1-1 P4/P5 (P2 is not listed)
    defaultThickness: [8, 10, 13, 16, 19, 22, 25],
    color: '#C8B896',
    grain: false
  },
  {
    id: 'hdf',
    name: 'HDF (Hartfaser)',
    nameEn: 'HDF (Hardboard)',
    category: 'panel',
    density: 850,
    eModul: 2700,      // EN 622-5, >4–6 mm
    bendingStrength: 23, // EN 622-5, >4–6 mm
    kmod: 0.3, kdef: 2.25, // EN 1995-1-1 hardboard HB.LA
    defaultThickness: [3, 4, 5, 6, 8],
    color: '#B89F7A',
    grain: false
  },
  {
    id: 'multiplex-birke',
    name: 'Multiplex Birke',
    nameEn: 'Birch Plywood',
    category: 'panel',
    density: 700,
    eModul: 10000,
    bendingStrength: 40, // birch plywood 15–21 mm along the face grain (Handbook of Finnish Plywood)
    kmod: 0.6, kdef: 0.8, // EN 1995-1-1 plywood
    defaultThickness: [4, 6, 9, 12, 15, 18, 21, 24, 27, 30],
    color: '#E8D5B7',
    grain: true
  },
  {
    id: 'osb',
    name: 'OSB',
    nameEn: 'OSB',
    category: 'panel',
    density: 620,
    eModul: 3500,      // EN 300 OSB/3, major axis
    bendingStrength: 20, // EN 300 OSB/3, >10–18 mm, major axis (minor axis: 10)
    kmod: 0.4, kdef: 1.5, // EN 1995-1-1 OSB/3
    defaultThickness: [9, 12, 15, 18, 22, 25],
    color: '#C9B48C',
    grain: false
  },
  // Furniersperrholz
  {
    id: 'eiche-furniert',
    name: 'Eiche furniert',
    nameEn: 'Oak Veneer Plywood',
    category: 'panel',
    density: 700,
    eModul: 9000,
    bendingStrength: 30, // EN 636 bending class F30 assumed
    kmod: 0.6, kdef: 0.8, // EN 1995-1-1 plywood
    defaultThickness: [12, 15, 18, 21, 25],
    color: '#B8860B',
    grain: true
  },
  {
    id: 'buche-furniert',
    name: 'Buche furniert',
    nameEn: 'Beech Veneer Plywood',
    category: 'panel',
    density: 710,
    eModul: 10000,
    bendingStrength: 30, // EN 636 bending class F30 assumed
    kmod: 0.6, kdef: 0.8, // EN 1995-1-1 plywood
    defaultThickness: [12, 15, 18, 21, 25],
    color: '#D4A574',
    grain: true
  },
  {
    id: 'mdf-lackiert',
    name: 'MDF lackiert',
    nameEn: 'Lacquered MDF',
    category: 'panel',
    density: 760,
    eModul: 2200,      // same board as MDF (EN 622-5, >12–19 mm)
    bendingStrength: 20, // EN 622-5 MDF, >12–19 mm
    kmod: 0.2, kdef: 2.25, // EN 1995-1-1 MDF.LA
    defaultThickness: [12, 16, 19, 22, 25],
    color: '#F0F0F0',
    grain: false
  },
  {
    id: 'hpl-kompakt',
    name: 'HPL Kompaktplatte',
    nameEn: 'HPL Compact Laminate',
    category: 'panel',
    density: 1380,
    eModul: 9000,      // EN 438-4 compact (CGS), flexural modulus minimum
    bendingStrength: 80, // EN 438-4 compact (CGS), flexural strength minimum
    kmod: 0.6, kdef: 0.8, // not in EN 1995; assumed like plywood
    defaultThickness: [6, 8, 10, 12, 13, 20],
    color: '#E8E0D8',
    grain: false
  },
  // Glas
  {
    id: 'floatglas',
    name: 'Floatglas',
    nameEn: 'Float Glass',
    category: 'glass',
    density: 2500,
    eModul: 70000,
    bendingStrength: 45, // EN 572-1 f_g,k
    kmod: 0.25, kdef: 0, // DIN 18008-1, permanent load
    compressiveStrength: 800,
    defaultThickness: [4, 6, 8, 10, 12],
    color: '#C8E8E8',
    grain: false
  },
  {
    id: 'esg',
    name: 'ESG (Einscheiben-Sicherheitsglas)',
    nameEn: 'Tempered Safety Glass',
    category: 'glass',
    density: 2500,
    eModul: 70000,
    bendingStrength: 120, // EN 12150-1 f_b,k (thermally toughened)
    compressiveStrength: 800,
    defaultThickness: [4, 6, 8, 10, 12, 15, 19],
    color: '#B0D8D8',
    grain: false
  },
  // Metall (strength = yield strength)
  {
    id: 'aluminium',
    name: 'Aluminium',
    nameEn: 'Aluminium',
    category: 'metal',
    density: 2700,
    eModul: 70000,
    bendingStrength: 150, // EN 755-2 EN AW-6060 T66, R_p0.2 for 3–25 mm
    compressiveStrength: 150,
    defaultThickness: [1, 1.5, 2, 3, 4, 5, 6, 8, 10],
    color: '#C0C0C8',
    grain: false
  },
  {
    id: 'stahl',
    name: 'Stahl',
    nameEn: 'Steel',
    category: 'metal',
    density: 7850,
    eModul: 210000,
    bendingStrength: 235, // EN 10025-2 S235, f_y
    compressiveStrength: 235,
    defaultThickness: [1, 1.5, 2, 3, 4, 5, 6, 8, 10],
    color: '#888890',
    grain: false
  },
  // Stein (flexural strength per EN 12372; natural stone scatters widely)
  {
    id: 'schiefer',
    name: 'Schiefer',
    nameEn: 'Slate',
    category: 'stone',
    density: 2750,
    eModul: 20000,
    bendingStrength: 40, // slate slabs typically 30–60
    compressiveStrength: 100,
    defaultThickness: [20, 30, 40],
    color: '#708090',
    grain: false
  },
  {
    id: 'granit',
    name: 'Granit',
    nameEn: 'Granite',
    category: 'stone',
    density: 2650,
    eModul: 50000,
    bendingStrength: 15, // granite typically 10–20
    compressiveStrength: 160,
    defaultThickness: [20, 30, 40],
    color: '#808080',
    grain: false
  },
  {
    id: 'marmor',
    name: 'Marmor',
    nameEn: 'Marble',
    category: 'stone',
    density: 2700,
    eModul: 30000,
    bendingStrength: 10, // marble typically 8–15
    compressiveStrength: 80,
    defaultThickness: [20, 30],
    color: '#F5F5F5',
    grain: false
  },
  {
    id: 'keramik',
    name: 'Keramik (Neolith)',
    nameEn: 'Ceramic (Neolith)',
    category: 'stone',
    density: 2400,
    eModul: 70000,
    bendingStrength: 45, // EN ISO 10545-4, sintered stone typically 45–55 (ISO 13006 BIa: ≥ 35)
    compressiveStrength: 400,
    defaultThickness: [6, 12, 20],
    color: '#E0E0E0',
    grain: false
  }
]

/**
 * Load duration: the load simulation takes every load as permanent (EN 1995-1-1, service
 * class 1, indoors). k_mod scales the strength (Table 3.1, permanent action) and k_def the
 * creep: the final deflection is (1 + k_def) × the instant one (2.3.2.2, Table 3.2). Per
 * category unless a material sets its own: solid timber 0.6 / 0.6, other panels as
 * particleboard P4/P5; glass, stone and metal keep their strength and do not creep
 * (float glass sets k_mod 0.25, DIN 18008-1).
 */
const PERMANENT: Record<MaterialCategory, { kmod: number; kdef: number }> = {
  solid_wood: { kmod: 0.6, kdef: 0.6 },
  panel: { kmod: 0.3, kdef: 2.25 },
  stone: { kmod: 1, kdef: 0 },
  glass: { kmod: 1, kdef: 0 },
  metal: { kmod: 1, kdef: 0 }
}

/** The material under permanent load: strengths × k_mod, stiffness ÷ (1 + k_def) (the final deflection). */
export function permanentMaterial(m: Material): Material {
  const kmod = m.kmod ?? PERMANENT[m.category].kmod, kdef = m.kdef ?? PERMANENT[m.category].kdef
  return {
    ...m,
    eModul: m.eModul / (1 + kdef),
    bendingStrength: m.bendingStrength * kmod,
    compressiveStrength: m.compressiveStrength === undefined ? undefined : m.compressiveStrength * kmod
  }
}

/**
 * Material safety factor γ_M by category: wood and wood-based panels 1.3 (EN 1995-1-1,
 * solid timber / particleboard), stone and glass 2.0 (brittle, wide scatter), metal 1.1
 * (EN 1993-1-1 γ_M0 = 1.0, rounded up). A board is flagged once it uses 1/γ_M of its strength.
 */
export const GAMMA_M: Record<MaterialCategory, number> = {
  solid_wood: 1.3,
  panel: 1.3,
  stone: 2.0,
  glass: 2.0,
  metal: 1.1
}

export function getMaterialById(id: string, customMaterials?: Material[]): Material | undefined {
  if (customMaterials?.length) {
    const custom = customMaterials.find(m => m.id === id)
    if (custom) return custom
  }
  return materials.find(m => m.id === id)
}

export function getMaterialsByCategory(category: Material['category']): Material[] {
  return materials.filter(m => m.category === category)
}
