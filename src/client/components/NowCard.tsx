import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api'
import { todayBangkok } from '../../shared/attendance'
import { WEEKDAY_LABEL, WEEKDAY_SHORT, type Slot } from '../../shared/timetable'
import { Card } from '../ui'

type Occ = Slot & { startAt: number; endAt: number }
type Now = {
  paused: boolean
  hasSlots: boolean
  current: Occ | null
  upcoming: Occ[]
  missingAttendance: { classId: string; date: string; weekday: number }[]
  currentDayId: string | null
  /** ยืนยันการสอน (เซลฟี + พิกัด) ของคาบนี้ */
  selfie: { url: string; done: boolean; date: string } | null
}
type ClassInfo = { id: string; name: string; studentCount: number }

const time = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
const when = (t: number) => {
  const d = Math.round((Date.parse(`${todayBangkok(t)}T00:00:00Z`) - Date.parse(`${todayBangkok()}T00:00:00Z`)) / 86400_000)
  const day = d === 0 ? 'วันนี้' : d === 1 ? 'พรุ่งนี้' : `${WEEKDAY_LABEL[((new Date(t + 7 * 3600_000).getUTCDay() + 6) % 7) + 1]}`
  return `${day} ${time.format(t)}`
}

/** หน้าแรกครู: คาบที่กำลังสอน + ปุ่มลัด · คาบถัดไป · เตือนคาบที่ยังไม่เช็กชื่อ */
export default function NowCard({ classes }: { classes: ClassInfo[] }) {
  const navigate = useNavigate()
  const [now, setNow] = useState<Now | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const load = () => api<Now>('/api/teacher/timetable/now').then(setNow).catch(() => {})
    load()
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [])
  if (!now) return null
  const cls = (id: string) => classes.find((c) => c.id === id)
  if (!now.hasSlots)
    return (
      <Link to="/teacher/timetable" className="block">
        <Card className="p-3 text-sm bg-board-soft border-green-200">
          🗓️ <b>ตั้งตารางสอน</b> แล้วหน้านี้จะขึ้นห้องที่กำลังสอนพร้อมปุ่มลัด (เช็กชื่อ · สุ่มชื่อ · สั่งงาน) · แตะเพื่อเริ่ม
        </Card>
      </Link>
    )
  if (now.paused) return null

  async function checkIn(classId: string) {
    setBusy(true)
    try {
      await api(`/api/teacher/classes/${classId}/attendance`, { body: { date: todayBangkok() } })
    } catch {
      /* เปิดแล้ว/ไม่สำเร็จ ก็ไปหน้าเช็กชื่อ */
    }
    navigate(`/teacher/classes/${classId}/attendance`)
  }

  async function markSelfie(done: boolean) {
    if (!now?.current || !now.selfie) return
    await api('/api/teacher/selfie-done', { method: 'PUT', body: { slotId: now.current.id, date: now.selfie.date, done } }).catch(() => {})
    setNow({ ...now, selfie: { ...now.selfie, done } })
  }

  const c = now.current
  const info = c ? cls(c.classId) : null
  const next = now.upcoming[0]
  const quick = (id: string) => [
    { icon: '🎲', label: 'สุ่มชื่อ', to: `/teacher/classes/${id}/seating` },
    { icon: '📝', label: 'สั่งงาน', to: `/teacher/assignments/new?classId=${id}` },
    { icon: '📒', label: 'อัปที่จด', to: `/teacher/classes/${id}/materials?kind=notes` },
    { icon: '🃏', label: 'เกมการ์ด', to: `/teacher/card-game?class=${id}` },
    { icon: '📚', label: 'เปิดห้อง', to: `/teacher/classes/${id}` },
  ]
  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
      {c && info ? (
        <div className="rounded-2xl bg-gradient-to-br from-board to-[#2c7a5c] text-white p-4" data-testid="now-card">
          <span className="inline-block rounded-full bg-amber-400 text-amber-950 px-2.5 py-0.5 text-xs font-extrabold">● กำลังสอน</span>
          <h2 className="text-2xl font-extrabold mt-1">{info.name}</h2>
          <p className="text-sm opacity-85">
            {WEEKDAY_LABEL[c.weekday]} {c.start}–{c.end} · {info.studentCount} คน · เหลืออีก {Math.max(0, Math.round((c.endAt - Date.now()) / 60000))} นาที
          </p>
          {now.selfie && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/15 px-3 py-2" data-testid="selfie-row">
              {now.selfie.done ? (
                <span className="font-bold">✅ ยืนยันการสอนคาบนี้แล้ว</span>
              ) : (
                <a href={now.selfie.url} target="_blank" rel="noreferrer" className="rounded-lg bg-amber-400 text-amber-950 px-3 py-1.5 text-sm font-extrabold">
                  📸 ยืนยันการสอน (เซลฟี + พิกัด)
                </a>
              )}
              <button type="button" onClick={() => void markSelfie(!now.selfie!.done)} className="text-xs underline opacity-90">
                {now.selfie.done ? 'ยกเลิก' : 'ยืนยันแล้ว ✓'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
            <button type="button" disabled={busy} onClick={() => void checkIn(c.classId)} className="rounded-xl bg-white text-ink py-2 font-bold text-sm">
              <span className="block text-xl">📋</span>
              {now.currentDayId ? 'เช็กชื่อ ✓' : 'เช็กชื่อ'}
            </button>
            {quick(c.classId).map((q) => (
              <Link key={q.label} to={q.to} className="rounded-xl bg-white text-ink py-2 font-bold text-sm text-center">
                <span className="block text-xl">{q.icon}</span>
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-4">
          <p className="text-xs font-semibold text-stone-500">คาบถัดไป</p>
          {next && cls(next.classId) ? (
            <>
              <h2 className="text-lg font-extrabold">
                {when(next.startAt)} · {cls(next.classId)!.name}
              </h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <Link to={`/teacher/assignments/new?classId=${next.classId}`} className="rounded-xl border-2 border-board text-board px-3 py-1 text-sm font-bold">
                  เตรียมสั่งงาน
                </Link>
                <Link to={`/teacher/classes/${next.classId}`} className="rounded-xl border-2 border-line px-3 py-1 text-sm font-bold">
                  เปิดห้อง
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-stone-500">ไม่มีคาบในตารางสอน</p>
          )}
        </Card>
      )}
      <Card className="p-4 text-sm flex flex-col gap-1">
        <div className="flex justify-between items-baseline">
          <b>สัปดาห์นี้</b>
          <Link to="/teacher/timetable" className="text-xs underline text-board">
            ตารางสอน
          </Link>
        </div>
        {now.missingAttendance.length === 0 ? (
          <p className="text-stone-500">✅ เช็กชื่อครบทุกคาบที่ผ่านมา</p>
        ) : (
          <>
            <p className="text-amber-700 font-semibold">⚠️ ยังไม่เช็กชื่อ {now.missingAttendance.length} คาบ</p>
            {now.missingAttendance.slice(0, 5).map((m) => (
              <Link key={`${m.classId}${m.date}`} to={`/teacher/classes/${m.classId}/attendance?date=${m.date}`} className="text-xs underline text-stone-600" data-testid="missing-attendance">
                {cls(m.classId)?.name ?? '—'} ({WEEKDAY_SHORT[m.weekday]})
              </Link>
            ))}
          </>
        )}
        {c && next && cls(next.classId) && (
          <p className="text-xs text-stone-500 mt-1">
            ต่อไป: {when(next.startAt)} {cls(next.classId)!.name}
          </p>
        )}
      </Card>
    </div>
  )
}
