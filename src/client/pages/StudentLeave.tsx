import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { todayBangkok } from '../../shared/attendance'
import { addDays, LEAVE_AHEAD_DAYS, LEAVE_BACK_DAYS, LEAVE_KINDS, LEAVE_LABEL, LEAVE_STATUS_LABEL, leaveDays, type LeaveItem, type LeaveKind } from '../../shared/leave'
import Icon from '../components/Icon'
import { resizeImage } from '../lib/image'
import { fileUrl, uploadImage } from '../lib/upload'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'

const TONE = { pending: 'amber', approved: 'green', rejected: 'red' } as const

/** นักเรียนขอลาป่วย/ลากิจ + ดูผลการอนุมัติ */
export default function StudentLeave() {
  const navigate = useNavigate()
  const today = todayBangkok()
  const [items, setItems] = useState<LeaveItem[] | null>(null)
  const [kind, setKind] = useState<LeaveKind>('sick')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [reason, setReason] = useState('')
  const [imageKey, setImageKey] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const load = useCallback(() => {
    api<LeaveItem[]>('/api/student/leaves')
      .then(setItems)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])
  useEffect(load, [load])

  async function attach(file: File | undefined) {
    if (!file) return
    setBusy('กำลังอัปโหลดรูป…')
    setError(null)
    try {
      setImageKey(await uploadImage(await resizeImage(file, 1600, 0.8), 'submission'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function submit() {
    setBusy('กำลังส่ง…')
    setError(null)
    try {
      await api('/api/student/leaves', { body: { kind, from, to: to < from ? from : to, reason, imageKey } })
      setReason('')
      setImageKey(null)
      setDone(true)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function cancel(id: string) {
    if (!window.confirm('ยกเลิกใบลานี้?')) return
    try {
      await api(`/api/student/leaves/${id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const input = 'w-full rounded-xl border-2 border-line bg-white px-3 py-2'
  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">
          <Icon n="doc" /> ขอลาป่วย / ลากิจ
        </h1>
        <p className="text-sm opacity-90">ครูอนุมัติแล้ว วันที่ลาจะไม่นับขาดเรียน</p>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {done && (
          <p className="rounded-xl bg-board-soft text-board px-3 py-2 text-sm font-semibold" role="status">
            <Icon n="check" /> ส่งใบลาแล้ว รอครูอนุมัติ
          </p>
        )}
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex gap-2" role="radiogroup" aria-label="ประเภทการลา">
            {LEAVE_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`flex-1 rounded-xl border-2 py-2 font-bold ${kind === k ? 'border-board bg-board-soft text-board' : 'border-line bg-white'}`}>
                {LEAVE_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label className="flex-1 text-xs font-semibold text-stone-600">
              ตั้งแต่วันที่
              <input type="date" className={input} value={from} min={addDays(today, -LEAVE_BACK_DAYS)} max={addDays(today, LEAVE_AHEAD_DAYS)} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex-1 text-xs font-semibold text-stone-600">
              ถึงวันที่
              <input type="date" className={input} value={to < from ? from : to} min={from} max={addDays(today, LEAVE_AHEAD_DAYS)} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <label className="text-xs font-semibold text-stone-600">
            เหตุผล
            <textarea className={input} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'sick' ? 'เช่น มีไข้ หมอให้พัก 1 วัน' : 'เช่น ไปงานบวชพี่ชาย'} />
          </label>
          <div className="flex items-center gap-2">
            <label className="rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm font-semibold cursor-pointer">
              <Icon n="camera" /> {imageKey ? 'เปลี่ยนรูป' : 'แนบรูป (ใบรับรองแพทย์/ผู้ปกครอง)'}
              <input type="file" accept="image/*" className="sr-only" aria-label="แนบรูปใบลา" onChange={(e) => void attach(e.target.files?.[0])} />
            </label>
            {imageKey && <img src={fileUrl(imageKey)} alt="รูปที่แนบ" className="h-12 w-12 rounded-lg object-cover border border-line" />}
          </div>
          <Button onClick={submit} disabled={!!busy || !reason.trim()}>
            {busy ?? 'ส่งใบลา'}
          </Button>
        </Card>

        <h2 className="font-bold mt-2">ใบลาของฉัน</h2>
        {!items && !error && <Loading />}
        {items?.length === 0 && <p className="text-sm text-stone-500 text-center py-4">ยังไม่เคยส่งใบลา</p>}
        {items?.map((l) => (
          <Card key={l.id} className="p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <b>
                {LEAVE_LABEL[l.kind]} · {leaveDays(l)}
              </b>
              <Chip tone={TONE[l.status]}>{LEAVE_STATUS_LABEL[l.status]}</Chip>
            </div>
            <p className="text-sm text-stone-600">{l.reason}</p>
            {l.teacherNote && <p className="text-sm text-board">ครู: {l.teacherNote}</p>}
            {l.status === 'pending' && (
              <button type="button" className="self-start text-xs underline text-stone-500" onClick={() => void cancel(l.id)}>
                ยกเลิกใบลานี้
              </button>
            )}
          </Card>
        ))}
      </section>
    </main>
  )
}
