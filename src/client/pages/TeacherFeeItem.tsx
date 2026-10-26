import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, fullName } from '../api'
import { baht, outstanding, type FeeRow, type FeeSheet } from '../../shared/fees'
import { exportFees } from '../lib/excel'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

/** charge = ค่าที่บันทึกแล้ว; amountText/paidText/noteText = ค่าที่กำลังพิมพ์ */
type Row = FeeRow & { amountText: string; paidText: string; noteText: string; invalid: boolean; saving: boolean }
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
        if (!(amount > 0) || !(paid >= 0) || paid > amount) return patch(sid, { invalid: true })
        const body = { amount, paid, note: r.noteText.trim() }
        if (body.amount === r.charge.amount && body.paid === r.charge.paid && body.note === r.charge.note) return patch(sid, { invalid: false, paidText: String(paid) })
        patch(sid, { saving: true, invalid: false })
        try {
          await api(`/api/teacher/fee-items/${id}/charges/${sid}`, { method: 'PUT', body })
          patch(sid, { charge: body, saving: false, paidText: String(paid), amountText: String(amount) })
          setError(null)
        } catch (e) {
          patch(sid, { saving: false })
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
    // แสดงทันที แล้วโหลดค่าจริงจากเซิร์ฟเวอร์
    const amount = sheet.item.amount
    const ids = new Set(studentIds)
    setRows((rs) => rs.map((r) => (ids.has(r.id) && !r.charge ? { ...r, charge: { amount, paid: 0, note: '' }, amountText: String(amount), paidText: '0' } : r)))
    try {
      await api(`/api/teacher/fee-items/${id}/charges/bulk`, { body: { studentIds } })
      load()
    } catch (e) {
      setError(handle(e))
      load()
    }
  }

  async function removeCharge(r: Row) {
    if (r.charge && r.charge.paid > 0 && !window.confirm(`${fullName(r)} จ่ายแล้ว ${baht(r.charge.paid)} — ยกเลิกการเรียกเก็บ?`)) return
    try {
      await api(`/api/teacher/fee-items/${id}/charges/${r.id}`, { method: 'DELETE' })
      patch(r.id, { charge: null, amountText: '', paidText: '', noteText: '', invalid: false })
    } catch (e) {
      setError(handle(e))
    }
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
      <Card className="p-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-500">
              <th className="p-2">ต้องจ่าย</th>
              <th className="p-2">ชื่อ · ZipGrade ID</th>
              <th className="p-2 whitespace-nowrap">ยอด (บาท)</th>
              <th className="p-2 whitespace-nowrap">จ่ายแล้ว</th>
              <th className="p-2">สถานะ</th>
              <th className="p-2">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const out = r.charge ? outstanding(r.charge) : 0
              return (
                <tr key={r.id} className={`border-t border-stone-100 ${r.charge ? '' : 'text-stone-400'}`}>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`ต้องจ่าย ${r.firstName} ${r.lastName}`}
                      checked={!!r.charge}
                      onChange={(e) => (e.target.checked ? addCharges([r.id]) : removeCharge(r))}
                    />
                  </td>
                  <td className="p-2">
                    <span className="block whitespace-nowrap">{fullName(r)}</span>
                    <span className="block text-xs text-stone-500 font-mono">{r.zipgradeId}</span>
                  </td>
                  {r.charge ? (
                    <>
                      <td className="p-1">
                        <input
                          inputMode="decimal"
                          aria-label={`ยอด ${r.firstName} ${r.lastName}`}
                          value={r.amountText}
                          onChange={(e) => patch(r.id, { amountText: e.target.value })}
                          onBlur={() => void commit(r.id)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          className={`w-20 rounded-lg border-2 px-2 py-1 text-right ${r.invalid ? 'border-red-500 bg-red-50' : 'border-line'}`}
                        />
                      </td>
                      <td className="p-1">
                        <div className="flex items-center gap-1">
                          <input
                            inputMode="decimal"
                            aria-label={`จ่ายแล้ว ${r.firstName} ${r.lastName}`}
                            value={r.paidText}
                            onChange={(e) => patch(r.id, { paidText: e.target.value })}
                            onBlur={() => void commit(r.id)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            className={`w-20 rounded-lg border-2 px-2 py-1 text-right ${r.invalid ? 'border-red-500 bg-red-50' : 'border-line'}`}
                          />
                          {out > 0 && (
                            <button type="button" className="rounded-lg bg-board text-white px-2 py-1 text-xs font-bold whitespace-nowrap" onClick={() => void commit(r.id, { paidAll: true })}>
                              จ่ายครบ
                            </button>
                          )}
                        </div>
                        {r.invalid && <span className="block text-xs text-red-600">จ่ายแล้วต้องไม่เกินยอด</span>}
                      </td>
                      <td className="p-2 whitespace-nowrap" data-testid={`fee-status-${r.zipgradeId}`}>
                        {r.saving ? '…' : out > 0 ? <Chip tone="red">ค้าง {baht(out)}</Chip> : <Chip tone="green">จ่ายครบ</Chip>}
                      </td>
                      <td className="p-1">
                        <input
                          aria-label={`หมายเหตุ ${r.firstName} ${r.lastName}`}
                          maxLength={500}
                          value={r.noteText}
                          onChange={(e) => patch(r.id, { noteText: e.target.value })}
                          onBlur={() => void commit(r.id)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          className="w-full min-w-24 rounded-lg border-2 border-line px-2 py-1"
                        />
                      </td>
                    </>
                  ) : (
                    <td className="p-2 text-xs" colSpan={4}>
                      ไม่ต้องจ่าย
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </TeacherLayout>
  )
}
