import { z } from 'zod'

const toNumber = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isNaN(n) ? v : n
}

export const positiveNumber = (label: string, opts: { integer?: boolean; max?: number } = {}) =>
  z.preprocess(
    toNumber,
    z
      .number({ required_error: `Enter ${label.toLowerCase()}`, invalid_type_error: `Enter a number for ${label.toLowerCase()}` })
      .positive(`${label} must be greater than zero`)
      .max(opts.max ?? 1e12, `${label} is too large`)
      .refine((n) => !opts.integer || Number.isInteger(n), `${label} must be a whole number`),
  )

export const nonNegativeNumber = (label: string) =>
  z.preprocess(
    toNumber,
    z.number({ invalid_type_error: `Enter a number for ${label.toLowerCase()}` }).min(0, `${label} cannot be negative`).max(1e12).optional(),
  )

export const optionalPositive = (label: string) =>
  z.preprocess(toNumber, z.number({ invalid_type_error: `Enter a number for ${label.toLowerCase()}` }).positive(`${label} must be greater than zero`).max(1e12).optional())

export const money = (label = 'Amount') =>
  z.preprocess(
    toNumber,
    z
      .number({ required_error: `Enter the ${label.toLowerCase()}`, invalid_type_error: `Enter the ${label.toLowerCase()} as a number` })
      .positive(`${label} must be greater than zero`)
      .max(999_999_999_999, `${label} is too large`)
      .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(4)), `${label} can have at most 2 decimal places`),
  )

export const requiredText = (label: string, max = 300) =>
  z.string({ required_error: `Enter ${label.toLowerCase()}` }).trim().min(1, `Enter ${label.toLowerCase()}`).max(max, `${label} is too long`)

export const optionalText = (max = 2000) => z.string().trim().max(max, 'This is too long').optional().or(z.literal(''))

export const requiredId = (label: string) => z.string({ required_error: `Choose ${label.toLowerCase()}` }).min(1, `Choose ${label.toLowerCase()}`)

export const dateField = (label = 'Date') =>
  z
    .string({ required_error: `Enter the ${label.toLowerCase()}` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label.toLowerCase()}`)
    .refine((d) => d <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), `${label} cannot be in the future`)

export const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(''))
