import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../api'
import { baht, type FeeItemSummary } from '../../shared/fees'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

export default function TeacherFees() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const handle = useTeacherErrorHandler()
  const [items, setItems] = useState<FeeItemSummary[] | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [className, setClassName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [classIds, setClassIds] = useState<string[]>([id])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setClassIds([id])
    api<FeeItemSummary[]>(`/api/teacher/classes/${id}/fee-items`).then(setItems).catch((e) => setError(handle(e)))
    api<School[]>('/api/teacher/classes')
      .then((s) => {
        setSchools(s)
        setClassName(s.flatMap((x) => x.classes).find((c) => c.id === id)?.name ?? '')
      })
      .catch((e) => setError(handle(e)))
  }, [id, handle])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { ids } = await api<{ ids: string[] }>('/api/teacher/fee-items', { body: { title, amount: Number(amount), classIds } })
      navigate(`/teacher/fee-items/${ids[classIds.indexOf(id)] ?? ids[0]}`)
    } catch (err) {
      setError(handle(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (cid: string) => setClassIds((xs) => (xs.includes(cid) ? xs.filter((x) => x !== cid) : [...xs, cid]))
  const totalOutstanding = items?.reduce((n, i) => n + i.outstanding, 0) ?? 0

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← {className || 'หน้าห้อง'}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <h1 className="text-2xl font-extrabold">ค่าเอกสารเรียน</h1>
        {items && items.length > 0 && (
          <span className="text-sm">
            ค้างรวมทั้งห้อง <b className="text-red-700">{baht(totalOutstanding)}</b>
          </span>
        )}
      </div>
      <ErrorBox message={error} />
      {!items && !error && <Loading />}
      {items?.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีรายการค่าเอกสาร</Card>}
      {items && items.length > 0 && (
        <Card className="divide-y divide-stone-100">
          {items.map((it) => (
            <Link key={it.id} to={`/teacher/fee-items/${it.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-stone-50">
              <span>
                <span className="font-bold">{it.title}</span>
                <span className="block text-xs text-stone-500">
                  ราคา {baht(it.amount)} · ต้องจ่าย {it.charged} คน · จ่ายครบ {it.paidInFull} คน
                </span>
              </span>
              {it.outstanding > 0 ? <Chip tone="red">ค้าง {baht(it.outstanding)}</Chip> : <Chip tone="green">{it.charged ? 'เก็บครบแล้ว' : 'ยังไม่เลือกนักเรียน'}</Chip>}
            </Link>
          ))}
        </Card>
      )}
      <form onSubmit={create} className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">+ สร้างรายการค่าเอกสาร</h2>
          <label className="text-sm font-semibold">
            ชื่อรายการ
            <input className={input} required maxLength={200} placeholder="เช่น ชีทบทที่ 1-3" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="text-sm font-semibold">
            ราคา (บาท)
            <input type="number" min={0.01} step={0.01} max={100000} required className={`${input} max-w-40`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <p className="text-xs text-stone-500">สร้างแล้วเลือกนักเรียนที่ต้องจ่ายได้ในหน้าถัดไป</p>
        </Card>
        <Card className="p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold">สร้างให้ห้อง</p>
          {schools.map((s) => (
            <fieldset key={s.schoolId} className="border-t border-stone-100 pt-2">
              <legend className="text-xs text-stone-500">{s.schoolName}</legend>
              {s.classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm py-0.5">
                  <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => toggle(c.id)} aria-label={c.name} />
                  {c.grade !== null ? `ชั้น ${c.grade}` : c.name}
                </label>
              ))}
            </fieldset>
          ))}
          <Button type="submit" disabled={busy || classIds.length === 0}>
            สร้างรายการ
          </Button>
        </Card>
      </form>
    </TeacherLayout>
  )
}
