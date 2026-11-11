import { useEffect, useState } from 'react'
import { api } from '../api'
import { EMPTY_PAYMENT, hasPayment, type PaymentInfo } from '../../shared/fees'
import { resizeImage } from '../lib/image'
import { fileUrl, uploadImage } from '../lib/upload'
import { Button, Card } from '../ui'

const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

/** นักเรียน: ช่องทางโอนจ่าย (เลขบัญชี + QR) — แสดงเมื่อมียอดค้างและครูตั้งไว้ */
export function StudentPayment({ owed }: { owed: string }) {
  const [p, setP] = useState<PaymentInfo | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    api<PaymentInfo>('/api/student/fees/payment-info')
      .then(setP)
      .catch(() => {})
  }, [])
  if (!p || !hasPayment(p)) return null
  return (
    <div data-testid="payment-info">
      <Card className="p-4 flex flex-col gap-3 bg-amber-50 border-amber-200">
        <b>💸 ช่องทางโอนจ่าย · ยอดค้าง {owed}</b>
        {p.accountNumber && (
          <div className="rounded-xl bg-white border border-line p-3 text-sm">
            {p.bank && <div className="text-stone-500">{p.bank}</div>}
            <div className="flex items-center justify-between gap-2">
              <b className="text-xl tracking-wider tabular-nums">{p.accountNumber}</b>
              <button
                type="button"
                className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold shrink-0"
                onClick={() => {
                  void navigator.clipboard?.writeText(p.accountNumber.replace(/[^0-9]/g, '')).then(() => setCopied(true))
                }}
              >
                {copied ? '✓ คัดลอกแล้ว' : 'คัดลอกเลขบัญชี'}
              </button>
            </div>
            {p.accountName && <div>ชื่อบัญชี: {p.accountName}</div>}
          </div>
        )}
        {p.qrKey && (
          <a href={fileUrl(p.qrKey)} target="_blank" rel="noreferrer" className="self-center">
            <img src={fileUrl(p.qrKey)} alt="QR สำหรับโอนจ่ายค่าเอกสาร" className="max-h-72 rounded-xl border border-line bg-white" />
          </a>
        )}
        {p.qrKey && <p className="text-xs text-stone-500 text-center">สแกน QR ด้วยแอปธนาคาร (แตะรูปเพื่อขยาย/บันทึก)</p>}
        {p.note && <p className="text-sm whitespace-pre-line">{p.note}</p>}
        <p className="text-xs text-stone-500">โอนแล้วแจ้งครูพร้อมสลิป ครูจะบันทึกยอดในระบบให้</p>
      </Card>
    </div>
  )
}

/** ครู: ตั้งเลขบัญชี/QR ที่นักเรียนเห็นเมื่อค้างค่าเอกสาร (ใช้ร่วมกันทุกห้อง) */
export function TeacherPaymentSettings({ onError }: { onError: (e: unknown) => void }) {
  const [p, setP] = useState<PaymentInfo>(EMPTY_PAYMENT)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    api<PaymentInfo>('/api/teacher/payment-info').then(setP).catch(onError)
  }, [onError])
  const set = (x: Partial<PaymentInfo>) => {
    setP({ ...p, ...x })
    setSaved(false)
  }
  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      set({ qrKey: await uploadImage(await resizeImage(file, 1200, 0.9), 'payment') })
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/teacher/payment-info', { method: 'PUT', body: p })
      setSaved(true)
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-testid="payment-settings">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold">💸 ช่องทางโอนจ่าย (เลขบัญชี / QR)</h2>
            <p className="text-xs text-stone-500">{hasPayment(p) ? `ตั้งไว้แล้ว${p.accountNumber ? ` · ${p.bank} ${p.accountNumber}` : ''}${p.qrKey ? ' · มี QR' : ''}` : 'ยังไม่ได้ตั้ง — นักเรียนที่ค้างจะยังไม่เห็นช่องทางจ่าย'}</p>
          </div>
          <button type="button" className="rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm font-bold" onClick={() => setOpen(!open)}>
            {open ? 'ปิด' : hasPayment(p) ? 'แก้ไข' : 'ตั้งค่า'}
          </button>
        </div>
        {open && (
          <form onSubmit={save} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                ธนาคาร / พร้อมเพย์
                <input className={input} maxLength={60} placeholder="เช่น กสิกรไทย หรือ พร้อมเพย์" value={p.bank} onChange={(e) => set({ bank: e.target.value })} />
              </label>
              <label className="text-sm font-semibold">
                เลขบัญชี / เบอร์พร้อมเพย์
                <input className={input} maxLength={40} inputMode="numeric" placeholder="123-4-56789-0" value={p.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} />
              </label>
              <label className="text-sm font-semibold">
                ชื่อบัญชี
                <input className={input} maxLength={100} value={p.accountName} onChange={(e) => set({ accountName: e.target.value })} />
              </label>
              <label className="text-sm font-semibold">
                หมายเหตุถึงนักเรียน (ไม่บังคับ)
                <input className={input} maxLength={300} placeholder="เช่น โอนแล้วส่งสลิปทางไลน์ห้อง" value={p.note} onChange={(e) => set({ note: e.target.value })} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {p.qrKey && <img src={fileUrl(p.qrKey)} alt="QR รับเงินที่ตั้งไว้" className="max-h-40 rounded-xl border border-line bg-white" />}
              <label className="rounded-xl border-2 border-line bg-white px-3 py-2 text-sm font-bold cursor-pointer">
                {busy ? 'กำลังอัปโหลด…' : p.qrKey ? '🖼️ เปลี่ยนรูป QR' : '🖼️ แนบรูป QR รับเงิน'}
                <input type="file" accept="image/*" className="sr-only" aria-label="รูป QR รับเงิน" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
              </label>
              {p.qrKey && (
                <button type="button" className="text-sm text-red-700 underline" onClick={() => set({ qrKey: null })}>
                  เอา QR ออก
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                บันทึกช่องทางโอนจ่าย
              </Button>
              {saved && <span className="text-sm font-semibold text-board">✓ บันทึกแล้ว</span>}
            </div>
            <p className="text-xs text-stone-500">นักเรียนเห็นเฉพาะเมื่อมียอดค้าง · ใช้ร่วมกันทุกห้อง · ระบบไม่ได้ตัดยอดเอง ครูบันทึกการจ่ายเหมือนเดิม</p>
          </form>
        )}
      </Card>
    </div>
  )
}
