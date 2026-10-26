import qrcode from 'qrcode-generator'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../api'
import type { AttendanceDay } from '../../shared/attendance'
import { ErrorBox } from '../ui'
import { useTeacherErrorHandler } from './useTeacherGuard'

function qrSvg(text: string): string {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true })
}

export default function TeacherCheckinScreen() {
  const { dayId = '' } = useParams()
  const navigate = useNavigate()
  const handle = useTeacherErrorHandler()
  const [qr, setQr] = useState<{ url: string; ttlMs: number } | null>(null)
  const [day, setDay] = useState<AttendanceDay | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let stop = false
    async function refresh() {
      // ใช้ ttlMs จากเซิร์ฟเวอร์ ไม่พึ่งนาฬิกาเครื่อง · พลาดก็ลองใหม่ ไม่ให้ QR ค้างจนหมดอายุ
      let wait = 3000
      try {
        const next = await api<{ url: string; ttlMs: number }>(`/api/teacher/attendance/${dayId}/qr`)
        if (stop) return
        setQr(next)
        setError(null)
        wait = Math.max(2000, next.ttlMs + 300)
      } catch (e) {
        if (!stop) setError(handle(e))
      } finally {
        if (!stop) timer = setTimeout(refresh, wait)
      }
    }
    api(`/api/teacher/attendance/${dayId}/self-checkin`, { method: 'PUT', body: { open: true } })
      .then(refresh)
      .catch((e) => setError(handle(e)))
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [dayId, handle])

  useEffect(() => {
    const load = () => api<AttendanceDay>(`/api/teacher/attendance/${dayId}`).then(setDay).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [dayId])

  async function close() {
    await api(`/api/teacher/attendance/${dayId}/self-checkin`, { method: 'PUT', body: { open: false } }).catch(() => {})
    navigate(-1)
  }

  const checked = day?.records.filter((r) => r.source === 'self') ?? []
  return (
    <main className="min-h-screen bg-[#16352A] text-white p-6 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <button type="button" onClick={close} className="rounded-xl bg-white/15 px-4 py-2 font-bold">
          ปิดการเช็กอินเอง
        </button>
        <span className="opacity-80">{day?.day?.date}</span>
      </div>
      <ErrorBox message={error} />
      <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start justify-center flex-1">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl font-extrabold text-center">สแกนเพื่อเช็กชื่อ</h1>
          {qr && <div className="bg-white rounded-2xl p-3 w-72 max-w-full" dangerouslySetInnerHTML={{ __html: qrSvg(new URL(qr.url, location.origin).toString()) }} />}
          <p className="text-sm opacity-80">QR เปลี่ยนทุก 30 วินาที · ต้องเข้าสู่ระบบก่อนสแกน</p>
          {qr && (
            <a data-testid="checkin-url" href={qr.url} className="text-xs underline opacity-60">
              ลิงก์เช็กอิน
            </a>
          )}
        </div>
        <div className="bg-white/10 rounded-2xl p-4 w-full max-w-sm">
          <h2 className="font-bold mb-2">เช็กอินแล้ว {checked.length} คน</h2>
          <ul data-testid="checked-in" className="text-sm grid grid-cols-2 gap-1">
            {checked.map((r) => (
              <li key={r.studentId}>✓ {r.firstName}</li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
