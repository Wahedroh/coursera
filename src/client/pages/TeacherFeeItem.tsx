import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, fullName } from '../api'
import { baht, outstanding, type FeeRow, type FeeSheet } from '../../shared/fees'
import { exportFees } from '../lib/excel'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

/** charge = ค่าที่บันทึกแล้ว; amountText/paidText/noteText = ค่าที่กำลังพิมพ์ */
type Row = FeeRow & { amountText: string; paidText: string; noteText: string; invalid: string | false; saving: boolean }
const toRow = (s: FeeRow): Row => ({
  ...s,
  amountText: s.charge ? String(s.charge.amount) : '',
  paidText: s.charge ? String(s.charge.paid) : '',
  noteText: s.charge?.note ?? '',
  invalid: false,
  saving: false,
})
const num = (t: string) => {
  const v = Number(t.trim().replace(',', ''))
  return t.trim() !== '' && Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? v : NaN
}
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

export default function TeacherFeeItem() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const handle = useTeacherErrorHandler()
  const [sheet, setSheet] = useState<FeeSheet | null>(null)
  const [rows, setRowsState] = useState<Row[]>([])
  const rowsRef = useRef<Row[]>([])
  const queues = useRef(new Map<string, Promise<void>>())
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const setRows = useCallback((f: (rs: Row[]) => Row[]) => {
    rowsRef.current = f(rowsRef.current)
    setRowsState(rowsRef.current)
  }, [])
  const patch = useCallback((sid: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === sid ? { ...r, ...p } : r))), [setRows])

  const load = useCallback(() => {
    api<FeeSheet>(`/api/teacher/fee-items/${id}`)
      .then((s) => {
        setSheet(s)
        setRows(() => s.students.map(toRow))
      })
      .catch((e) => setError(handle(e)))
  }, [id, handle, setRows])
  useEffect(load, [load])

  /** บันทึกแถว (เข้าคิวต่อคน อ่านค่าล่าสุดตอนถึงคิว) */
  const commit = useCallback(
    (sid: string, over: { paidAll?: boolean } = {}) => {
      const run = async () => {
        const r = rowsRef.current.find((x) => x.id === sid)
        if (!r?.charge) return
        const amount = num(r.amountText)
        const paid = over.paidAll ? amount : num(r.paidText)
        if (!(amount > 0)) return patch(sid, { invalid: 'ยอดต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)' })
        if (!(paid >= 0) || paid > amount) return patch(sid, { invalid: 'จ่ายแล้วต้องไม่เกินยอด' })
        const body = { amount, paid, note: r.noteText.trim() }
        if (body.amount === r.charge.amount && body.paid === r.charge.paid && body.note === r.charge.note) return patch(sid, { invalid: false, paidText: String(paid) })
        patch(sid, { saving: true, invalid: false })
        const still = () => !!rowsRef.current.find((x) => x.id === sid)?.charge
        try {
          await api(`/api/teacher/fee-items/${id}/charges/${sid}`, { method: 'PUT', body })
          if (still()) patch(sid, { charge: body, saving: false, paidText: String(paid), amountText: String(amount) })
          setError(null)
        } catch (e) {
          // บันทึกไม่สำเร็จ: กลับไปค่าที่บันทึกไว้ ไม่ให้หน้าจอหลอกว่าบันทึกแล้ว
          const c = rowsRef.current.find((x) => x.id === sid)?.charge
          patch(sid, { saving: false, ...(c ? { amountText: String(c.amount), paidText: String(c.paid), noteText: c.note } : {}) })
          setError(handle(e))
        }
      }
      const next = (queues.current.get(sid) ?? Promise.resolve()).then(run)
      queues.current.set(sid, next)
      return next
    },
    [id, patch, handle],
  )

  async function addCharges(studentIds: string[]) {
    if (studentIds.length === 0 || !sheet) return
    // แสดงทันที (เซิร์ฟเวอร์สร้างด้วยราคาเดียวกัน) — ไม่โหลดทั้งตารางใหม่ ไม่ให้ทับช่องที่กำลังพิมพ์
    const amount = sheet.item.amount
    const ids = new Set(studentIds.filter((sid) => !rowsRef.current.find((r) => r.id === sid)?.charge))
    if (ids.size === 0) return
    setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, charge: { amount, paid: 0, note: '' }, amountText: String(amount), paidText: '0', noteText: '' } : r)))
    try {
      await api(`/api/teacher/fee-items/${id}/charges/bulk`, { body: { studentIds: [...ids] } })
    } catch (e) {
      setError(handle(e))
      setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, charge: null, amountText: '', paidText: '', noteText: '' } : r)))
    }
  }

  function removeCharge(r: Row) {
    if (r.charge && r.charge.paid > 0 && !window.confirm(`${fullName(r)} จ่ายแล้ว ${baht(r.charge.paid)} — ยกเลิกการเรียกเก็บ?`)) return
    // เข้าคิวเดียวกับการบันทึกอัตโนมัติ: ไม่ให้ PUT ที่ค้างอยู่สร้างยอดกลับมาหลังลบ
    const run = async () => {
      try {
        await api(`/api/teacher/fee-items/${id}/charges/${r.id}`, { method: 'DELETE' })
        patch(r.id, { charge: null, amountText: '', paidText: '', noteText: '', invalid: false })
      } catch (e) {
        setError(handle(e))
      }
    }
    queues.current.set(r.id, (queues.current.get(r.id) ?? Promise.resolve()).then(run))
  }

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      await api(`/api/teacher/fee-items/${id}`, { method: 'PUT', body: { title: String(f.get('title')), amount: Number(f.get('amount')) } })
      setEditing(false)
      setSheet((s) => (s ? { ...s, item: { ...s.item, title: String(f.get('title')), amount: Number(f.get('amount')) } } : s))
    } catch (err) {
      setError(handle(err))
    }
  }

  async function remove() {
    if (!sheet || !window.confirm(`ลบรายการ "${sheet.item.title}" และยอดทั้งหมด?`)) return
    try {
      await api(`/api/teacher/fee-items/${id}`, { method: 'DELETE' })
      navigate(`/teacher/classes/${sheet.item.classId}/fees`, { replace: true })
    } catch (e) {
      setError(handle(e))
    }
  }

  if (!sheet) return <TeacherLayout>{error ? <ErrorBox message={error} /> : <Loading />}</TeacherLayout>
  const charged = rows.filter((r) => r.charge)
  const totalOut = charged.reduce((n, r) => n + outstanding(r.charge!), 0)
  const fullPaid = charged.filter((r) => outstanding(r.charge!) === 0).length
  const uncharged = rows.filter((r) => !r.charge)

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${sheet.item.classId}/fees`} className="text-sm text-stone-500">
        ← ค่าเอกสาร · {sheet.class.name}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{sheet.item.title}</h1>
          <p className="text-sm text-stone-500">ราคา {baht(sheet.item.amount)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold" onClick={() => exportFees({ ...sheet, students: rows })}>
            ⬇ Excel
          </button>
          <button type="button" className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold" onClick={() => setEditing((v) => !v)}>
            แก้รายละเอียด
          </button>
        </div>
      </div>
      {editing && (
        <Card className="p-4">
          <form onSubmit={saveDetails} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] items-end">
            <label className="text-sm font-semibold">
              ชื่อรายการ
              <input name="title" className={input} required maxLength={200} defaultValue={sheet.item.title} />
            </label>
            <label className="text-sm font-semibold">
              ราคา (คนที่เพิ่มต่อจากนี้)
              <input name="amount" type="number" min={0.01} step={0.01} max={100000} required className={input} defaultValue={sheet.item.amount} />
            </label>
            <Button type="submit">บันทึก</Button>
          </form>
          <Button type="button" variant="danger" onClick={remove} className="mt-3">
            ลบรายการนี้
          </Button>
        </Card>
      )}
      <ErrorBox message={error} />
      <div className="grid grid-cols-3 gap-2" data-testid="fee-summary">
        {[
          ['ต้องจ่าย', `${charged.length} คน`],
          ['จ่ายครบ', `${fullPaid} คน`],
          ['ค้างรวม', baht(totalOut)],
        ].map(([label, v]) => (
          <Card key={label} className="p-2 text-center">
            <div className="text-xs text-stone-500">{label}</div>
            <div className="text-xl font-extrabold">{v}</div>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <p className="text-xs text-stone-500 flex-1">ติ๊กเฉพาะคนที่ต้องจ่าย · แก้ยอดหรือยอดที่จ่ายแล้วได้ บันทึกอัตโนมัติ</p>
        {uncharged.length > 0 && (
          <button type="button" className="rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm font-bold" onClick={() => addCharges(uncharged.map((r) => r.id))}>
            เลือกทั้งห้อง ({uncharged.length})
          </button>
        )}
      </div>
      <Card className="divide-y divide-stone-100">
        {rows.map((r) => {
          const out = r.charge ? outstanding(r.charge) : 0
          const field = (invalid: boolean) => `w-20 rounded-lg border-2 px-2 py-1 text-right ${invalid ? 'border-red-500 bg-red-50' : 'border-line'}`
          return (
            <div key={r.id} className={`p-3 flex flex-col gap-2 ${r.charge ? '' : 'text-stone-400'}`}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  aria-label={`ต้องจ่าย ${r.firstName} ${r.lastName}`}
                  checked={!!r.charge}
                  onChange={(e) => (e.target.checked ? addCharges([r.id]) : removeCharge(r))}
                />
                <span className="flex-1 min-w-0">
                  <span className="block">
                    {fullName(r)} {!r.active && <Chip>ออกแล้ว</Chip>}
                  </span>
                  <span className="block text-xs text-stone-500 font-mono">{r.zipgradeId}</span>
                </span>
                <span className="whitespace-nowrap text-sm" data-testid={`fee-status-${r.zipgradeId}`}>
                  {!r.charge ? 'ไม่ต้องจ่าย' : r.saving ? '…' : out > 0 ? <Chip tone="red">ค้าง {baht(out)}</Chip> : <Chip tone="green">จ่ายครบ</Chip>}
                </span>
              </div>
              {r.charge && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-8 text-sm">
                  <label className="flex items-center gap-1">
                    ยอด
                    <input
                      inputMode="decimal"
                      aria-label={`ยอด ${r.firstName} ${r.lastName}`}
                      value={r.amountText}
                      onChange={(e) => patch(r.id, { amountText: e.target.value })}
                      onBlur={() => void commit(r.id)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      className={field(!!r.invalid)}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    จ่ายแล้ว
                    <input
                      inputMode="decimal"
                      aria-label={`จ่ายแล้ว ${r.firstName} ${r.lastName}`}
                      value={r.paidText}
                      onChange={(e) => patch(r.id, { paidText: e.target.value })}
                      onBlur={() => void commit(r.id)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      className={field(!!r.invalid)}
                    />
                  </label>
                  {out > 0 && (
                    <button type="button" className="rounded-lg bg-board text-white px-3 py-1 text-xs font-bold whitespace-nowrap" onClick={() => void commit(r.id, { paidAll: true })}>
                      จ่ายครบ
                    </button>
                  )}
                  <input
                    aria-label={`หมายเหตุ ${r.firstName} ${r.lastName}`}
                    placeholder="หมายเหตุ"
                    maxLength={500}
                    value={r.noteText}
                    onChange={(e) => patch(r.id, { noteText: e.target.value })}
                    onBlur={() => void commit(r.id)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="flex-1 min-w-32 rounded-lg border-2 border-line px-2 py-1"
                  />
                  {r.invalid && <span className="basis-full text-xs text-red-600">{r.invalid}</span>}
                </div>
              )}
            </div>
          )
        })}
      </Card>
    </TeacherLayout>
  )
}
