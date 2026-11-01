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
