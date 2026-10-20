export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | boolean | null | undefined
}

/**
 * Build CSV text. Text cells that a spreadsheet would run as a formula
 * (starting with = + - @ or a tab) get a leading quote, which prevents CSV
 * injection when an export is opened in Excel.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (raw: unknown): string => {
    if (raw === null || raw === undefined) return ''
    let s = String(raw)
    if (typeof raw === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map((c) => escape(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => escape(c.value(row))).join(','))
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // Byte-order mark so Excel reads UTF-8 (₦, accented names) correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
