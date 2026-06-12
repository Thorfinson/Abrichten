import type { MaterialCategory, JointType, FastenerType } from '../types/furniture'

export interface JointRecommendation {
  jointType: JointType
  fasteners: {
    type: FastenerType
    diameterMm: number
    lengthMm: number
    spacingMm: number
    preDrillMm?: number
  }[]
  note_de: string
  note_en: string
  priority: number // lower = better recommendation
}

export interface JointRule {
  id: string
  condition: {
    boardThicknessMin?: number
    boardThicknessMax?: number
    materialCategories?: MaterialCategory[]
    loadBearing?: boolean
  }
  recommendations: JointRecommendation[]
}

export const jointRules: JointRule[] = [
  {
    id: 'panel-thin',
    condition: {
      boardThicknessMin: 13,
      boardThicknessMax: 22,
      materialCategories: ['panel']
    },
    recommendations: [
      {
        jointType: 'screw',
        fasteners: [{
          type: 'confirmat',
          diameterMm: 5,
          lengthMm: 50,
          spacingMm: 150,
          preDrillMm: 5
        }],
        note_de: 'Confirmat-Schrauben sind die Standardverbindung fuer Spanplatte und MDF. Vorbohrung 5mm, Schrauben alle 150mm.',
        note_en: 'Confirmat screws are the standard connection for chipboard and MDF. Pre-drill 5mm, screws every 150mm.',
        priority: 1
      },
      {
        jointType: 'dowel',
        fasteners: [{
          type: 'dowel_pin',
          diameterMm: 8,
          lengthMm: 30,
          spacingMm: 128
        }],
        note_de: 'Holzduebel 8x30mm mit Leim fuer unsichtbare Verbindung. Abstand 128mm (Rastermass).',
        note_en: 'Wood dowels 8x30mm with glue for invisible joint. Spacing 128mm (grid measure).',
        priority: 2
      }
    ]
  },
  {
    id: 'panel-thick',
    condition: {
      boardThicknessMin: 22,
      boardThicknessMax: 40,
      materialCategories: ['panel']
    },
    recommendations: [
      {
        jointType: 'screw',
        fasteners: [{
          type: 'confirmat',
          diameterMm: 7,
          lengthMm: 70,
          spacingMm: 150,
          preDrillMm: 7
        }],
        note_de: 'Grosse Confirmat 7x70 fuer dicke Platten. Vorbohrung 7mm.',
        note_en: 'Large confirmat 7x70 for thick panels. Pre-drill 7mm.',
        priority: 1
      }
    ]
  },
  {
    id: 'solid-standard',
    condition: {
      boardThicknessMin: 18,
      boardThicknessMax: 50,
      materialCategories: ['solid_wood']
    },
    recommendations: [
      {
        jointType: 'dowel',
        fasteners: [{
          type: 'dowel_pin',
          diameterMm: 8,
          lengthMm: 40,
          spacingMm: 100
        }],
        note_de: 'Holzduebel 8x40mm mit Leim. Klassische Massivholzverbindung. Bohrtiefe je Seite 20mm.',
        note_en: 'Wood dowels 8x40mm with glue. Classic solid wood joint. Drill depth 20mm per side.',
        priority: 1
      },
      {
        jointType: 'biscuit',
        fasteners: [{
          type: 'biscuit',
          diameterMm: 4,
          lengthMm: 56,
          spacingMm: 150
        }],
        note_de: 'Flachduebel Nr. 20 mit Leim. Schnell und praezise mit Flachduebelfraese.',
        note_en: 'Biscuit #20 with glue. Fast and precise with biscuit joiner.',
        priority: 2
      },
      {
        jointType: 'pocket_screw',
        fasteners: [{
          type: 'pocket_screw',
          diameterMm: 4,
          lengthMm: 32,
          spacingMm: 150
        }],
        note_de: 'Taschenlochschrauben fuer schnelle, starke Verbindung. Schraube von Rueckseite nicht sichtbar.',
        note_en: 'Pocket hole screws for fast, strong connection. Screw hidden from back side.',
        priority: 3
      }
    ]
  },
  {
    id: 'solid-thick',
    condition: {
      boardThicknessMin: 30,
      boardThicknessMax: 80,
      materialCategories: ['solid_wood']
    },
    recommendations: [
      {
        jointType: 'dado',
        fasteners: [],
        note_de: 'Nut-und-Feder oder Falzverbindung mit Leim. Fuer starke, grosse Bauteile.',
        note_en: 'Dado or rabbet joint with glue. For strong, large components.',
        priority: 1
      },
      {
        jointType: 'dowel',
        fasteners: [{
          type: 'dowel_pin',
          diameterMm: 10,
          lengthMm: 50,
          spacingMm: 100
        }],
        note_de: 'Grosse Holzduebel 10x50mm fuer starke Verbindungen.',
        note_en: 'Large wood dowels 10x50mm for strong joints.',
        priority: 2
      }
    ]
  },
  {
    id: 'stone-any',
    condition: {
      materialCategories: ['stone']
    },
    recommendations: [
      {
        jointType: 'butt',
        fasteners: [],
        note_de: 'Stein wird nur aufgelegt, NICHT verschraubt. Silikonpuffer zwischen Stein und Holz verwenden. Muss vollstaendig unterstuetzt sein.',
        note_en: 'Stone is placed on top only, NOT screwed. Use silicone buffers between stone and wood. Must be fully supported.',
        priority: 1
      }
    ]
  },
  {
    id: 'backpanel',
    condition: {
      boardThicknessMin: 3,
      boardThicknessMax: 8,
      materialCategories: ['panel']
    },
    recommendations: [
      {
        jointType: 'rabbet',
        fasteners: [{
          type: 'wood_screw',
          diameterMm: 3,
          lengthMm: 16,
          spacingMm: 200
        }],
        note_de: 'Rueckwand in Falz einlassen und mit kleinen Schrauben oder Klammern fixieren.',
        note_en: 'Set back panel into rabbet and fix with small screws or staples.',
        priority: 1
      }
    ]
  }
]

/** Find matching rules for given material category and board thickness */
export function findMatchingRules(
  materialCategory: MaterialCategory,
  thickness: number
): JointRule[] {
  return jointRules.filter(rule => {
    const c = rule.condition
    if (c.materialCategories && !c.materialCategories.includes(materialCategory)) return false
    if (c.boardThicknessMin !== undefined && thickness < c.boardThicknessMin) return false
    if (c.boardThicknessMax !== undefined && thickness > c.boardThicknessMax) return false
    return true
  })
}
