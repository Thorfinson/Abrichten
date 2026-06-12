import type { Material } from '../types/furniture'

export const materials: Material[] = [
  // Massivholz
  {
    id: 'buche',
    name: 'Buche',
    nameEn: 'Beech',
    category: 'solid_wood',
    density: 720,
    eModul: 14000,
    bendingStrength: 120,
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
    bendingStrength: 95,
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
    eModul: 12000,
    bendingStrength: 80,
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
    bendingStrength: 130,
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
    bendingStrength: 85,
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
    eModul: 3500,
    bendingStrength: 30,
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
    eModul: 2800,
    bendingStrength: 14,
    defaultThickness: [8, 10, 13, 16, 19, 22, 25],
    color: '#C8B896',
    grain: false
  },
  {
    id: 'multiplex-birke',
    name: 'Multiplex Birke',
    nameEn: 'Birch Plywood',
    category: 'panel',
    density: 700,
    eModul: 10000,
    bendingStrength: 60,
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
    eModul: 3500,
    bendingStrength: 20,
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
    bendingStrength: 55,
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
    bendingStrength: 58,
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
    eModul: 3600,
    bendingStrength: 32,
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
    eModul: 12000,
    bendingStrength: 110,
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
    bendingStrength: 45,
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
    bendingStrength: 120,
    compressiveStrength: 800,
    defaultThickness: [4, 6, 8, 10, 12, 15, 19],
    color: '#B0D8D8',
    grain: false
  },
  // Metall
  {
    id: 'aluminium',
    name: 'Aluminium',
    nameEn: 'Aluminium',
    category: 'metal',
    density: 2700,
    eModul: 70000,
    bendingStrength: 200,
    compressiveStrength: 200,
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
    bendingStrength: 250,
    compressiveStrength: 250,
    defaultThickness: [1, 1.5, 2, 3, 4, 5, 6, 8, 10],
    color: '#888890',
    grain: false
  },
  // Stein
  {
    id: 'schiefer',
    name: 'Schiefer',
    nameEn: 'Slate',
    category: 'stone',
    density: 2750,
    eModul: 20000,
    bendingStrength: 40,
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
    bendingStrength: 15,
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
    bendingStrength: 10,
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
    bendingStrength: 45,
    compressiveStrength: 400,
    defaultThickness: [6, 12, 20],
    color: '#E0E0E0',
    grain: false
  }
]

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
