import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import CalendarList from '../components/CalendarList'
import MonthCalendar, { thaiDate } from '../components/MonthCalendar'
import { todayBangkok } from '../../shared/attendance'
import { CAL_COLOR, EVENT_KINDS, EVENT_LABEL, type CalendarItem, type EventKind } from '../../shared/calendar'
import { CATEGORY_LABEL, SCORE_CATEGORIES, type ScoreCategory } from '../../shared/scores'
import { Button, Card, ErrorBox } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
type Ev = Extract<CalendarItem, { type: 'event' }>
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

export default function TeacherCalendar() {
  const handle = useTeacherErrorHandler()
  const [params, setParams] = useSearchParams()
  const classFilter = params.get('class') ?? ''
  const today = todayBangkok()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [items, setItems] = useState<CalendarItem[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [editing, setEditing] = useState<Ev | null>(null)
  // ฟอร์ม
  const [kind, setKind] = useState<EventKind>('exam')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [period, setPeriod] = useState('')
  const [detail, setDetail] = useState('')
  const [classIds, setClassIds] = useState<string[]>([])
  const [withScore, setWithScore] = useState(false)
  const [category, setCategory] = useState<ScoreCategory>('quiz')
  const [maxScore, setMaxScore] = useState(20)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<CalendarItem[]>(`/api/teacher/calendar?month=${month}${classFilter ? `&classId=${classFilter}` : ''}`)
      .then(setItems)
      .catch((e) => setError(handle(e)))
  }, [month, classFilter, handle])
  useEffect(load, [load])
  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then(setSchools)
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(() => setClassIds(classFilter ? [classFilter] : []), [classFilter])

  function reset() {
    setEditing(null)
    setTitle('')
    setPeriod('')
    setDetail('')
    setWithScore(false)
  }
  function startEdit(x: Ev) {
    setEditing(x)
    setKind(x.kind)
    setTitle(x.title)
    setDate(x.date)
    setPeriod(x.period)
    setDetail(x.detail)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { kind, title, date, period, detail }
      if (editing) {
        await api(`/api/teacher/events/${editing.id}`, { method: 'PUT', body })
        setFlash(`แก้ "${title}" แล้ว`)
      } else {
        await api('/api/teacher/events', { body: { ...body, classIds, scoreItem: kind === 'exam' && withScore ? { category, maxScore } : null } })
        setFlash(`เพิ่ม "${title}" ${classIds.length} ห้องแล้ว${kind === 'exam' && withScore ? ' พร้อมรายการคะแนนสอบ' : ''} · นักเรียนได้รับแจ้งเตือน`)
      }
      reset()
      setMonth(date.slice(0, 7))
      setSelected(date)
      load()
    } catch (err) {
      setError(handle(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(x: Ev) {
    if (!window.confirm(`ลบ "${x.title}" (${x.className}) ออกจากปฏิทิน?`)) return
    try {
      await api(`/api/teacher/events/${x.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(handle(err))
    }
  }

  const shown = items.filter((x) => (selected ? x.date === selected : true))
  const toggle = (id: string) => setClassIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-extrabold">ปฏิทิน</h1>
        <select
          aria-label="ห้อง"
          className="border-2 border-line rounded-xl px-3 py-1.5 bg-white font-semibold"
          value={classFilter}
          onChange={(e) => setParams(e.target.value ? { class: e.target.value } : {}, { replace: true })}
        >
          <option value="">ทุกห้อง</option>
          {schools.map((s) => (
            <optgroup key={s.schoolId} label={s.schoolName}>
              {s.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      <ErrorBox message={error} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <Card className="p-4">
          <MonthCalendar month={month} items={items} today={today} selected={selected} onSelect={(d) => setSelected(selected === d ? null : d)} onMonth={(m) => (setMonth(m), setSelected(null))} />
        </Card>
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex justify-between items-baseline">
            <h2 className="font-bold">{selected ? thaiDate(selected) : 'ทั้งเดือน'}</h2>
            {selected && (
              <button type="button" className="text-sm underline" onClick={() => (setDate(selected), setTitle(''), setEditing(null), document.getElementById('cal-title')?.focus())}>
                + เพิ่มในวันนี้
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-6">ไม่มีรายการ</p>
          ) : (
            <CalendarList
              items={shown}
              today={today}
              actions={(x) =>
                x.type === 'event' && (
                  <span className="flex gap-1 shrink-0">
                    <button type="button" className="rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-semibold" onClick={() => startEdit(x)} aria-label={`แก้ ${x.title} ${x.className}`}>
                      แก้
                    </button>
                    <button type="button" className="rounded-lg border border-red-200 text-red-700 bg-white px-2 py-0.5 text-xs font-semibold" onClick={() => void remove(x)} aria-label={`ลบ ${x.title} ${x.className}`}>
                      ลบ
                    </button>
                  </span>
                )
              }
            />
          )}
          <p className="text-xs text-stone-500">กำหนดส่งงานขึ้นในปฏิทินเองจากงานที่สั่ง (แก้ที่หน้าแก้งาน)</p>
        </Card>
      </div>
      <form onSubmit={save}>
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">{editing ? `แก้ "${editing.title}" (${editing.className})` : '+ เพิ่มวันสอบ / กิจกรรม / วันหยุด'}</h2>
          <div className="flex gap-2">
            {EVENT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1 text-sm font-bold border-2 ${kind === k ? 'text-white border-transparent' : 'bg-white border-line'}`}
                style={kind === k ? { background: CAL_COLOR[k] } : undefined}
              >
                {EVENT_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              ชื่อ
              <input id="cal-title" className={input} required maxLength={120} placeholder={kind === 'exam' ? 'เช่น สอบกลางภาค' : kind === 'holiday' ? 'เช่น วันลอยกระทง' : 'เช่น ทัศนศึกษา'} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="text-sm font-semibold">
              วันที่
              <input type="date" className={input} required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="text-sm font-semibold">
              คาบ / เวลา (ไม่บังคับ)
              <input className={input} maxLength={60} placeholder="เช่น คาบ 2–3" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </label>
            <label className="text-sm font-semibold">
              รายละเอียด (ไม่บังคับ)
              <input className={input} maxLength={500} placeholder="เช่น บทที่ 1–4 · พกเครื่องคิดเลข" value={detail} onChange={(e) => setDetail(e.target.value)} />
            </label>
          </div>
          {!editing && (
            <>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-semibold mb-1">ห้อง</legend>
                {schools.map((s) => (
                  <div key={s.schoolId} className="flex flex-wrap gap-x-4 gap-y-1 text-sm items-center">
                    <span className="text-xs text-stone-500 w-full">{s.schoolName}</span>
                    {s.classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => toggle(c.id)} aria-label={c.name} />
                        {c.grade !== null ? `ชั้น ${c.grade}` : c.name}
                      </label>
                    ))}
                  </div>
                ))}
              </fieldset>
              {kind === 'exam' && (
                <div className="rounded-xl bg-stone-50 p-3 flex flex-wrap gap-3 items-center text-sm">
                  <label className="flex items-center gap-2 font-semibold">
                    <input type="checkbox" checked={withScore} onChange={(e) => setWithScore(e.target.checked)} />
                    สร้างรายการคะแนนสอบด้วย
                  </label>
                  {withScore && (
                    <>
                      <select aria-label="ประเภทคะแนน" className="border-2 border-line rounded-lg px-2 py-1 bg-white" value={category} onChange={(e) => setCategory(e.target.value as ScoreCategory)}>
                        {SCORE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1">
                        คะแนนเต็ม
                        <input type="number" min={1} max={1000} className="w-20 border-2 border-line rounded-lg px-2 py-1" value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} />
                      </label>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !title.trim() || (!editing && classIds.length === 0)}>
              {editing ? 'บันทึกการแก้ไข' : `เพิ่มลงปฏิทิน${classIds.length > 1 ? ` (${classIds.length} ห้อง)` : ''}`}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={reset}>
                ยกเลิก
              </Button>
            )}
          </div>
          {!editing && <p className="text-xs text-stone-500">นักเรียนได้แจ้งเตือนทันทีที่เพิ่ม และอีกครั้งเย็นวันก่อน (“พรุ่งนี้สอบ…”)</p>}
        </Card>
      </form>
    </TeacherLayout>
  )
}
