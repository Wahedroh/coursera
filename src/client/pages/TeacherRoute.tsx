import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { WEEKDAY_LABEL } from '../../shared/timetable'
import { CLOSURE_LABEL, CLOSURE_REASONS, type Appointment, type Closure, type ClosureReason, type DayPlan, type SchoolPlace } from '../../shared/workload'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const input = 'border-2 border-line rounded-lg px-2 py-1.5 bg-white text-sm'
const todayStr = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const thai = (d: string) => new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(d))
const short = (d: string) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(d))

type CloseTarget = { schoolId: string | null; name: string }

/** เส้นทางรายวัน · ปิดโรงเรียน (พร้อมหมายเหตุ) · นัดพิเศษ · ตำแหน่งโรงเรียน */
export default function TeacherRoute() {
  const handle = useTeacherErrorHandler()
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [date, setDate] = useState(todayStr())
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [closures, setClosures] = useState<Closure[]>([])
  const [appts, setAppts] = useState<Appointment[]>([])
  const [places, setPlaces] = useState<SchoolPlace[] | null>(null)
  const [closing, setClosing] = useState<CloseTarget | null>(null)
  const [makingUp, setMakingUp] = useState<{ closureId: string; school: string; forDate: string; label: string; classes: { id: string; name: string; periods: number }[] } | null>(null)

  const fail = useCallback((e: unknown) => setError(handle(e)), [handle])
  // เปลี่ยนวันเร็ว ๆ: รับเฉพาะผลของวันที่เลือกล่าสุด (คำตอบของวันก่อนหน้าที่มาช้าไม่ทับ)
  const latest = useRef(date)
  latest.current = date
  const loadDay = useCallback(
    () =>
      api<DayPlan>(`/api/teacher/route/day?date=${date}`)
        .then((p) => p.date === latest.current && setPlan(p))
        .catch(fail),
    [date, fail],
  )
  const loadLists = useCallback(() => {
    api<Closure[]>(`/api/teacher/closures?from=${addDays(todayStr(), -30)}`).then(setClosures).catch(fail)
    api<Appointment[]>('/api/teacher/appointments').then(setAppts).catch(fail)
  }, [fail])
  useEffect(() => void loadDay(), [loadDay])
  useEffect(() => {
    loadLists()
    api<SchoolPlace[]>('/api/teacher/places').then(setPlaces).catch(fail)
  }, [loadLists, fail])
  const reload = () => {
    void loadDay()
    loadLists()
  }

  async function removeClosure(id: string) {
    if (!window.confirm('ยกเลิกการปิดนี้ (ทุกวันในช่วงที่ปิด) แล้วนับคาบตามปกติ?')) return
    try {
      await api(`/api/teacher/closures/${id}`, { method: 'DELETE' })
      setFlash('ยกเลิกการปิดแล้ว')
      reload()
    } catch (e) {
      fail(e)
    }
  }
  async function setNeeded(closureId: string, needed: boolean) {
    try {
      await api(`/api/teacher/closures/${closureId}/makeup`, { method: 'PUT', body: { needed } })
      reload()
    } catch (e) {
      fail(e)
    }
  }
  async function removeMakeup(id: string) {
    if (!window.confirm('ลบคาบชดเชยนี้? (ประกาศให้นักเรียนจะถูกลบด้วย)')) return
    try {
      await api(`/api/teacher/makeups/${id}`, { method: 'DELETE' })
      reload()
    } catch (e) {
      fail(e)
    }
  }
  async function removeAppt(id: string) {
    try {
      await api(`/api/teacher/appointments/${id}`, { method: 'DELETE' })
      reload()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold mr-auto">🧭 เส้นทาง & ปิดโรงเรียน</h1>
        <Link to="/teacher/workload" className="rounded-xl bg-board-soft text-board px-3 py-1.5 text-sm font-bold">
          📊 ภาระสอน & การเดินทาง
        </Link>
      </div>
      <ErrorBox message={error} />
      {flash && <p className="rounded-xl bg-board-soft text-board px-3 py-2 text-sm font-semibold">{flash}</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px] items-start">
        <div className="flex flex-col gap-4">
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-label="วันก่อน" className="rounded-lg bg-board-soft text-board px-2.5 py-1 font-bold" onClick={() => setDate((d) => addDays(d, -1))}>
                ‹
              </button>
              <input type="date" aria-label="วันที่" className={input} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button type="button" aria-label="วันถัดไป" className="rounded-lg bg-board-soft text-board px-2.5 py-1 font-bold" onClick={() => setDate((d) => addDays(d, 1))}>
                ›
              </button>
              {date !== todayStr() && (
                <button type="button" className="text-sm underline text-board" onClick={() => setDate(todayStr())}>
                  วันนี้
                </button>
              )}
              <b className="ml-auto" data-testid="day-summary">
                {thai(date)} · {plan ? `${plan.periods} คาบ · 🚗 ${plan.trips} ที่` : ''}
              </b>
            </div>
            {!plan && <Loading />}
            {plan && !plan.stops.length && <p className="text-sm text-stone-500 py-3 text-center">วันนี้ไม่มีคาบสอนหรือนัด</p>}
            <ul className="flex flex-col gap-2" data-testid="day-stops">
              {plan?.stops.map((s) => (
                <li key={`${s.key}-${s.start}`} className={`rounded-xl border-2 p-3 text-sm ${s.closed ? 'border-rose-200 bg-rose-50' : s.makeup?.mode === 'online' ? 'border-violet-300 bg-violet-50' : s.makeup ? 'border-blue-300 bg-blue-50' : 'border-line bg-white'}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b className="text-board tabular-nums">
                      {s.start}
                      {s.end ? `–${s.end}` : ''}
                    </b>
                    <b className={s.closed ? 'line-through text-rose-800' : ''}>
                      {s.kind === 'appointment' ? '📍 ' : ''}
                      {s.makeup ? (s.makeup.mode === 'online' ? '💻 สอนชดเชยออนไลน์ ' : '↺ สอนชดเชย ') : ''}
                      {s.makeup ? s.classes.map((c) => c.name).join(', ') : s.name}
                      {s.kind !== 'appointment' ? ` (${s.periods} คาบ)` : ''}
                    </b>
                    {s.kind === 'school' && <span className="text-xs text-stone-500">{s.classes.map((c) => `${c.name} ${c.periods}`).join(' · ')}</span>}
                  </div>
                  {s.makeup && (
                    <p className={`text-xs ${s.makeup.mode === 'online' ? 'text-violet-800' : 'text-blue-800'}`}>
                      {s.makeup.mode === 'online' ? 'Google Meet · ไม่นับการเดินทาง · ' : ''}
                      {s.makeup.forDate ? `แทนคาบที่ปิด ${new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(s.makeup.forDate))}${s.makeup.reason ? ` (${s.makeup.note || CLOSURE_LABEL[s.makeup.reason]})` : ''}` : 'คาบชดเชย'}
                    </p>
                  )}
                  {s.closed ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-rose-800">
                        ⛔ ปิด: {CLOSURE_LABEL[s.closed.reason]}
                        {s.closed.note ? ` · ${s.closed.note}` : ''} {s.closed.allSchools ? '(ทุกโรงเรียน)' : ''} — ไม่นับคาบ/การเดินทาง ไม่เตือน ไม่นำทาง
                      </span>
                      {s.closed.makeupNeeded ? <b className="text-amber-700">ต้องสอนชดเชย</b> : <span className="text-stone-500">ไม่ต้องชดเชย</span>}
                      <div className="flex flex-wrap gap-2 w-full">
                        <button
                          type="button"
                          className="rounded-lg bg-blue-100 text-blue-900 px-2.5 py-1 text-xs font-bold"
                          onClick={() => setMakingUp({ closureId: s.closed!.closureId, school: s.name, forDate: date, label: s.closed!.note || CLOSURE_LABEL[s.closed!.reason], classes: s.classes })}
                        >
                          ↺ นัดสอนชดเชย…
                        </button>
                        <button type="button" className="rounded-lg bg-white border-2 border-line px-2 py-0.5 text-xs font-bold" onClick={() => void setNeeded(s.closed!.closureId, !s.closed!.makeupNeeded)}>
                          {s.closed.makeupNeeded ? 'ไม่ต้องชดเชย' : 'ต้องชดเชย'}
                        </button>
                        <button type="button" className="rounded-lg bg-white border-2 border-line px-2 py-0.5 text-xs font-bold" onClick={() => void removeClosure(s.closed!.closureId)}>
                          ยกเลิกการปิด
                        </button>
                      </div>
                    </div>
                  ) : s.makeup ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1.5">
                      {s.makeup.mode === 'online' ? (
                        s.nav ? (
                          <a href={s.nav} target="_blank" rel="noreferrer" className="rounded-lg bg-violet-600 text-white px-2.5 py-1 text-xs font-bold">
                            🎥 เปิด Meet
                          </a>
                        ) : (
                          <span className="text-xs text-violet-800">ยังไม่ได้ใส่ลิงก์ Meet</span>
                        )
                      ) : (
                        <a href={s.nav} target="_blank" rel="noreferrer" className="rounded-lg bg-board text-white px-2.5 py-1 text-xs font-bold">
                          🧭 นำทาง
                        </a>
                      )}
                      <button type="button" className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold" onClick={() => void removeMakeup(s.makeup!.id)}>
                        ลบคาบชดเชย
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1.5">
                      {s.lat === null && s.kind === 'school' && <span className="text-xs text-amber-700">ยังไม่มีพิกัด (นำทางด้วยชื่อ)</span>}
                      <a href={s.nav} target="_blank" rel="noreferrer" className="rounded-lg bg-board text-white px-2.5 py-1 text-xs font-bold">
                        🧭 นำทาง
                      </a>
                      {s.kind === 'school' ? (
                        <button type="button" className="rounded-lg bg-rose-100 text-rose-800 px-2.5 py-1 text-xs font-bold" onClick={() => setClosing({ schoolId: s.key, name: s.name })}>
                          ปิดโรงเรียนนี้…
                        </button>
                      ) : (
                        <button type="button" className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold" onClick={() => void removeAppt(s.key.slice(5))}>
                          ลบนัด
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg bg-rose-100 text-rose-800 px-3 py-1.5 text-sm font-bold" onClick={() => setClosing({ schoolId: null, name: 'ทุกโรงเรียน' })}>
                ⛔ ปิดทุกโรงเรียน…
              </button>
            </div>
            {makingUp && (
              <MakeupForm
                target={makingUp}
                onCancel={() => setMakingUp(null)}
                onDone={(msg) => {
                  setMakingUp(null)
                  setFlash(msg)
                  reload()
                }}
                onError={fail}
              />
            )}
            {closing && (
              <CloseForm
                target={closing}
                date={date}
                onCancel={() => setClosing(null)}
                onDone={(msg) => {
                  setClosing(null)
                  setFlash(msg)
                  reload()
                }}
                onError={fail}
              />
            )}
            <AppointmentForm date={date} onDone={reload} onError={fail} />
          </Card>

          <Card className="p-4">
            <b>วันที่ปิด (30 วันที่ผ่านมา – ล่วงหน้า)</b>
            {!closures.length && <p className="text-sm text-stone-500 py-2">ยังไม่มี</p>}
            <ul className="flex flex-col" data-testid="closures">
              {closures.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 border-t border-stone-100 py-2 text-sm">
                  <b>{c.from === c.to ? short(c.from) : `${short(c.from)} – ${short(c.to)}`}</b>
                  <span>{c.schoolName ?? 'ทุกโรงเรียน'}</span>
                  <span className="text-rose-800">
                    {CLOSURE_LABEL[c.reason]}
                    {c.note ? ` · ${c.note}` : ''}
                  </span>
                  <button type="button" className="ml-auto text-xs underline" onClick={() => void removeClosure(c.id)}>
                    ยกเลิก
                  </button>
                </li>
              ))}
            </ul>
            {appts.length > 0 && (
              <>
                <b className="block pt-3">นัดพิเศษที่จะถึง</b>
                <ul className="flex flex-col">
                  {appts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 border-t border-stone-100 py-2 text-sm">
                      <b>
                        {short(a.date)} {a.start}
                      </b>
                      <span>📍 {a.title}</span>
                      <button type="button" className="ml-auto text-xs underline" onClick={() => void removeAppt(a.id)}>
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4 flex flex-col gap-2">
            <b>📍 ตำแหน่งโรงเรียน</b>
            <p className="text-xs text-stone-600">เปิด Google Maps หรือ Apple Maps → ค้นหาโรงเรียน → แชร์ → คัดลอกลิงก์ → วางที่ช่อง (หรือพิมพ์ “ละติจูด, ลองจิจูด”)</p>
            {!places && <Loading />}
            {places?.map((p) => (
              <PlaceRow key={p.id} p={p} onSaved={(np) => setPlaces((xs) => xs?.map((x) => (x.id === np.id ? np : x)) ?? null)} onError={fail} />
            ))}
          </Card>
        </div>
      </div>
    </TeacherLayout>
  )
}

function MakeupForm({
  target,
  onCancel,
  onDone,
  onError,
}: {
  target: { closureId: string; school: string; forDate: string; label: string; classes: { id: string; name: string; periods: number }[] }
  onCancel: () => void
  onDone: (msg: string) => void
  onError: (e: unknown) => void
}) {
  const [picked, setPicked] = useState<string[]>(target.classes.map((c) => c.id))
  const [mode, setMode] = useState<'onsite' | 'online'>('onsite')
  const [day, setDay] = useState(addDays(target.forDate, 1))
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:40')
  const [meetUrl, setMeetUrl] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const mins = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
  const periods = start < end ? Math.max(1, Math.round((mins(end) - mins(start)) / 50)) : 0
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/teacher/makeups', { body: { closureId: target.closureId, classIds: picked, date: day, start, end, mode, meetUrl, notifyStudents: notify } })
      onDone(`นัดสอนชดเชย${mode === 'online' ? 'ออนไลน์' : ''} ${short(day)} ${start}–${end} แล้ว`)
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="rounded-2xl border-2 border-blue-300 bg-white p-3 flex flex-col gap-2 text-sm" data-testid="makeup-form">
      <b>
        นัดสอนชดเชย: {target.school} (ปิด {short(target.forDate)} · {target.label})
      </b>
      <div className="flex flex-wrap items-center gap-2">
        ห้อง:
        {target.classes.map((c) => (
          <label key={c.id} className="inline-flex items-center gap-1 rounded-lg border-2 border-line px-2 py-0.5">
            <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, c.id] : xs.filter((x) => x !== c.id)))} />
            {c.name} ({c.periods})
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="รูปแบบการสอนชดเชย">
        {(['onsite', 'online'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-full border-2 px-3 py-1 ${mode === m ? 'border-board bg-board-soft font-extrabold' : 'border-line'}`}>
            {m === 'onsite' ? '🏫 ที่โรงเรียน' : '💻 ออนไลน์ (Google Meet)'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        วันที่ <input type="date" aria-label="วันที่สอนชดเชย" className={input} value={day} onChange={(e) => setDay(e.target.value)} required />
        เวลา <input type="time" aria-label="เวลาเริ่มสอนชดเชย" className={input} value={start} onChange={(e) => setStart(e.target.value)} required />–
        <input type="time" aria-label="เวลาจบสอนชดเชย" className={input} value={end} onChange={(e) => setEnd(e.target.value)} required />
        <b>= {periods} คาบ</b>
      </div>
      {mode === 'online' && <input aria-label="ลิงก์ Google Meet" className={input} placeholder="https://meet.google.com/…" value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} />}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        ประกาศให้นักเรียนห้องที่เลือก{mode === 'online' ? ' (พร้อมลิงก์ Meet)' : ''}
      </label>
      <p className="text-xs text-stone-500">{mode === 'online' ? 'นับคาบ · ไม่นับการเดินทาง' : 'นับคาบ + การเดินทางตามปกติ'} · เตือนก่อนเข้าคาบ/ลืมเช็กชื่อเหมือนคาบปกติ</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !picked.length || start >= end}>
          บันทึกคาบชดเชย
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}

function CloseForm({ target, date, onCancel, onDone, onError }: { target: CloseTarget; date: string; onCancel: () => void; onDone: (msg: string) => void; onError: (e: unknown) => void }) {
  const [from, setFrom] = useState(date)
  const [to, setTo] = useState(date)
  const [reason, setReason] = useState<ClosureReason>('holiday')
  const [note, setNote] = useState('')
  const [notify, setNotify] = useState(false)
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/teacher/closures', { body: { schoolId: target.schoolId, from, to, reason, note, notifyStudents: notify } })
      onDone(`ปิด ${target.name} ${from === to ? short(from) : `${short(from)} – ${short(to)}`} แล้ว`)
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="rounded-2xl border-2 border-rose-200 bg-white p-3 flex flex-col gap-2" data-testid="close-form">
      <b>ปิดโรงเรียน: {target.name}</b>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>
          ตั้งแต่ <input type="date" aria-label="ปิดตั้งแต่วันที่" className={input} value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label>
          ถึง <input type="date" aria-label="ปิดถึงวันที่" className={input} value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="เหตุผลที่ปิด">
        {CLOSURE_REASONS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={`rounded-full border-2 px-3 py-1 text-sm ${reason === r ? 'border-board bg-board-soft font-extrabold' : 'border-line'}`}>
            {CLOSURE_LABEL[r]}
          </button>
        ))}
      </div>
      <input aria-label="หมายเหตุการปิด" className={input} placeholder="หมายเหตุ เช่น “กีฬาสี” “วันลอยกระทง”" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        ประกาศ “งดเรียน” ให้นักเรียน{target.schoolId ? 'โรงเรียนนี้' : 'ทุกโรงเรียน'}เห็น
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          บันทึกการปิด
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}

function AppointmentForm({ date, onDone, onError }: { date: string; onDone: () => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState('13:00')
  const [title, setTitle] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  if (!open)
    return (
      <button type="button" className="rounded-xl border-2 border-dashed border-line py-2 text-sm font-bold text-board" onClick={() => setOpen(true)}>
        + เพิ่มนัด/สถานที่พิเศษ ({WEEKDAY_LABEL[(new Date(`${date}T00:00:00Z`).getUTCDay() || 7) as 1]} {short(date)})
      </button>
    )
  async function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api('/api/teacher/appointments', { body: { date, start, title, mapUrl } })
      setTitle('')
      setMapUrl('')
      setOpen(false)
      onDone()
    } catch (err) {
      onError(err)
    }
  }
  return (
    <form onSubmit={save} className="rounded-2xl border-2 border-line bg-white p-3 flex flex-wrap items-end gap-2 text-sm">
      <label className="flex flex-col">
        เวลา
        <input type="time" aria-label="เวลานัด" className={input} value={start} onChange={(e) => setStart(e.target.value)} required />
      </label>
      <label className="flex flex-col flex-1 min-w-40">
        นัด/สถานที่
        <input aria-label="ชื่อนัด" className={input} placeholder="เช่น ประชุมเขตพื้นที่" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </label>
      <label className="flex flex-col flex-1 min-w-40">
        ลิงก์แผนที่ (ไม่ใส่ก็ได้)
        <input aria-label="ลิงก์แผนที่ของนัด" className={input} value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} />
      </label>
      <Button type="submit">เพิ่มนัด</Button>
    </form>
  )
}

function PlaceRow({ p, onSaved, onError }: { p: SchoolPlace; onSaved: (p: SchoolPlace) => void; onError: (e: unknown) => void }) {
  const [v, setV] = useState(p.mapUrl ?? '')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (v.trim() === (p.mapUrl ?? '')) return
    setBusy(true)
    try {
      onSaved(await api<SchoolPlace>(`/api/teacher/places/${p.id}`, { method: 'PUT', body: { mapUrl: v.trim() } }))
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="border-t border-stone-100 pt-2 text-sm">
      <div className="flex items-center gap-2">
        <b className="flex-1">{p.name}</b>
        {busy ? <span className="text-xs">กำลังบันทึก…</span> : p.lat !== null ? <span className="text-xs text-green-700" data-testid={`place-ok-${p.name}`}>📍 พิกัดพร้อม</span> : p.mapUrl ? <span className="text-xs text-amber-700">อ่านพิกัดไม่ได้ (นำทางด้วยชื่อ)</span> : <span className="text-xs text-stone-400">ยังไม่ใส่</span>}
      </div>
      <input aria-label={`ลิงก์แผนที่ ${p.name}`} className={`${input} w-full mt-1`} placeholder="วางลิงก์ Google/Apple Maps" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => e.key === 'Enter' && void save()} />
    </div>
  )
}
