import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import CalendarList from '../components/CalendarList'
import MonthCalendar, { monthTitle, thaiDate } from '../components/MonthCalendar'
import { todayBangkok } from '../../shared/attendance'
import type { CalendarItem } from '../../shared/calendar'
import { downloadIcs } from '../lib/ics'
import { Card, ErrorBox, Loading } from '../ui'

export default function StudentCalendar() {
  const navigate = useNavigate()
  const today = todayBangkok()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [items, setItems] = useState<CalendarItem[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    api<CalendarItem[]>(`/api/student/calendar?month=${month}`)
      .then(setItems)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [month, navigate])

  const shown = items?.filter((x) => (selected ? x.date === selected : month !== today.slice(0, 7) || x.date >= today)) ?? []
  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">📅 ปฏิทิน</h1>
        <p className="text-sm opacity-85">กำหนดส่งงาน วันสอบ และกิจกรรมของห้อง</p>
      </header>
      <section className="p-5 flex flex-col gap-4">
        <ErrorBox message={error} />
        <Card className="p-3 bg-[#FDFBF3]">
          <MonthCalendar
            month={month}
            items={items ?? []}
            today={today}
            selected={selected}
            onSelect={(d) => setSelected(selected === d ? null : d)}
            onMonth={(m) => {
              setMonth(m)
              setSelected(null)
            }}
          />
        </Card>
        {!items && !error && <Loading />}
        {items && (
          <>
            <div className="flex justify-between items-baseline">
              <h2 className="font-bold">{selected ? thaiDate(selected) : month === today.slice(0, 7) ? 'ที่กำลังจะมาถึงเดือนนี้' : `ทั้งเดือน${monthTitle(month)}`}</h2>
              {selected && (
                <button type="button" className="text-sm underline" onClick={() => setSelected(null)}>
                  ดูทั้งเดือน
                </button>
              )}
            </div>
            {shown.length === 0 ? <p className="text-sm text-stone-500 text-center py-4">ไม่มีรายการ</p> : <CalendarList items={shown} today={today} studentLinks />}
            {items.some((x) => x.date >= today) && (
              <button
                type="button"
                className="self-center text-sm rounded-xl border-2 border-line bg-white px-3 py-1.5 font-semibold"
                onClick={() => downloadIcs(items.filter((x) => x.date >= today), 'ห้องเรียน Change', `ปฏิทิน-${month}.ics`)}
              >
                ➕ เพิ่มลงปฏิทินในมือถือ (.ics)
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}
