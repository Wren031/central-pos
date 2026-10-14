/**
 * Minimal CSV serialization for report exports. Follows RFC 4180 escaping and
 * prepends a UTF-8 BOM so Excel renders the peso sign and accented names.
 */

function escapeCell(value: string | number): string {
  const s = String(value ?? '')
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(rows: (string | number)[][]): string {
  const body = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
  return `\uFEFF${body}\r\n`
}
