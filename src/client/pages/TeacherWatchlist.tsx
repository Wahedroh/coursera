import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { exportWatchlist } from '../lib/excel'
import { formatDate } from '../lib/format'
import { REASON_LABEL, type WatchReason, type Watchlist, type WatchlistQuery } from '../../shared/watchlist'
import { Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const TONE: Record<WatchReason, 'red' | 'amber' | 'purple' | 'gray'> = { missing: 'red', absent: 'amber', grade: 'purple', no_pin: 'gray' }
const num = 'w-14 border-2 border-line rounded-lg px-2 py-1 mx-1'

export default function TeacherWatchlist() {
  const handle = useTeacherErrorHandler()
  const [q, setQ] = useState<WatchlistQuery>({ missing: 3, absent: 3, days: 30, grade: 1 })
  const [data, setData] = useState<Watchlist | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<WatchReason | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(() => {
    const qs = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))
    api<Watchlist>(`/api/teacher/watchlist?${qs}`).then(setData).catch((e) => setError(handle(e)))
  }, [q, handle])
  useEffect(load, [load])

  const set = (k: keyof WatchlistQuery) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    if (Number.isFinite(v) && v >= (k === 'grade' ? 0 : 1)) setQ((x) => ({ ...x, [k]: v }))
  }
  const shown = data?.classes.map((c) => ({ ...c, students: c.students.filter((s) => filter === 'all' || s.reasons.includes(filter)) })).filter((c) => c.students.length > 0)
  const count = (r: WatchReason | 'all') => data?.classes.reduce((n, c) => n + c.students.filter((s) => r === 'all' || s.reasons.includes(r)).length, 0) ?? 0

  return (
    <TeacherLayout>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <h1 className="text-2xl font-extrabold">นักเรียนที่ต้องติดตาม</h1>
        {data && (
          <button type="button" onClick={() => void exportWatchlist({ ...data, classes: shown ?? [] })} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
            ⬇ Excel
          </button>
        )}
      </div>
      <Card className="p-3 text-sm flex flex-wrap gap-x-5 gap-y-2 items-center">
        <label>
          ค้างงานเลยกำหนด ≥<input type="number" min={1} className={num} value={q.missing} onChange={set('missing')} aria-label="ค้างงานอย่างน้อย" />
          ชิ้น
        </label>
        <label>
          ขาดเรียน ≥<input type="number" min={1} className={num} value={q.absent} onChange={set('absent')} aria-label="ขาดอย่างน้อย" />
          ครั้ง ใน<input type="number" min={1} className={num} value={q.days} onChange={set('days')} aria-label="ช่วงวัน" />
          วันล่าสุด
        </label>
        <label>
          เกรดคาดการณ์ ≤<input type="number" min={0} max={4} step={0.5} className={num} value={q.grade} onChange={set('grade')} aria-label="เกรดไม่เกิน" />
        </label>
      </Card>
      <div className="flex flex-wrap gap-1" role="tablist">
        {(['all', 'missing', 'absent', 'grade', 'no_pin'] as const).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={filter === r} onClick={() => setFilter(r)} className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === r ? 'bg-board text-white' : 'bg-stone-100 text-stone-600'}`}>
            {r === 'all' ? 'ทั้งหมด' : REASON_LABEL[r]} {count(r)}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {!data && !error && <Loading />}
      {shown?.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">🎉 ไม่มีนักเรียนที่เข้าเงื่อนไข</Card>}
      {shown?.map((c) => (
        <Card key={c.id} className="p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <Link to={`/teacher/classes/${c.id}`} className="font-bold">
              {c.name}
            </Link>
            <span className="text-xs text-stone-500">
              {c.students.length}/{c.total} คน
            </span>
          </div>
          <div className="divide-y divide-stone-100">
            {c.students.map((s) => (
              <div key={s.id} className="py-2 flex flex-col gap-1">
                <button type="button" className="flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs text-stone-400 font-mono">{s.zipgradeId}</span>
                  {s.reasons.map((r) => (
                    <Chip key={r} tone={TONE[r]}>
                      {r === 'missing' ? `ค้าง ${s.missing} งาน` : r === 'absent' ? `ขาด ${s.absent} ครั้ง` : r === 'grade' ? `เกรด ${s.grade}` : REASON_LABEL[r]}
                    </Chip>
                  ))}
                </button>
                {open === s.id && (
                  <div className="text-xs text-stone-600 rounded-xl bg-stone-50 p-2">
                    <p>งานที่ค้าง ({s.missing}): {s.missingTitles.join(', ') || '–'}</p>
                    <p>
                      ตั้งแต่ {formatDate(data!.from)}: ขาด {s.absent} · สาย {s.late}
                    </p>
                    <p>เกรดคาดการณ์: {s.grade ?? 'ยังไม่มี'}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
      <p className="text-xs text-stone-500">ค้างงาน = เลยกำหนดแล้วยังไม่ส่ง หรือครูส่งกลับให้แก้ · แตะชื่อเพื่อดูรายละเอียด · เฉพาะนักเรียนที่ยังใช้งานอยู่</p>
    </TeacherLayout>
  )
}
