import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { leftText, MAKEUP_STATUS_LABEL, type StudentMakeup } from '../../shared/makeupExam'
import { formatDate } from '../lib/format'
import { resizeImage } from '../lib/image'
import { uploadImage } from '../lib/upload'
import { Button, Card, Chip, ErrorBox } from '../ui'
import Icon from './Icon'

const fmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** ขาดสอบ → นับถอยหลังสิทธิ์สอบย้อนหลัง · ขอสอบ · สถานะ · เข้าห้องสอบ */
export default function StudentMakeupCards({ actionable = false }: { actionable?: boolean }) {
  const [items, setItems] = useState<StudentMakeup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const load = useCallback(() => {
    let live = true
    api<StudentMakeup[]>('/api/student/makeups')
      .then((x) => live && setItems(x))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  // หน้าแรก: เฉพาะรายการที่ยังต้องทำอะไร (ขอสอบได้ · รออนุมัติ · ได้สิทธิ์แล้ว · กำลังสอบ)
  const shown = actionable ? items.filter((m) => (m.request ? ['pending', 'approved', 'in_progress'].includes(m.request.status) || (['rejected', 'expired'].includes(m.request.status) && (m.deadline ?? 0) > now) : (m.deadline ?? 0) > now)) : items
  if (!shown.length) return null
  return (
    <section className="flex flex-col gap-2" aria-label="สอบย้อนหลัง">
      <h2 className="font-bold">
        <Icon n="exam" /> สอบย้อนหลัง
      </h2>
      <ErrorBox message={error} />
      {shown.map((m) => (
        <MakeupCard key={m.scoreItemId} m={m} now={now} onDone={load} onError={setError} />
      ))}
    </section>
  )
}

function MakeupCard({ m, now, onDone, onError }: { m: StudentMakeup; now: number; onDone: () => void; onError: (e: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [imageKey, setImageKey] = useState<string | null>(null)
  const [mode, setMode] = useState<'online' | 'paper'>('online')
  const [busy, setBusy] = useState<string | null>(null)
  const r = m.request
  const left = m.deadline === null ? null : m.deadline - now
  const canRequest = m.deadline !== null && left! > 0 && (!r || r.status === 'rejected' || r.status === 'expired')

  async function attach(file: File | undefined) {
    if (!file) return
    setBusy('กำลังอัปโหลดรูป…')
    try {
      setImageKey(await uploadImage(await resizeImage(file, 1600, 0.8), 'submission'))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function send() {
    setBusy('กำลังส่ง…')
    onError(null)
    try {
      await api('/api/student/makeups', { body: { scoreItemId: m.scoreItemId, reason, imageKey, mode } })
      setOpen(false)
      onDone()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-testid="makeup-card">
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{m.title}</h3>
          <p className="text-xs text-stone-500">
            {r?.status === 'graded' ? 'สอบย้อนหลังแล้ว' : m.absent ? 'ขาดสอบ' : 'ยังไม่มีคะแนน'} · สอบวันที่ {formatDate(m.takenOn)} · เต็ม {m.maxScore}
          </p>
        </div>
        {r && r.status !== 'expired' ? <Chip tone={r.status === 'rejected' ? 'red' : r.status === 'graded' ? 'green' : 'amber'}>{MAKEUP_STATUS_LABEL[r.status]}</Chip> : null}
      </div>
      {(!r || ['pending', 'rejected', 'expired'].includes(r.status)) &&
        (m.deadline === null ? (
          <p className="text-sm text-stone-500">รายการนี้ครูไม่เปิดสอบย้อนหลัง</p>
        ) : left! > 0 ? (
          <p className={`text-sm font-bold ${left! < 3 * 86400_000 ? 'text-red-700' : 'text-amber-700'}`} data-testid="makeup-countdown">
            ⏳ เหลือเวลาขอสอบ/สอบ {leftText(left!)} (ถึง {fmt.format(m.deadline)}){m.absent ? ' · เลยกำหนดได้ 0' : ''}
          </p>
        ) : (
          <p className="text-sm font-bold text-red-700">หมดสิทธิ์สอบย้อนหลังแล้ว</p>
        ))}
      {r?.status === 'rejected' && r.teacherNote && <p className="text-sm text-red-700">ครู: {r.teacherNote}</p>}
      {r?.status === 'approved' && (
        <div className="rounded-xl bg-board-soft p-3 text-sm">
          <p>
            {r.mode === 'online' ? 'สอบออนไลน์' : 'สอบออนไซต์ (กระดาษต่อหน้าครู)'} · เริ่มได้ {r.opensAt && fmt.format(r.opensAt)} – {r.closesAt && fmt.format(r.closesAt)} · {r.durationMin} นาที{r.mode === 'online' && r.proctor ? ' · 📷 ต้องเปิดกล้อง (สแกนโต๊ะ + กล้องหน้า)' : ''}
          </p>
          {r.mode === 'online' &&
            (now >= (r.opensAt ?? 0) ? (
              <Link to={`/me/makeup/${r.id}`} className="mt-2 inline-block rounded-xl bg-board px-4 py-2 font-bold text-white">
                เข้าห้องสอบ (ต้องมีรหัสจากครู)
              </Link>
            ) : (
              <p className="mt-1 text-xs text-stone-500">ยังไม่ถึงเวลาสอบ</p>
            ))}
        </div>
      )}
      {r?.status === 'in_progress' && (
        <Link to={`/me/makeup/${r.id}`} className="self-start rounded-xl bg-board px-4 py-2 font-bold text-white">
          สอบต่อ
        </Link>
      )}
      {canRequest &&
        (open ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2" role="radiogroup" aria-label="รูปแบบสอบย้อนหลัง">
              {(['online', 'paper'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`flex-1 rounded-xl border-2 px-2 py-2 text-sm font-bold ${mode === k ? 'border-board bg-board-soft text-board' : 'border-line bg-white'}`}>
                  {k === 'online' ? '💻 ออนไลน์' : '🏫 ออนไซต์'}
                  <span className="block text-xs font-normal text-stone-500">{k === 'online' ? 'สอบในแอป (ต้องมีรหัสจากครู)' : 'สอบกระดาษต่อหน้าครู'}</span>
                </button>
              ))}
            </div>
            <textarea aria-label="เหตุผลที่ขอสอบย้อนหลัง" className="rounded-xl border-2 border-line bg-white px-3 py-2" rows={2} maxLength={300} placeholder="เหตุผล เช่น ป่วย มีใบรับรองแพทย์" value={reason} onChange={(e) => setReason(e.target.value)} />
            <label className="self-start rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm cursor-pointer">
              {imageKey ? '✓ แนบรูปแล้ว' : '📎 แนบหลักฐาน (ไม่บังคับ)'}
              <input type="file" accept="image/*" className="sr-only" aria-label="หลักฐาน" onChange={(e) => void attach(e.target.files?.[0])} />
            </label>
            <Button onClick={() => void send()} disabled={!!busy || !reason.trim()}>
              {busy ?? 'ส่งคำขอให้ครู'}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setOpen(true)}>{r ? 'ขอสอบใหม่' : 'ขอสอบย้อนหลัง'}</Button>
        ))}
    </Card>
    </div>
  )
}
