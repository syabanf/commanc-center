/** Spec 4.4: reports export to CSV. Builds the file in the browser and hands it to the viewer to save. */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const text = String(v)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const body = [[...header, 'Data status'], ...rows.map((row) => [...row, 'Simulated demo data'])]
    .map((r) => r.map(cell).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿', body], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  URL.revokeObjectURL(url)
}
