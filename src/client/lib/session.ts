/** path ภายในเว็บเท่านั้น (กันพาไปเว็บอื่นหลังล็อกอิน เช่น `//evil.com`, `/\evil.com`, `/%09/evil.com`) */
export function safeNext(raw: string | null, fallback = '/me'): string {
  if (!raw || !raw.startsWith('/')) return fallback
  try {
    const u = new URL(raw, location.origin)
    return u.origin === location.origin ? u.pathname + u.search + u.hash : fallback
  } catch {
    return fallback
  }
}

/** ล้างร่างงานที่ยังไม่ส่ง — เครื่องในห้องคอมใช้ร่วมกัน ไม่ให้คนถัดไปเห็น */
export function clearDrafts(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('draft:')) localStorage.removeItem(k)
  } catch {
    // ปิด storage ไว้
  }
}

/** id สุ่ม — crypto.randomUUID ไม่มีใน iPhone รุ่นเก่า (iOS < 15.4) */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}
