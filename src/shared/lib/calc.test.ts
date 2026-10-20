import { describe, expect, it } from 'vitest'
import {
  allocateAmount,
  availableQuantity,
  convertQuantity,
  estimatedBiomassKg,
  feedConversionRatio,
  feedPerHeadGrams,
  henDayProduction,
  isLowStock,
  lineTotal,
  mortalityRate,
  operatingSurplus,
  yieldPerHectare,
} from './calc'
import { toCsv } from './csv'

const kg = { dimension: 'mass', to_base: 1 }
const bag50 = { dimension: 'mass', to_base: 50 }
const g = { dimension: 'mass', to_base: 0.001 }
const crate = { dimension: 'count', to_base: 30 }
const each = { dimension: 'count', to_base: 1 }

describe('unit conversion', () => {
  it('converts within a dimension', () => {
    expect(convertQuantity(3, bag50, kg)).toBe(150)
    expect(convertQuantity(250, g, kg)).toBe(0.25)
    expect(convertQuantity(270, each, crate)).toBe(9)
  })
  it('refuses to convert between dimensions', () => {
    expect(() => convertQuantity(1, kg, each)).toThrow(/Cannot convert/)
  })
})

describe('livestock ratios', () => {
  it('mortality rate is deaths over animals at risk, and null with no animals', () => {
    expect(mortalityRate(15, 1000)).toBe(1.5)
    expect(mortalityRate(0, 0)).toBeNull()
  })
  it('hen-day production', () => {
    expect(henDayProduction(8500, 1000, 10)).toBe(85)
    expect(henDayProduction(10, 0, 5)).toBeNull()
  })
  it('feed per head and conversion ratio', () => {
    expect(feedPerHeadGrams(120, 1000)).toBe(120)
    expect(feedPerHeadGrams(10, 0)).toBeNull()
    expect(feedConversionRatio(1500, 1000)).toBe(1.5)
    expect(feedConversionRatio(10, 0)).toBeNull()
  })
  it('estimated biomass needs a sampled weight', () => {
    expect(estimatedBiomassKg(1960, 500)).toBe(980)
    expect(estimatedBiomassKg(1000, null)).toBeNull()
  })
})

describe('crops and produce', () => {
  it('yield per hectare', () => {
    expect(yieldPerHectare(6600, 20_000)).toBe(3300)
    expect(yieldPerHectare(100, 0)).toBeNull()
  })
  it('available produce', () => {
    expect(availableQuantity(20, 1, 14)).toBe(5)
  })
})

describe('money', () => {
  it('operating surplus avoids float drift', () => {
    expect(operatingSurplus(0.3, 0.1)).toBe(0.2)
    expect(operatingSurplus(50000, 12000.5)).toBe(37999.5)
  })
  it('line totals round to two decimals', () => {
    expect(lineTotal(3, 0.1)).toBe(0.3)
    expect(lineTotal(2.5, 4500)).toBe(11250)
  })
  it('allocates an amount across weights with the remainder on the last share', () => {
    const parts = allocateAmount(100, [1, 1, 1])
    expect(parts).toEqual([33.33, 33.33, 33.34])
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
    expect(allocateAmount(10, [0, 0])).toEqual([0, 0])
  })
})

describe('stock', () => {
  it('low stock only applies when a reorder level is set', () => {
    expect(isLowStock(30, 50)).toBe(true)
    expect(isLowStock(50, 50)).toBe(true)
    expect(isLowStock(51, 50)).toBe(false)
    expect(isLowStock(0, null)).toBe(false)
  })
})

describe('CSV export', () => {
  it('escapes quotes, commas and newlines', () => {
    const csv = toCsv([{ a: 'Fish, "large"', b: 'line1\nline2', c: 12.5 }], [
      { header: 'A', value: (r) => r.a },
      { header: 'B', value: (r) => r.b },
      { header: 'C', value: (r) => r.c },
    ])
    expect(csv).toBe('A,B,C\r\n"Fish, ""large""","line1\nline2",12.5')
  })
  it('neutralizes spreadsheet formulas in text cells but keeps negative numbers', () => {
    const csv = toCsv([{ t: '=HYPERLINK("http://x")', n: -5 }], [
      { header: 'T', value: (r) => r.t },
      { header: 'N', value: (r) => r.n },
    ])
    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""http://x"")",-5`)
  })
})
