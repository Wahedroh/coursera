export function canonicalZipgradeId(raw: string): string {
  const t = raw.trim()
  if (/^\d+$/.test(t)) return t.replace(/^0+(?=\d)/, '')
  return t
}
