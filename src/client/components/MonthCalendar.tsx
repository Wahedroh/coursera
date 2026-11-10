import { CAL_COLOR, type CalendarItem } from '../../shared/calendar'

const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

export const colorOf = (x: CalendarItem) => (x.type === 'due' ? CAL_COLOR.due : CAL_COLOR[x.kind])
export const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}
export const shiftMonth = (month: string, d: number) => {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + d, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}
export const thaiDate = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) =>
  new Date(`${date}T12:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', ...opts })

/** ตารางเดือน (เริ่มวันจันทร์) มีจุดสีตามประเภทรายการ · แตะวันเพื่อเลือก */
export default function MonthCalendar({
  month,
  items,
  today,
  selected,
  onSelect,
  onMonth,
}: {
  month: string
  items: CalendarItem[]
  today: string
  selected: string | null
  onSelect: (date: string) => void
  onMonth: (month: string) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay() // 0 = อาทิตย์
  const lead = (first + 6) % 7
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1)
  const byDate = new Map<string, CalendarItem[]>()
  for (const x of items) (byDate.get(x.date) ?? byDate.set(x.date, []).get(x.date)!).push(x)
  return (
    <div className="flex flex-col gap-2" data-testid="month-calendar">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="เดือนก่อน" className="rounded-xl border-2 border-line bg-white w-10 h-10 font-bold" onClick={() => onMonth(shiftMonth(month, -1))}>
          ‹
        </button>
        <b className="text-lg">{monthTitle(month)}</b>
        <button type="button" aria-label="เดือนถัดไป" className="rounded-xl border-2 border-line bg-white w-10 h-10 font-bold" onClick={() => onMonth(shiftMonth(month, 1))}>
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-stone-500">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d < 1 || d > days) return <span key={i} />
          const date = `${month}-${String(d).padStart(2, '0')}`
          const xs = byDate.get(date) ?? []
          const holiday = xs.some((x) => x.type === 'event' && x.kind === 'holiday')
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={`${thaiDate(date)}${xs.length ? ` มี ${xs.length} รายการ` : ''}`}
              aria-pressed={selected === date}
              className={`relative h-14 rounded-lg text-left text-xs px-1.5 py-1 ${holiday ? 'bg-stone-100 text-stone-400' : 'bg-white'} ${
                selected === date ? 'ring-2 ring-amber-400' : ''
              } ${date === today ? 'outline outline-2 outline-board font-extrabold' : ''}`}
            >
              {d}
              <span className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                {xs.slice(0, 4).map((x, k) => (
                  <span key={k} className="w-2 h-2 rounded-full" style={{ background: colorOf(x) }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-stone-600">
        {(
          [
            ['กำหนดส่งงาน', CAL_COLOR.due],
            ['สอบ', CAL_COLOR.exam],
            ['กิจกรรม', CAL_COLOR.activity],
            ['วันหยุด', CAL_COLOR.holiday],
          ] as const
        ).map(([l, c]) => (
          <span key={l} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}
