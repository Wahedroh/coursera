import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { WEEKDAY_LABEL, type Slot } from '../../shared/timetable'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'
const TONES = ['bg-board-soft border-green-200', 'bg-amber-50 border-amber-200', 'bg-blue-50 border-blue-200', 'bg-violet-50 border-violet-200', 'bg-rose-50 border-rose-200', 'bg-teal-50 border-teal-200', 'bg-orange-50 border-orange-200']

/** ตารางสอนของครู: คาบประจำสัปดาห์ (ใช้กับปุ่ม “คาบนี้” การตั้งเวลาเผยแพร่ และกำหนดส่งตอนคัดลอก) */
export default function TeacherTimetable() {
  const handle = useTeacherErrorHandler()
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [paused, setPaused] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [classId, setClassId] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [start, setStart] = useState('08:30')
  const [end, setEnd] = useState('09:20')

  const load = useCallback(() => {
    api<{ slots: Slot[]; paused: boolean }>('/api/teacher/timetable')
      .then((r) => {
        setSlots(r.slots)
        setPaused(r.paused)
      })
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])
  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then((s) => {
        setSchools(s)
        setClassId((x) => x || s[0]?.classes[0]?.id || '')
      })
      .catch((e) => setError(handle(e)))
  }, [handle])

  const classes = schools.flatMap((s) => s.classes.map((c) => ({ ...c, school: s.schoolName })))
  const nameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? '—'
  const tone = (id: string) => TONES[Math.max(0, classes.findIndex((c) => c.id === id)) % TONES.length]
  const days = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => slots?.some((s) => s.weekday === d) || weekday === d)]

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api('/api/teacher/timetable', { body: { classId, weekday, start, end } })
      setFlash(`เพิ่มคาบ ${nameOf(classId)} · ${WEEKDAY_LABEL[weekday]} ${start}–${end} แล้ว`)
      load()
    } catch (err) {
      setError(handle(err))
    }
  }
  async function remove(s: Slot) {
    if (!window.confirm(`ลบคาบ ${nameOf(s.classId)} · ${WEEKDAY_LABEL[s.weekday]} ${s.start}–${s.end}?`)) return
    try {
      await api(`/api/teacher/timetable/${s.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(handle(err))
    }
  }
  async function togglePause(v: boolean) {
    setPaused(v)
    await api('/api/teacher/timetable/paused', { method: 'PUT', body: { paused: v } }).catch((e) => setError(handle(e)))
  }

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">ตารางสอน</h1>
          <p className="text-sm text-stone-500">กรอกครั้งเดียว · หน้าแรกจะขึ้นห้องที่กำลังสอน · ใช้ตั้งเวลาเผยแพร่ “ตอนเริ่มคาบถัดไป” ได้</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={paused} onChange={(e) => void togglePause(e.target.checked)} /> พักตาราง (ปิดเทอม)
        </label>
      </div>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      {!slots && !error && <Loading />}
      {slots && (
        <Card className="p-3 overflow-x-auto">
          <div className="grid gap-2 min-w-[640px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} data-testid="timetable-grid">
            {days.map((d) => (
              <div key={d} className="flex flex-col gap-1.5">
                <div className="text-center font-bold text-stone-600 text-sm">{WEEKDAY_LABEL[d]}</div>
                {slots
                  .filter((s) => s.weekday === d)
                  .map((s) => (
                    <button key={s.id} type="button" onClick={() => void remove(s)} title="แตะเพื่อลบ" className={`rounded-xl border-2 px-2 py-1.5 text-left text-xs ${tone(s.classId)}`}>
                      <b className="block text-sm leading-tight">{nameOf(s.classId)}</b>
                      {s.start}–{s.end}
                    </button>
                  ))}
                {!slots.some((s) => s.weekday === d) && <div className="rounded-xl border-2 border-dashed border-line h-12" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-2">แตะคาบเพื่อลบ · ห้องเดียวมีหลายคาบต่อสัปดาห์ได้</p>
        </Card>
      )}
      <Card className="p-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end">
          <label className="text-sm font-semibold">
            ห้อง
            <select className={input} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="ห้องของคาบ">
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
          </label>
          <label className="text-sm font-semibold">
            วัน
            <select className={input} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label="วันของคาบ">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {WEEKDAY_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            เริ่ม
            <input type="time" className={input} value={start} onChange={(e) => setStart(e.target.value)} aria-label="เวลาเริ่มคาบ" required />
          </label>
          <label className="text-sm font-semibold">
            จบ
            <input type="time" className={input} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="เวลาจบคาบ" required />
          </label>
          <Button type="submit" disabled={!classId || start >= end} className="py-2">
            + เพิ่มคาบ
          </Button>
        </form>
      </Card>
    </TeacherLayout>
  )
}
