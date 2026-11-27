import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { todayBangkok } from '../../shared/attendance'
import { CAL_COLOR } from '../../shared/calendar'
import { TODO_PRESETS, WEEK_KIND_LABEL, type TeacherWeek as Week, type WeekItem } from '../../shared/teacherWeek'
import { Card, ErrorBox } from '../ui'
import Icon from './Icon'

const COLOR: Record<WeekItem['kind'], string> = { ...CAL_COLOR, makeup: '#7C3AED', todo: '#1f5e46' }
const dayName = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'short' })
const dayNum = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const fmt = (d: string, f: Intl.DateTimeFormat) => f.format(Date.parse(`${d}T00:00:00Z`))
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)

/** หน้าแรกครู: วันนี้ (บนสุด) + อีก 3 วัน — นัดสอบ · สอบย้อนหลัง · กำหนดส่ง · สิ่งที่ครูต้องทำ (ปริ้นเอกสาร ฯลฯ) */
export default function TeacherWeek() {
  const today = todayBangkok()
  const [w, setW] = useState<Week | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(() => {
    let live = true
    api<Week>('/api/teacher/upcoming')
      .then((x) => live && setW(x))
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [])
  useEffect(load, [load])

  async function add(date: string, t: string, classId: string | null = null) {
    if (!t.trim()) return
    setError(null)
    try {
      await api('/api/teacher/todos', { body: { title: t.trim(), date, classId } })
      setTitle('')
      setAdding(null)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  async function toggle(x: WeekItem) {
    // แสดงผลทันที แล้วค่อยบันทึก
    setW((cur) => cur && { ...cur, days: cur.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === x.id && i.kind === 'todo' ? { ...i, done: !x.done } : i)) })) })
    try {
      await api(`/api/teacher/todos/${x.id}`, { method: 'PUT', body: { done: !x.done } })
    } catch (e) {
      setError((e as Error).message)
      load()
    }
  }
  async function remove(x: WeekItem) {
    try {
      await api(`/api/teacher/todos/${x.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  /** สอบ → เตือนปริ้นข้อสอบวันก่อนสอบ */
  async function remindPrint(x: WeekItem) {
    const date = x.date > today ? shift(x.date, -1) : today
    await add(date, `🖨️ ปริ้นข้อสอบ: ${x.title}${x.className ? ` (${x.className})` : ''}`, x.classId)
    setFlash(`เพิ่ม “ปริ้นข้อสอบ ${x.title}” ไว้วัน${fmt(date, dayName)} ${fmt(date, dayNum)} แล้ว`)
  }

  const pending = w?.days.flatMap((d) => d.items).filter((x) => x.kind === 'todo' && !x.done).length ?? 0
  return (
    <section data-testid="teacher-week" aria-label="วันนี้และ 3 วันข้างหน้า">
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-extrabold">
          <Icon n="calendar" /> วันนี้ และ 3 วันข้างหน้า
        </h2>
        {pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">ต้องทำ {pending}</span>}
        <Link to="/teacher/calendar" className="text-xs font-semibold text-board underline">
          ปฏิทินทั้งเดือน
        </Link>
      </div>
      <ErrorBox message={error} />
      {flash && (
        <p role="status" className="rounded-xl bg-board-soft px-3 py-1.5 text-sm font-semibold text-board">
          {flash}
        </p>
      )}
      <ol className="flex flex-col divide-y divide-stone-100">
        {(w?.days ?? []).map((d) => {
          const isToday = d.date === today
          const past = d.date < today
          return (
            <li key={d.date} className={`flex gap-3 py-2 ${isToday ? '-mx-2 rounded-xl bg-amber-50 px-2' : ''}`} data-testid={`day-${d.date}`}>
              <div className={`w-12 shrink-0 text-center ${past ? 'text-stone-400' : ''}`}>
                <div className="text-xs font-bold">{fmt(d.date, dayName)}</div>
                <div className={`text-sm font-extrabold ${isToday ? 'text-board' : ''}`}>{fmt(d.date, dayNum)}</div>
                {isToday && <div className="text-[10px] font-bold text-amber-700">วันนี้</div>}
                {d.date === shift(today, 1) && <div className="text-[10px] font-bold text-stone-500">พรุ่งนี้</div>}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {d.items.map((x) => (
                  <div key={`${x.kind}-${x.id}`} className={`flex items-start gap-2 text-sm ${x.done ? 'text-stone-400 line-through' : x.kind === 'todo' && (past || x.time.startsWith('ค้าง')) ? 'text-red-700' : ''}`}>
                    {x.kind === 'todo' ? (
                      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={x.done} onChange={() => void toggle(x)} aria-label={`ทำแล้ว ${x.title}`} />
                    ) : (
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[x.kind] }} aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      {x.kind !== 'todo' && (
                        <b className="mr-1 text-xs" style={{ color: COLOR[x.kind] }}>
                          {WEEK_KIND_LABEL[x.kind]}
                        </b>
                      )}
                      {x.url ? (
                        <Link to={x.url} className="font-semibold hover:underline">
                          {x.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{x.title}</span>
                      )}
                      {(x.className || x.time) && <span className="text-xs text-stone-500"> · {[x.time, x.className].filter(Boolean).join(' · ')}</span>}
                    </span>
                    {x.kind === 'exam' && !past && (
                      <button type="button" onClick={() => void remindPrint(x)} className="shrink-0 rounded-lg bg-stone-100 px-2 py-0.5 text-xs font-bold" aria-label={`เตือนปริ้นข้อสอบ ${x.title}`}>
                        🖨️ เตือนปริ้น
                      </button>
                    )}
                    {x.kind === 'todo' && (
                      <button type="button" onClick={() => void remove(x)} className="shrink-0 text-xs text-stone-400" aria-label={`ลบ ${x.title}`}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {adding === d.date ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-1">
                      {TODO_PRESETS.map((p) => (
                        <button key={p} type="button" onClick={() => setTitle(title ? title : `${p} `)} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold">
                          {p}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        aria-label="สิ่งที่ต้องทำ"
                        className="min-w-0 flex-1 rounded-lg border-2 border-line px-2 py-1 text-sm"
                        placeholder="เช่น ปริ้นใบงานที่ 3 ม.2/1 40 แผ่น"
                        value={title}
                        maxLength={120}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void add(d.date, title)}
                      />
                      <button type="button" onClick={() => void add(d.date, title)} disabled={!title.trim()} className="rounded-lg bg-board px-3 text-sm font-bold text-white disabled:opacity-40">
                        เพิ่ม
                      </button>
                      <button type="button" onClick={() => (setAdding(null), setTitle(''))} className="px-1 text-sm text-stone-500">
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => (setAdding(d.date), setTitle(''))} className="self-start text-xs font-semibold text-stone-400" aria-label={`เพิ่มสิ่งที่ต้องทำ ${fmt(d.date, dayName)} ${fmt(d.date, dayNum)}`}>
                    + สิ่งที่ต้องทำ
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="text-[11px] text-stone-500">
        <span style={{ color: CAL_COLOR.exam }}>●</span> สอบ · <span style={{ color: COLOR.makeup }}>●</span> สอบย้อนหลัง · <span style={{ color: CAL_COLOR.due }}>●</span> กำหนดส่ง · <span style={{ color: CAL_COLOR.activity }}>●</span> กิจกรรม · ☐ สิ่งที่ครูต้องทำ — แจ้งเตือนตอนเช้า และเย็นวันก่อน
      </p>
    </Card>
    </section>
  )
}
