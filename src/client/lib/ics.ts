import type { CalendarItem } from '../../shared/calendar'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const ymd = (d: string) => d.replace(/-/g, '')
const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** ไฟล์ปฏิทิน (.ics) — เปิดแล้วเพิ่มลง Google Calendar / ปฏิทินของมือถือได้ */
export function toIcs(items: CalendarItem[], name: string): string {
  const now = stamp(Date.now())
  const ev = items.map((x) => {
    const lines = ['BEGIN:VEVENT', `UID:${x.type}-${x.id}@classroom`, `DTSTAMP:${now}`]
    if (x.type === 'due') lines.push(`DTSTART:${stamp(x.dueAt - 3600_000)}`, `DTEND:${stamp(x.dueAt)}`, `SUMMARY:${esc(`ส่งงาน: ${x.title}`)}`)
    else {
      const next = new Date(Date.parse(`${x.date}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10)
      const label = x.kind === 'exam' ? 'สอบ' : x.kind === 'holiday' ? 'วันหยุด' : 'กิจกรรม'
      lines.push(`DTSTART;VALUE=DATE:${ymd(x.date)}`, `DTEND;VALUE=DATE:${ymd(next)}`, `SUMMARY:${esc(`${label}: ${x.title}`)}`, `DESCRIPTION:${esc([x.period, x.detail].filter(Boolean).join(' · '))}`)
    }
    lines.push('END:VEVENT')
    return lines.join('\r\n')
  })
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Change Classroom//TH', `X-WR-CALNAME:${esc(name)}`, ...ev, 'END:VCALENDAR'].join('\r\n')
}

export function downloadIcs(items: CalendarItem[], name: string, file: string) {
  const url = URL.createObjectURL(new Blob([toIcs(items, name)], { type: 'text/calendar;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: file })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
