const fmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const formatDue = (t: number | null) => (t === null ? 'ไม่มีกำหนดส่ง' : `กำหนดส่ง ${fmt.format(t)}`)

/** แปลงค่า <input type="datetime-local"> (เวลาไทย) เป็น epoch ms และกลับ */
export function localToEpoch(v: string): number | null {
  return v ? new Date(`${v}:00+07:00`).getTime() : null
}
export function epochToLocal(t: number | null): string {
  if (t === null) return ''
  return new Date(t + 7 * 3600_000).toISOString().slice(0, 16)
}

export function timeLeft(due: number | null, now = Date.now()): { label: string; tone: 'red' | 'amber' | 'gray' } | null {
  if (due === null) return null
  const ms = due - now
  if (ms < 0) return { label: 'เลยกำหนด · ส่งได้ (สาย)', tone: 'amber' }
  const h = Math.floor(ms / 3600_000)
  if (h < 24) return { label: h < 1 ? 'เหลือไม่ถึง 1 ชม.' : `เหลือ ${h} ชม.`, tone: 'red' }
  return { label: `เหลือ ${Math.floor(h / 24)} วัน`, tone: 'gray' }
}

const dateFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit' })
/** YYYY-MM-DD → "20 ต.ค. 69" */
export const formatDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`))
