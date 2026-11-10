import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { EVENT_LABEL, type CalendarItem } from '../../shared/calendar'
import { colorOf, thaiDate } from './MonthCalendar'

const STATUS: Record<string, [string, string]> = {
  missing: ['ยังไม่ส่ง', 'bg-red-50 text-red-700'],
  returned: ['ครูส่งกลับให้แก้', 'bg-violet-50 text-violet-700'],
  submitted: ['✓ ส่งแล้ว', 'bg-board-soft text-board'],
  late: ['✓ ส่งแล้ว (ช้า)', 'bg-board-soft text-board'],
  graded: ['✓ ตรวจแล้ว', 'bg-board-soft text-board'],
}

/** รายการเรียงตามวัน · actions = ปุ่มของครู (แก้/ลบ) */
export default function CalendarList({ items, today, studentLinks, actions }: { items: CalendarItem[]; today: string; studentLinks?: boolean; actions?: (x: CalendarItem) => ReactNode }) {
  const dates = [...new Set(items.map((x) => x.date))]
  return (
    <div className="flex flex-col gap-3" data-testid="calendar-list">
      {dates.map((d) => (
        <section key={d} className="flex flex-col gap-1.5">
          <h3 className={`text-sm font-extrabold ${d === today ? 'text-board' : d < today ? 'text-stone-400' : ''}`}>
            {thaiDate(d)}
            {d === today && ' · วันนี้'}
          </h3>
          {items
            .filter((x) => x.date === d)
            .map((x) => {
              const body = (
                <>
                  <span className="w-1.5 self-stretch rounded-full" style={{ background: colorOf(x) }} aria-hidden />
                  <span className="flex-1 min-w-0">
                    <b className="block text-sm">
                      {x.type === 'due' ? `ส่ง ${x.title}` : x.title}
                      {x.type === 'event' && <span className="ml-1 text-xs font-semibold text-stone-500">({EVENT_LABEL[x.kind]})</span>}
                    </b>
                    <span className="block text-xs text-stone-500">
                      {[
                        x.type === 'due' ? `ภายใน ${new Date(x.dueAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })} น.` : [x.period, x.detail].filter(Boolean).join(' · '),
                        studentLinks ? '' : x.className,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {x.type === 'due' && x.status && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[x.status][1]}`}>{STATUS[x.status][0]}</span>}
                  {actions?.(x)}
                </>
              )
              const cls = 'flex gap-3 items-center rounded-xl bg-white border border-line px-3 py-2'
              return studentLinks && x.type === 'due' ? (
                <Link key={`${x.type}${x.id}`} to={`/me/assignments/${x.id}`} className={cls}>
                  {body}
                </Link>
              ) : (
                <div key={`${x.type}${x.id}`} className={cls}>
                  {body}
                </div>
              )
            })}
        </section>
      ))}
    </div>
  )
}
