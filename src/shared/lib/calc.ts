/**
 * Business calculations used by the UI. Aggregates (populations, balances,
 * totals) are computed in Postgres from the ledgers; these functions derive
 * ratios and conversions from those figures and are unit-tested.
 */

export interface UnitLike {
  dimension: 'count' | 'mass' | 'volume' | 'area' | 'length' | string
  to_base: number
}

/** Convert a quantity between two units of the same dimension. */
export function convertQuantity(quantity: number, from: UnitLike, to: UnitLike): number {
  if (from.dimension !== to.dimension) {
    throw new Error(`Cannot convert ${from.dimension} into ${to.dimension}`)
  }
  return round(quantity * (from.to_base / to.to_base), 4)
}

/** Deaths as a percentage of the animals at risk. Null when nothing was at risk. */
export function mortalityRate(deaths: number, atRisk: number): number | null {
  if (!(atRisk > 0)) return null
  return round((100 * deaths) / atRisk, 2)
}

/**
 * Hen-day egg production: eggs laid / (hens × days) × 100.
 * Null when there were no hen-days, so a new flock is not shown as 0%.
 */
export function henDayProduction(eggs: number, averageHens: number, days: number): number | null {
  const henDays = averageHens * days
  if (!(henDays > 0)) return null
  return round((100 * eggs) / henDays, 1)
}

/** Feed per head in grams, from kilograms of feed. */
export function feedPerHeadGrams(feedKg: number, head: number): number | null {
  if (!(head > 0)) return null
  return round((feedKg * 1000) / head, 1)
}

/** Estimated biomass in kg from an (estimated) count and sampled average weight in grams. */
export function estimatedBiomassKg(count: number, avgWeightG: number | null | undefined): number | null {
  if (avgWeightG === null || avgWeightG === undefined || !(count >= 0)) return null
  return round((count * avgWeightG) / 1000, 1)
}

/** Feed conversion ratio: kg of feed per kg of weight gained. */
export function feedConversionRatio(feedKg: number, weightGainKg: number): number | null {
  if (!(weightGainKg > 0)) return null
  return round(feedKg / weightGainKg, 2)
}

/**
 * Recorded income minus recorded expenses. This is a CASH operating surplus,
 * not accounting profit: it excludes depreciation, unpaid bills, stock
 * valuation and anything not recorded in The Harvest.
 */
export function operatingSurplus(income: number, expense: number): number {
  return roundMoney(income - expense)
}

/** Yield per hectare from a quantity in kg and an area in square metres. */
export function yieldPerHectare(quantityKg: number, areaM2: number): number | null {
  if (!(areaM2 > 0)) return null
  return round(quantityKg / (areaM2 / 10_000), 1)
}

/** What can still be sold or used from a production record. */
export function availableQuantity(total: number, rejected: number, disposed: number): number {
  return round(total - rejected - disposed, 4)
}

/** Whether stock is at or below its reorder level. Items without a level never alert. */
export function isLowStock(quantity: number, reorderLevel: number | null | undefined): boolean {
  if (reorderLevel === null || reorderLevel === undefined) return false
  return quantity <= reorderLevel
}

/** Split an amount across weights, rounding to cents; the last share takes the remainder. */
export function allocateAmount(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return weights.map(() => 0)
  let left = roundMoney(amount)
  return weights.map((w, i) => {
    if (i === weights.length - 1) return roundMoney(left)
    const part = roundMoney((amount * w) / total)
    left = roundMoney(left - part)
    return part
  })
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice)
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round((value + Number.EPSILON) * f) / f
}

export function roundMoney(value: number): number {
  return round(value, 2)
}
