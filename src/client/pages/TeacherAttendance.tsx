import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api } from '../api'
import { ATTENDANCE_STATUSES, STATUS_LABEL, todayBangkok, type AttendanceDay, type AttendanceRange, type AttendanceStatus } from '../../shared/attendance'
import { exportAttendance } from '../lib/excel'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const TONE: Record<AttendanceStatus, string> = {
  present: 'bg-board text-white',
  late: 'bg-amber-400 text-amber-950',
  sick: 'bg-blue-500 text-white',
  leave: 'bg-violet-500 text-white',
  absent: 'bg-red-500 text-white',
}
const input = 'border-2 border-line rounded-xl px-3 py-1.5 bg-white'

export default function TeacherAttendance() {
  const { id = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const date = search.get('date') ?? todayBangkok()
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<AttendanceDay | null>(null)
  const [className, setClassName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(date.slice(0, 8) + '01')
  const [to, setTo] = useState(date)

  const load = useCallback(() => {
    setData(null)
    api<AttendanceDay>(`/api/teacher/classes/${id}/attendance?date=${date}`).then(setData).catch((e) => setError(handle(e)))
  }, [id, date, handle])
  useEffect(load, [load])
  useEffect(() => {
    api<{ class: { name: string } }>(`/api/teacher/classes/${id}/students`).then((d) => setClassName(d.class.name)).catch(() => {})
  }, [id])

  async function setStatus(studentId: string, status: AttendanceStatus) {
    if (!data) return
    setData({ ...data, records: data.records.map((r) => (r.studentId === studentId ? { ...r, status, source: 'teacher' } : r)) })
    try {
      await api(`/api/teacher/attendance/${data.day.id}/records/${studentId}`, { method: 'PUT', body: { status } })
    } catch (e) {
      setError(handle(e))
      load()
    }
  }

  async function exportRange() {
    try {
      const r = await api<AttendanceRange>(`/api/teacher/classes/${id}/attendance-range?from=${from}&to=${to}`)
      await exportAttendance(r, className, from, to)
    } catch (e) {
      setError(handle(e))
    }
  }

  const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, data?.records.filter((r) => r.status === s).length ?? 0]))

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← {className || 'หน้าห้อง'}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">เช็กชื่อ</h1>
          <label className="text-sm text-stone-500 flex items-center gap-2 mt-1">
            วันที่
            <input type="date" className={input} value={date} onChange={(e) => e.target.value && setSearch({ date: e.target.value })} />
          </label>
        </div>
        {data && (
          <Link to={`/teacher/attendance/${data.day.id}/qr`} className="rounded-2xl bg-amber-400 text-amber-950 px-4 py-2 font-bold">
            เปิด QR ให้นักเรียนเช็กอินเอง
          </Link>
        )}
      </div>
      <ErrorBox message={error} />
      <div className="grid grid-cols-5 gap-2">
        {ATTENDANCE_STATUSES.map((s) => (
          <Card key={s} className="p-2 text-center">
            <div className="text-xs text-stone-500">{STATUS_LABEL[s]}</div>
            <div className="text-2xl font-extrabold">{counts[s]}</div>
          </Card>
        ))}
      </div>
      {!data && !error && <Loading />}
      {data && (
        <Card className="p-2 divide-y divide-stone-100">
          {data.records.map((r, i) => (
            <div key={r.studentId} className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
              <span className="text-sm">
                <span className="text-stone-400 inline-block w-7">{i + 1}</span>
                {r.firstName} {r.lastName}
                {r.source === 'self' && <span className="ml-1 text-xs text-board">· เช็กอินเอง</span>}
              </span>
              <span className="flex gap-1">
                {ATTENDANCE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`${r.firstName} ${r.lastName} ${STATUS_LABEL[s]}`}
                    aria-pressed={r.status === s}
                    onClick={() => setStatus(r.studentId, s)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${r.status === s ? TONE[s] : 'bg-stone-100 text-stone-500'}`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </Card>
      )}
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          ตั้งแต่
          <input type="date" className={`${input} block`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          ถึง
          <input type="date" className={`${input} block`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" onClick={exportRange} className="rounded-xl border-2 border-line bg-white px-3 py-1.5 font-bold">
          ⬇ Excel เช็กชื่อ
        </button>
      </Card>
      <p className="text-xs text-stone-500">ทุกคนเริ่มต้นเป็น "มา" แตะเพื่อเปลี่ยน · บันทึกอัตโนมัติ · มาหรือสายได้ +2 EXP</p>
    </TeacherLayout>
  )
}
