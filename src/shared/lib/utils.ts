import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Trim and turn empty strings into null before sending to the database. */
export function blankToNull(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}
