import { useState } from 'react'
import { api } from '../api'
import { STUDENT_TITLES, type AddStudentInput } from '../../shared/schemas'
import { Button, Card } from '../ui'

const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'
const EMPTY: AddStudentInput = { zipgradeId: '', title: 'เด็กชาย', firstName: '', lastName: '' }

/** เพิ่มนักเรียนทีละคน (ย้ายเข้ากลางเทอม / ตกหล่นจากไฟล์ ZipGrade) — นักเรียนตั้ง PIN เองตอนเข้าครั้งแรก */
export default function AddStudentForm({ classId, onAdded, onError }: { classId: string; onAdded: (name: string) => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<AddStudentInput>(EMPTY)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/api/teacher/classes/${classId}/students`, { body: v })
      onAdded(`${v.title ?? ''}${v.firstName} ${v.lastName}`.trim())
      setV({ ...EMPTY, title: v.title })
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
        + เพิ่มนักเรียน
      </button>
    )
  return (
    <Card className="p-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_1.5fr_auto] items-end">
        <label className="text-sm font-semibold">
          ZipGrade ID
          <input className={input} required maxLength={20} inputMode="numeric" value={v.zipgradeId} onChange={(e) => setV({ ...v, zipgradeId: e.target.value })} />
        </label>
        <label className="text-sm font-semibold">
          คำนำหน้า
          <select className={input} value={v.title ?? ''} onChange={(e) => setV({ ...v, title: (e.target.value || null) as AddStudentInput['title'] })}>
            {STUDENT_TITLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="">(ไม่มี)</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          ชื่อ
          <input className={input} required maxLength={100} value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
        </label>
        <label className="text-sm font-semibold">
          นามสกุล
          <input className={input} maxLength={100} value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
        </label>
        <Button type="submit" disabled={busy}>
          เพิ่ม
        </Button>
      </form>
      <div className="flex justify-between items-start gap-2 mt-2">
        <p className="text-xs text-stone-500">นักเรียนเข้าเว็บด้วย ZipGrade ID นี้แล้วตั้ง PIN เอง · ควรเพิ่มชื่อใน ZipGrade ด้วยรหัสเดียวกัน (ถ้านำเข้ารายชื่อจาก ZipGrade แบบ "ปิดใช้งานคนที่ไม่มีในไฟล์" คนที่ไม่มีใน ZipGrade จะถูกปิดใช้งาน)</p>
        <button type="button" className="text-sm text-stone-500 shrink-0" onClick={() => setOpen(false)}>
          ปิด
        </button>
      </div>
    </Card>
  )
}
