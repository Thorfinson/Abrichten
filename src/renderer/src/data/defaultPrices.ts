/**
 * Typical prices in €/m² for the built-in materials (data/materials.ts), so the
 * cost panel shows a plausible total before anyone has entered a price.
 *
 * Richtwerte, bitte anpassen: rough German retail / timber-merchant prices
 * (2026, incl. VAT) for the usual 18–20 mm board (backs and glass at their
 * common thickness, stone as worktop slab). A price set in the project
 * (project.materialPrices) always wins.
 */
export const DEFAULT_PRICES_PER_SQM: Readonly<Record<string, number>> = Object.freeze({
  // Massivholz (Leimholzplatte)
  buche: 65,
  eiche: 110,
  fichte: 30,
  birke: 70,
  kiefer: 28,
  // Plattenwerkstoffe
  mdf: 15,
  spanplatte: 12,
  hdf: 6,
  'multiplex-birke': 60,
  osb: 12,
  'eiche-furniert': 45,
  'buche-furniert': 40,
  'mdf-lackiert': 55,
  'hpl-kompakt': 180,
  // Glas
  floatglas: 45,
  esg: 110,
  // Metall (Blech, ca. 2 mm)
  aluminium: 55,
  stahl: 40,
  // Stein (Platte 20–30 mm)
  schiefer: 200,
  granit: 300,
  marmor: 350,
  keramik: 400
})

/** Where a material price comes from: the project, the built-in guide value, or nowhere. */
export type PriceSource = 'project' | 'default' | 'none'

export interface ResolvedPrice {
  /** €/m²; 0 when there is no price */
  price: number
  source: PriceSource
}

/**
 * Price per m² for a material: the project's own price first, then the built-in
 * guide value. Own keys only: ids come from project files, and "__proto__" or
 * "constructor" must not read Object.prototype.
 */
export function resolvePrice(materialId: string, projectPrices?: Readonly<Record<string, number>>): ResolvedPrice {
  if (projectPrices && Object.hasOwn(projectPrices, materialId) && Number.isFinite(projectPrices[materialId])) {
    return { price: projectPrices[materialId], source: 'project' }
  }
  if (Object.hasOwn(DEFAULT_PRICES_PER_SQM, materialId)) {
    return { price: DEFAULT_PRICES_PER_SQM[materialId], source: 'default' }
  }
  return { price: 0, source: 'none' }
}
