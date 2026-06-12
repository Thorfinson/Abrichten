import type { FastenerType, HeadType } from '../types/furniture'

export interface FastenerSpec {
  type: FastenerType
  name: string
  nameEn: string
  diameters: number[]     // mm
  lengths: number[]       // mm
  headType: HeadType
  preDrillDiameter?: (screwDiameter: number) => number
  description: string
  descriptionEn: string
}

export const fastenerSpecs: FastenerSpec[] = [
  {
    type: 'wood_screw',
    name: 'Holzschraube',
    nameEn: 'Wood Screw',
    diameters: [3, 3.5, 4, 4.5, 5, 6],
    lengths: [16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80],
    headType: 'countersunk',
    preDrillDiameter: (d) => d * 0.7,
    description: 'Universal-Holzschraube mit Senkkopf. Vorbohrung empfohlen bei Hartholz.',
    descriptionEn: 'Universal wood screw with countersunk head. Pre-drilling recommended for hardwood.'
  },
  {
    type: 'confirmat',
    name: 'Confirmat / Euroschraube',
    nameEn: 'Confirmat / Euro Screw',
    diameters: [5, 7],
    lengths: [40, 50, 70],
    headType: 'hex',
    preDrillDiameter: (d) => d === 5 ? 3 : 4.5,
    description: 'Spezialschraube fuer Plattenwerkstoffe. Vorbohrung 5mm bei 5er, 7mm bei 7er Confirmat.',
    descriptionEn: 'Special screw for panel products. Pre-drill 5mm for 5mm, 7mm for 7mm confirmat.'
  },
  {
    type: 'dowel_pin',
    name: 'Holzduebel',
    nameEn: 'Wood Dowel',
    diameters: [6, 8, 10],
    lengths: [30, 35, 40, 50],
    headType: 'countersunk',
    preDrillDiameter: (d) => d,
    description: 'Gerillter Holzduebel mit Leim. Unsichtbare Verbindung.',
    descriptionEn: 'Fluted wood dowel with glue. Invisible joint.'
  },
  {
    type: 'biscuit',
    name: 'Flachduebel / Lamellenduebel',
    nameEn: 'Biscuit / Plate Dowel',
    diameters: [4],
    lengths: [47, 53, 56],  // #0, #10, #20
    headType: 'countersunk',
    description: 'Lamellenduebel Nr. 0/10/20. Benoetigt Flachduebelfraese.',
    descriptionEn: 'Biscuit #0/#10/#20. Requires biscuit joiner.'
  },
  {
    type: 'pocket_screw',
    name: 'Taschenlochschraube',
    nameEn: 'Pocket Hole Screw',
    diameters: [4, 4.8],
    lengths: [25, 32, 38, 50, 63],
    headType: 'pan',
    description: 'Selbstschneidende Schraube fuer Taschenlochverbindungen. Benoetigt Taschenlochbohrvorrichtung.',
    descriptionEn: 'Self-tapping screw for pocket hole joints. Requires pocket hole jig.'
  }
]

export function getFastenerSpec(type: FastenerType): FastenerSpec | undefined {
  return fastenerSpecs.find(f => f.type === type)
}
