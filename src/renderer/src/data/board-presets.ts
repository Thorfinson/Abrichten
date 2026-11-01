import type { Board } from '../types/furniture'

/** Presets are created as placed (width = X, height = Y, depth = Z), so the
 *  thickness axis says how a part stands: lying parts have height = thickness,
 *  side panels width = thickness, backs and fronts depth = thickness. */
export interface BoardPreset {
  id: string
  labelKey: string        // i18n key
  width: number           // mm
  height: number          // mm
  depth: number           // mm
  materialId: string
  color: string
  icon: string            // emoji-like label for compact display
}

export const boardPresets: BoardPreset[] = [
  // --- Massivholz ---
  {
    id: 'brett',
    labelKey: 'presets.brett',
    width: 600,
    height: 18,
    depth: 400,
    materialId: 'buche',
    color: '#D4A574',
    icon: 'B'
  },
  {
    id: 'dachlatte',
    labelKey: 'presets.dachlatte',
    width: 1000,
    height: 24,
    depth: 48,
    materialId: 'fichte',
    color: '#F5DEB3',
    icon: 'D'
  },
  {
    id: 'kantholz',
    labelKey: 'presets.kantholz',
    // a beam, standing on edge (stiffer than lying flat)
    width: 2000,
    height: 80,
    depth: 60,
    materialId: 'fichte',
    color: '#F5DEB3',
    icon: 'K'
  },
  {
    id: 'leiste',
    labelKey: 'presets.leiste',
    width: 1000,
    height: 10,
    depth: 30,
    materialId: 'buche',
    color: '#D4A574',
    icon: 'L'
  },
  {
    id: 'bohle',
    labelKey: 'presets.bohle',
    width: 2000,
    height: 40,
    depth: 250,
    materialId: 'eiche',
    color: '#B8860B',
    icon: 'Bo'
  },
  // --- Plattenwerkstoffe ---
  {
    id: 'regal-seite',
    labelKey: 'presets.regalSeite',
    width: 19,
    height: 800,
    depth: 400,
    materialId: 'spanplatte',
    color: '#C8B896',
    icon: 'RS'
  },
  {
    id: 'regal-boden',
    labelKey: 'presets.regalBoden',
    width: 800,
    height: 19,
    depth: 400,
    materialId: 'spanplatte',
    color: '#C8B896',
    icon: 'RB'
  },
  {
    id: 'rueckwand',
    labelKey: 'presets.rueckwand',
    width: 800,
    height: 800,
    depth: 3,
    materialId: 'mdf',
    color: '#C4A882',
    icon: 'Rw'
  },
  {
    id: 'multiplex-platte',
    labelKey: 'presets.multiplexPlatte',
    width: 600,
    height: 18,
    depth: 400,
    materialId: 'multiplex-birke',
    color: '#E8D5B7',
    icon: 'MP'
  },
  // --- Stein ---
  {
    id: 'arbeitsplatte-granit',
    labelKey: 'presets.arbeitsplatteGranit',
    width: 2000,
    height: 30,
    depth: 600,
    materialId: 'granit',
    color: '#808080',
    icon: 'AG'
  },
  {
    id: 'arbeitsplatte-keramik',
    labelKey: 'presets.arbeitsplatteKeramik',
    width: 2000,
    height: 12,
    depth: 600,
    materialId: 'keramik',
    color: '#E0E0E0',
    icon: 'AK'
  },
  {
    id: 'fensterbank',
    labelKey: 'presets.fensterbank',
    width: 1200,
    height: 20,
    depth: 250,
    materialId: 'marmor',
    color: '#F5F5F5',
    icon: 'Fb'
  },
  // --- Geräte (Platzhalter-Körper für Küchenplanung) ---
  {
    id: 'herd',
    labelKey: 'presets.herd',
    width: 600,
    height: 850,
    depth: 600,
    materialId: 'stahl',
    color: '#4A4A4A',
    icon: 'He'
  },
  {
    id: 'kochfeld',
    labelKey: 'presets.kochfeld',
    width: 590,
    height: 45,
    depth: 520,
    materialId: 'floatglas',
    color: '#1A1A1A',
    icon: 'Kf'
  },
  {
    id: 'spuele',
    labelKey: 'presets.spuele',
    width: 780,
    height: 190,
    depth: 480,
    materialId: 'stahl',
    color: '#C0C0C0',
    icon: 'Sp'
  },
  {
    id: 'geschirrspueler',
    labelKey: 'presets.geschirrspueler',
    width: 598,
    height: 815,
    depth: 550,
    materialId: 'stahl',
    color: '#5A5A5A',
    icon: 'Gs'
  }
]

export function getPresetById(id: string): BoardPreset | undefined {
  return boardPresets.find((p) => p.id === id)
}

/** Convert a preset to a Board shape (without id, that's assigned by the store) */
export function presetToBoard(preset: BoardPreset): Omit<Board, 'id'> {
  return {
    name: preset.id, // overwritten with the translated name by the caller
    width: preset.width,
    height: preset.height,
    depth: preset.depth,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    materialId: preset.materialId,
    color: preset.color
  }
}
