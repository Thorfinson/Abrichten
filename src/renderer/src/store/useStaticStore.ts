import { useMemo } from 'react'
import { create } from 'zustand'
import type { Assembly, CustomHardwareItem, Material } from '../types/furniture'
import { simulateStatics, type StaticSimulation } from '../services/static-sim'
import { useProjectStore } from './useProjectStore'
import { designLockedIn, useUIStore } from './useUIStore'

/** Exaggeration of the deformation drawn when it is shown. */
export const DEFORMATION_SCALE = 20
/** Load placed by a click in the "Last setzen" mode, kg (default of its field). */
export const DEFAULT_PLACE_KG = 10

/** What the heat map shows: stress / strength, or deflection against span/200. */
export type StaticResultType = 'stress' | 'deflection'
/** Colour range of the heat map, see `scaleMode` */
export type StaticScaleMode = 'model' | 'board' | 'absolute'

/** Highest field value of the rated boards (stress or sag share), the top of the 'model' colour range. */
export function modelFieldMax(sim: StaticSimulation, type: StaticResultType): number {
  let max = 0
  for (const r of sim.results.values()) {
    if (r.status === 'unsupported' || r.status === 'wallHung') continue
    const values = type === 'stress' ? r.field.u : r.field.sag
    for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i]
  }
  return max
}

interface StaticState {
  /** Draw the heat map displaced by the deflection × DEFORMATION_SCALE */
  showDeformation: boolean
  toggleDeformation: () => void
  resultType: StaticResultType
  setResultType: (t: StaticResultType) => void
  /** Contour lines at 25 / 50 / 75 / 100 % (of the colour scale) */
  showContours: boolean
  toggleContours: () => void
  /** Colour range: 'model' = 0 … the highest value in the whole model (FEA style, the default:
   *  hot spots show at any load level while lightly used boards stay green), 'board' = 0 … each
   *  board's own maximum, 'absolute' = 0 … 100 % (100 % = breaks) */
  scaleMode: StaticScaleMode
  setScaleMode: (mode: StaticScaleMode) => void
  /** "Last setzen": a click on the top of a lying board places a load there */
  placingLoad: boolean
  setPlacingLoad: (on: boolean) => void
  placeKg: number
  setPlaceKg: (kg: number) => void
}

export const useStaticStore = create<StaticState>((set) => ({
  showDeformation: false,
  toggleDeformation: () => set((s) => ({ showDeformation: !s.showDeformation })),
  resultType: 'stress',
  setResultType: (resultType) => set({ resultType }),
  showContours: true,
  toggleContours: () => set((s) => ({ showContours: !s.showContours })),
  scaleMode: 'model',
  setScaleMode: (scaleMode) => set({ scaleMode }),
  placingLoad: false,
  setPlacingLoad: (placingLoad) => set({ placingLoad }),
  placeKg: DEFAULT_PLACE_KG,
  setPlaceKg: (placeKg) => set({ placeKg: Math.max(0, placeKg) })
}))

// One simulation shared by the heat map, its legend and the summary: it reruns only when
// the boards, the payload or the custom materials / hardware change. Inside, every
// board's finite-element solution is cached on its inputs (services/static-sim.ts), so a
// change re-solves only the boards it reaches.
let cache: {
  assemblies: Assembly[]; payloadKg: number; customMaterials?: Material[]; customHardware?: CustomHardwareItem[]; result: StaticSimulation
} | null = null

/** The load simulation of the visible assemblies, memoised on its inputs. */
export function staticSimulation(
  assemblies: Assembly[], payloadKg: number, customMaterials?: Material[], customHardware?: CustomHardwareItem[]
): StaticSimulation {
  if (cache && cache.assemblies === assemblies && cache.payloadKg === payloadKg &&
    cache.customMaterials === customMaterials && cache.customHardware === customHardware) {
    return cache.result
  }
  const visible = assemblies.filter((a) => a.visible !== false)
  const boards = visible.flatMap((a) => a.boards)
  // joints may join boards of different assemblies; one into a hidden assembly is skipped there
  const joints = visible.flatMap((a) => a.joints)
  const result = simulateStatics(boards, { payloadKg, customMaterials, customHardware, joints })
  cache = { assemblies, payloadKg, customMaterials, customHardware, result }
  return result
}

/** React hook: the current load simulation. */
export function useStaticSimulation(): StaticSimulation {
  const assemblies = useProjectStore((s) => s.project.assemblies)
  const customMaterials = useProjectStore((s) => s.project.customMaterials)
  const customHardware = useProjectStore((s) => s.project.customHardware)
  const payloadKg = useUIStore((s) => s.staticLoadKg)
  return useMemo(() => staticSimulation(assemblies, payloadKg, customMaterials, customHardware), [assemblies, payloadKg, customMaterials, customHardware])
}

// Test/debug access, like __projectStore and __uiStore; __staticSimulation is the last run
// Placing a load changes the design: the assembly workspace switches it off
useUIStore.subscribe((s, prev) => {
  if (designLockedIn(s) && !designLockedIn(prev)) useStaticStore.getState().setPlacingLoad(false)
})

declare global { interface Window { __staticStore?: unknown; __staticSimulation?: () => StaticSimulation | null } }
if (typeof window !== 'undefined') {
  window.__staticStore = useStaticStore
  window.__staticSimulation = () => cache?.result ?? null
}
