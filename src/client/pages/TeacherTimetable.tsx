import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { slotActiveOn, WEEKDAY_LABEL, type Slot } from '../../shared/timetable'
import { slotPeriods } from '../../shared/workload'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'
const todayStr = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const shortDate = (d: string) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(Date.parse(d))

/** ฉบับตารางสอน: ช่วงวันที่ที่ชุดคาบเหมือนกัน (แบ่งตามวันเริ่ม/เลิกใช้ของแต่ละคาบ) */
function versions(slots: Slot[]): { from: string | null; to: string | null; count: number }[] {
  const points = [...new Set(slots.flatMap((s) => [s.validFrom, s.validTo ? addDays(s.validTo, 1) : null]).filter((x): x is string => !!x))].sort()
  const starts: (string | null)[] = [null, ...points]
  const out = starts.map((from, i) => {
    const next = starts[i + 1]
    const at = from ?? (next ? addDays(next, -1) : todayStr())
    return { from, to: next ? addDays(next, -1) : null, count: slots.filter((s) => slotActiveOn(s, at)).reduce((n, s) => n + slotPeriods(s), 0) }
  })
  return out.filter((v, i) => v.count > 0 || i === out.length - 1)
}

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
  const [validFrom, setValidFrom] = useState(todayStr())
  const [viewDate, setViewDate] = useState(todayStr())
  const [removing, setRemoving] = useState<{ slot: Slot; from: string } | null>(null)

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

  const shown = (slots ?? []).filter((s) => slotActiveOn(s, viewDate))
  // วันเริ่มแรกสุด (เช่น วันเปิดเทอม) ไม่ต้องแสดงบนคาบ
  const firstFrom = (slots ?? []).map((s) => s.validFrom).filter((x): x is string => !!x).sort()[0] ?? ''
  const classes = schools.flatMap((s) => s.classes.map((c) => ({ ...c, school: s.schoolName })))
  const nameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? '—'
  const tone = (id: string) => TONES[Math.max(0, classes.findIndex((c) => c.id === id)) % TONES.length]
  const days = [1, 2, 3, 4, 5, 6, 7]

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api('/api/teacher/timetable', { body: { classId, weekday, start, end, validFrom } })
      setFlash(`เพิ่มคาบ ${nameOf(classId)} · ${WEEKDAY_LABEL[weekday]} ${start}–${end} แล้ว`)
      load()
    } catch (err) {
      setError(handle(err))
    }
  }
  async function remove(s: Slot) {
    const t = todayStr()
    setRemoving({ slot: s, from: s.validFrom && s.validFrom > t ? s.validFrom : t })
  }
  async function confirmRemove(kind: 'end' | 'delete') {
    if (!removing) return
    const { slot: s, from } = removing
    try {
      if (kind === 'delete') await api(`/api/teacher/timetable/${s.id}`, { method: 'DELETE' })
      else await api(`/api/teacher/timetable/${s.id}/end`, { method: 'PUT', body: { from } })
      setFlash(kind === 'delete' ? `ลบคาบ ${nameOf(s.classId)} · ${WEEKDAY_LABEL[s.weekday]} ${s.start}–${s.end} แล้ว` : `เลิกใช้คาบ ${nameOf(s.classId)} · ${WEEKDAY_LABEL[s.weekday]} ${s.start} ตั้งแต่ ${shortDate(from)} (ยอดก่อนหน้ายังนับ)`)
      setRemoving(null)
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
        <Card className="p-3 flex flex-wrap items-center gap-2 text-sm">
          <b>ฉบับตารางสอน</b>
          {versions(slots).map((v) => {
            const at = v.from ?? (v.to ?? todayStr())
            const on = (!v.from || v.from <= viewDate) && (!v.to || viewDate <= v.to)
            return (
              <button key={`${v.from}`} type="button" onClick={() => setViewDate(v.to && todayStr() > v.to ? at : v.from && v.from > todayStr() ? v.from : todayStr())} className={`rounded-xl border-2 px-2.5 py-1 ${on ? 'border-board bg-board-soft font-extrabold' : 'border-line bg-white'}`}>
                {v.from ? (v.to ? `${shortDate(v.from)} – ${shortDate(v.to)}` : `ตั้งแต่ ${shortDate(v.from)}`) : v.to ? `ถึง ${shortDate(v.to)}` : 'ตารางปัจจุบัน'} · {v.count} คาบ/สัปดาห์
              </button>
            )
          })}
          <label className="ml-auto flex items-center gap-1">
            ดูตารางของวันที่
            <input type="date" aria-label="ดูตารางของวันที่" className="border-2 border-line rounded-lg px-2 py-1 bg-white" value={viewDate} onChange={(e) => e.target.value && setViewDate(e.target.value)} />
          </label>
        </Card>
      )}
      {removing && (
        <Card className="p-4 flex flex-col gap-2 border-rose-200" >
          <b>
            คาบ {nameOf(removing.slot.classId)} · {WEEKDAY_LABEL[removing.slot.weekday]} {removing.slot.start}–{removing.slot.end}
          </b>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button type="button" onClick={() => void confirmRemove('end')}>
              เลิกใช้ตั้งแต่
            </Button>
            <input type="date" aria-label="เลิกใช้ตั้งแต่วันที่" className="border-2 border-line rounded-lg px-2 py-1 bg-white" value={removing.from} onChange={(e) => e.target.value && setRemoving({ ...removing, from: e.target.value })} />
            <span className="text-stone-500">— คาบก่อนวันนี้ยังนับในยอดย้อนหลัง (ใช้ตอนเปลี่ยนตาราง)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button type="button" variant="danger" onClick={() => void confirmRemove('delete')}>
              ลบทิ้ง (ใส่ผิด)
            </Button>
            <span className="text-stone-500">— ไม่เคยสอนจริง ลบออกจากทุกยอด</span>
            <Button type="button" variant="ghost" onClick={() => setRemoving(null)} className="ml-auto">
              ยกเลิก
            </Button>
          </div>
        </Card>
      )}
      {slots && (
        <Card className="p-3 overflow-x-auto">
          <div className="grid gap-2 min-w-[840px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} data-testid="timetable-grid">
            {days.map((d) => (
              <div key={d} className="flex flex-col gap-1.5">
                <div className="text-center font-bold text-stone-600 text-sm">{WEEKDAY_LABEL[d]}</div>
                {shown
                  .filter((s) => s.weekday === d)
                  .map((s) => (
                    <button key={s.id} type="button" onClick={() => void remove(s)} title="แตะเพื่อเลิกใช้/ลบ" className={`rounded-xl border-2 px-2 py-1.5 text-left text-xs ${tone(s.classId)}`}>
                      <b className="block text-sm leading-tight">{nameOf(s.classId)}</b>
                      {s.start}–{s.end}
                      {(s.validTo || (s.validFrom && s.validFrom > firstFrom)) && (
                        <span className="block text-[10px] text-stone-500">
                          {s.validFrom && s.validFrom > firstFrom ? `ตั้งแต่ ${shortDate(s.validFrom)}` : ''}
                          {s.validTo ? ` ถึง ${shortDate(s.validTo)}` : ''}
                        </span>
                      )}
                    </button>
                  ))}
                {!shown.some((s) => s.weekday === d) && <div className="rounded-xl border-2 border-dashed border-line h-12" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-2">แสดงตารางที่ใช้ในวันที่ {shortDate(viewDate)} · แตะคาบเพื่อเลิกใช้ (เปลี่ยนตาราง) หรือลบ (ใส่ผิด) · ห้องเดียวมีหลายคาบต่อสัปดาห์ได้</p>
        </Card>
      )}
      <Card className="p-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1.3fr_auto] items-end">
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
          <label className="text-sm font-semibold">
            ใช้ตั้งแต่
            <input type="date" className={input} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} aria-label="ใช้คาบนี้ตั้งแต่วันที่" required />
          </label>
          <Button type="submit" disabled={!classId || start >= end} className="py-2">
            + เพิ่มคาบ
          </Button>
        </form>
      </Card>
    </TeacherLayout>
  )
}
