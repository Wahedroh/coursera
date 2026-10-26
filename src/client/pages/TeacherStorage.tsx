import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Usage = { bytes: number; files: number; limitBytes: number; freeBytes: number; syncedAt: number | null }
type Candidate = { assignmentId: string; title: string; className: string; submissions: number; files: number; bytes: number; lastGradedAt: number }

export const fmtBytes = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
const dayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })

export default function TeacherStorage() {
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<{ usage: Usage; candidates: Candidate[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState(30)

  const load = useCallback(() => {
    api<{ usage: Usage; candidates: Candidate[] }>('/api/teacher/storage').then(setData).catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])

  async function run(path: string, body: unknown, confirmText: string, done: (r: { submissions?: number; files: number; bytes: number }) => string) {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ submissions?: number; files: number; bytes: number }>(path, { body })
      setFlash(done(r))
      load()
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  const purged = (r: { submissions?: number; files: number; bytes: number }) => `ลบรูปแล้ว ${r.files} ไฟล์ จากงาน ${r.submissions ?? 0} ชิ้น · คืนพื้นที่ ${fmtBytes(r.bytes)}`

  if (!data) return <TeacherLayout>{error ? <ErrorBox message={error} /> : <Loading />}</TeacherLayout>
  const { usage: u, candidates } = data
  const pct = Math.min(100, (u.bytes / u.freeBytes) * 100)
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-board'
  const total = candidates.reduce((n, c) => n + c.bytes, 0)

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">พื้นที่เก็บไฟล์</h1>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <b>
            ใช้ไป {fmtBytes(u.bytes)} จาก {fmtBytes(u.freeBytes)}
          </b>
          <span className="text-stone-500">{u.files} ไฟล์</span>
        </div>
        <div className="h-3 rounded-full bg-stone-100 overflow-hidden">
          <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-stone-500">
          {pct >= 90
            ? '⚠️ ใกล้เต็มแล้ว — ถ้าเกิน 9.5 GB นักเรียนจะแนบรูปไม่ได้ (ยังส่งข้อความได้) กรุณาลบรูปงานที่ตรวจแล้ว'
            : 'แพ็กเกจฟรีของ Cloudflare ได้ 10 GB · ระบบหยุดรับรูปใหม่ที่ 9.5 GB เพื่อไม่ให้เต็มกลางคาบ'}
        </p>
        <button type="button" className="self-start text-xs text-board underline" disabled={busy} onClick={() => api<Usage>('/api/teacher/storage/sync', { body: {} }).then(() => load()).catch((e) => setError(handle(e)))}>
          นับพื้นที่ใหม่
        </button>
      </Card>

      <Card className="p-4 flex flex-col gap-3">
        <h2 className="font-bold">ลบรูปงานที่ตรวจแล้ว</h2>
        <p className="text-sm text-stone-500">ลบเฉพาะรูป (รูปที่นักเรียนส่ง + รูปที่ครูเขียนทับ) ของงานที่ให้คะแนนแล้ว · คะแนน คอมเมนต์ และข้อความยังอยู่ครบ · งานที่ยังไม่ตรวจไม่ถูกลบ</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">ทุกงานที่ตรวจไว้นานกว่า</span>
          <select aria-label="นานกว่ากี่วัน" className="border-2 border-line rounded-xl px-2 py-1 bg-white" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90, 180].map((d) => (
              <option key={d} value={d}>
                {d} วัน
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => run('/api/teacher/storage/purge', { olderThanDays: days }, `ลบรูปของงานทุกชิ้นที่ตรวจไว้นานกว่า ${days} วัน? ลบแล้วกู้คืนไม่ได้ (คะแนนยังอยู่)`, purged)}
            className="py-2"
          >
            🗑 ลบรูปเก่า
          </Button>
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-stone-500">ไม่มีงานที่ตรวจแล้วและยังมีรูปค้างอยู่</p>
        ) : (
          <>
            <p className="text-sm">
              งานที่ตรวจแล้วยังมีรูปรวม <b>{fmtBytes(total)}</b>
            </p>
            <div className="divide-y divide-stone-100">
              {candidates.map((c) => (
                <div key={c.assignmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-bold">{c.title}</span>
                    <span className="block text-xs text-stone-500">
                      {c.className} · ตรวจแล้ว {c.submissions} คน · {c.files} รูป · {fmtBytes(c.bytes)} · ตรวจล่าสุด {dayFmt.format(c.lastGradedAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-red-200 text-red-700 bg-white px-3 py-1.5 text-xs font-bold"
                    onClick={() => run('/api/teacher/storage/purge', { assignmentId: c.assignmentId }, `ลบรูปของงาน "${c.title}" (${c.className}) ที่ตรวจแล้ว ${c.submissions} คน? กู้คืนไม่ได้ (คะแนนยังอยู่)`, purged)}
                    aria-label={`ลบรูปงาน ${c.title} ${c.className}`}
                  >
                    🗑 ลบรูปงานนี้
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        <h2 className="font-bold">ลบไฟล์ค้าง</h2>
        <p className="text-sm text-stone-500">รูปที่อัปโหลดแล้วไม่ได้กดส่ง หรือรูปที่ครูเขียนทับรอบก่อน (ไม่มีงานไหนใช้แล้ว อายุเกิน 1 วัน)</p>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          className="self-start py-2"
          onClick={() => run('/api/teacher/storage/purge-orphans', {}, 'ลบไฟล์ที่ไม่มีงานไหนใช้แล้ว?', (r) => `ลบไฟล์ค้างแล้ว ${r.files} ไฟล์ · คืนพื้นที่ ${fmtBytes(r.bytes)}`)}
        >
          ลบไฟล์ค้าง
        </Button>
      </Card>
    </TeacherLayout>
  )
}
