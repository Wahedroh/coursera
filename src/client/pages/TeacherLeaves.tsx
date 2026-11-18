import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { LEAVE_LABEL, LEAVE_STATUS_LABEL, leaveDays, type TeacherLeaveItem, type TeacherLeaves as Data } from '../../shared/leave'
import Icon from '../components/Icon'
import { fileUrl } from '../lib/upload'
import { Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const sent = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** ใบลาของนักเรียน: อนุมัติแล้วระบบใส่ป่วย/ลาในการเช็กชื่อให้ */
export default function TeacherLeaves() {
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const load = useCallback(() => {
    api<Data>('/api/teacher/leaves')
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])

  async function decide(l: TeacherLeaveItem, approve: boolean, note: string) {
    setError(null)
    try {
      const r = await api<{ applied: number }>(`/api/teacher/leaves/${l.id}`, { method: 'PUT', body: { approve, note } })
      setFlash(approve ? `อนุมัติใบลา ${l.studentName} แล้ว${r.applied ? ` · เปลี่ยนเช็กชื่อเป็น${l.kind === 'sick' ? 'ป่วย' : 'ลา'} ${r.applied} วัน` : ' · วันที่ยังไม่เช็กชื่อ ระบบจะใส่ให้ตอนเปิดเช็กชื่อ'}` : `ไม่อนุมัติใบลา ${l.studentName}`)
      load()
    } catch (e) {
      setError(handle(e))
    }
  }

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">
        <Icon n="doc" /> ใบลานักเรียน
      </h1>
      <ErrorBox message={error} />
      {flash && (
        <p className="rounded-xl bg-board-soft text-board px-3 py-2 text-sm font-semibold" role="status">
          {flash}
        </p>
      )}
      {!data && !error && <Loading />}
      {data && (
        <>
          <section className="flex flex-col gap-2" aria-label="รออนุมัติ">
            <h2 className="font-bold">รออนุมัติ ({data.pending.length})</h2>
            {!data.pending.length && <p className="text-sm text-stone-500">ไม่มีใบลารออนุมัติ</p>}
            {data.pending.map((l) => (
              <PendingCard key={l.id} l={l} onDecide={decide} />
            ))}
          </section>
          {data.recent.length > 0 && (
            <section className="flex flex-col gap-1">
              <h2 className="font-bold mt-2">พิจารณาแล้ว</h2>
              <Card className="p-3">
                <ul className="text-sm">
                  {data.recent.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-stone-100 py-1.5 last:border-0">
                      <b>{l.studentName}</b>
                      <span className="text-stone-500">{l.className}</span>
                      <span>
                        {LEAVE_LABEL[l.kind]} {leaveDays(l)}
                      </span>
                      <span className="ml-auto">
                        <Chip tone={l.status === 'approved' ? 'green' : 'red'}>{LEAVE_STATUS_LABEL[l.status]}</Chip>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </TeacherLayout>
  )
}

function PendingCard({ l, onDecide }: { l: TeacherLeaveItem; onDecide: (l: TeacherLeaveItem, approve: boolean, note: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (approve: boolean) => {
    setBusy(true)
    await onDecide(l, approve, note)
    setBusy(false)
  }
  return (
    <div data-testid={`leave-${l.zipgradeId}`}>
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-lg">{l.studentName}</b>
          <span className="text-sm text-stone-500">
            {l.className} · เลขที่ {l.zipgradeId}
          </span>
          <span className="ml-auto">
            <Chip tone={l.kind === 'sick' ? 'blue' : 'purple'}>{LEAVE_LABEL[l.kind]}</Chip>
          </span>
        </div>
        <p className="font-semibold">
          <Icon n="calendar" /> {leaveDays(l)}
        </p>
        <p className="text-sm">“{l.reason}”</p>
        {l.imageKey && (
          <a href={fileUrl(l.imageKey)} target="_blank" rel="noreferrer" className="self-start">
            <img src={fileUrl(l.imageKey)} alt="รูปแนบใบลา" className="max-h-40 rounded-lg border border-line" />
          </a>
        )}
        <p className="text-xs text-stone-400">ส่งเมื่อ {sent.format(l.createdAt)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={`หมายเหตุถึง ${l.studentName}`} className="flex-1 min-w-40 rounded-xl border-2 border-line px-3 py-1.5 text-sm" placeholder="หมายเหตุถึงนักเรียน (ไม่บังคับ)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" disabled={busy} onClick={() => void go(true)} className="rounded-xl bg-board text-white px-4 py-1.5 font-bold disabled:opacity-50">
            <Icon n="check" /> อนุมัติ
          </button>
          <button type="button" disabled={busy} onClick={() => void go(false)} className="rounded-xl border-2 border-red-300 text-red-700 px-4 py-1.5 font-bold disabled:opacity-50">
            ไม่อนุมัติ
          </button>
        </div>
      </Card>
    </div>
  )
}
