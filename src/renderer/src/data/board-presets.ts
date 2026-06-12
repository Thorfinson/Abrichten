import type { Board } from '../types/furniture'

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
    height: 400,
    depth: 18,
    materialId: 'buche',
    color: '#D4A574',
    icon: 'B'
  },
  {
    id: 'dachlatte',
    labelKey: 'presets.dachlatte',
    width: 1000,
    height: 48,
    depth: 24,
    materialId: 'fichte',
    color: '#F5DEB3',
    icon: 'D'
  },
  {
    id: 'kantholz',
    labelKey: 'presets.kantholz',
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
    height: 30,
    depth: 10,
    materialId: 'buche',
    color: '#D4A574',
    icon: 'L'
  },
  {
    id: 'bohle',
    labelKey: 'presets.bohle',
    width: 2000,
    height: 250,
    depth: 40,
    materialId: 'eiche',
    color: '#B8860B',
    icon: 'Bo'
  },
  // --- Plattenwerkstoffe ---
  {
    id: 'regal-seite',
    labelKey: 'presets.regalSeite',
    width: 400,
    height: 800,
    depth: 19,
    materialId: 'spanplatte',
    color: '#C8B896',
    icon: 'RS'
  },
  {
    id: 'regal-boden',
    labelKey: 'presets.regalBoden',
    width: 800,
    height: 400,
    depth: 19,
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
    height: 400,
    depth: 18,
    materialId: 'multiplex-birke',
    color: '#E8D5B7',
    icon: 'MP'
  },
  // --- Stein ---
  {
    id: 'arbeitsplatte-granit',
    labelKey: 'presets.arbeitsplatteGranit',
    width: 2000,
    height: 600,
    depth: 30,
    materialId: 'granit',
    color: '#808080',
    icon: 'AG'
  },
  {
    id: 'arbeitsplatte-keramik',
    labelKey: 'presets.arbeitsplatteKeramik',
    width: 2000,
    height: 600,
    depth: 12,
    materialId: 'keramik',
    color: '#E0E0E0',
    icon: 'AK'
  },
  {
    id: 'fensterbank',
    labelKey: 'presets.fensterbank',
    width: 1200,
    height: 250,
    depth: 20,
    materialId: 'marmor',
    color: '#F5F5F5',
    icon: 'Fb'
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
