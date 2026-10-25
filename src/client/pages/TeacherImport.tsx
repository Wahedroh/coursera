import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import type { ImportPreview } from '../../server/roster/service'
import type { RosterFlag, RosterRow } from '../../shared/roster/parse'
import { Button, Card, Chip, ErrorBox } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const FLAG_LABEL: Record<RosterFlag, string> = {
  no_title: 'ไม่มีคำนำหน้า',
  duplicate_name: 'ชื่อซ้ำในห้อง',
  unusual_id: 'รหัสผิดรูปแบบ',
  missing_field: 'ข้อมูลไม่ครบ',
}

type Tab = 'new' | 'changed' | 'missing' | 'flagged'
const name = (r: { title: string | null; firstName: string; lastName: string }) => `${r.title ?? ''}${r.firstName} ${r.lastName}`.trim()

function Stat({ label, value, testId, tone = '' }: { label: string; value: number; testId: string; tone?: string }) {
  return (
    <Card className="p-3 flex-1 min-w-[120px]">
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div data-testid={testId} className={`text-2xl font-extrabold ${tone}`}>
        {value}
      </div>
    </Card>
  )
}

function RowsTable({ rows }: { rows: RosterRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-stone-500 p-3">ไม่มีรายการ</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-stone-500">
          <th className="p-2">แถว</th>
          <th className="p-2">ZipGrade ID</th>
          <th className="p-2">ชื่อที่ระบบอ่านได้</th>
          <th className="p-2">ห้อง</th>
          <th className="p-2">หมายเหตุ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.zipgradeId} className="border-t border-stone-100">
            <td className="p-2 text-stone-500">{r.line}</td>
            <td className="p-2">{r.zipgradeId}</td>
            <td className="p-2">{name(r)}</td>
            <td className="p-2">{r.className}</td>
            <td className="p-2 flex flex-wrap gap-1">
              {r.flags.map((f) => (
                <Chip key={f} tone={f === 'unusual_id' ? 'red' : f === 'duplicate_name' ? 'purple' : 'amber'}>
                  {FLAG_LABEL[f]}
                </Chip>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function TeacherImport() {
  const handle = useTeacherErrorHandler()
  const [csv, setCsv] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([])
  const [tab, setTab] = useState<Tab>('flagged')
  const [deactivate, setDeactivate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; deactivated: number } | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setResult(null)
    setPreview(null)
    setBusy(true)
    try {
      const text = await file.text()
      const r = await api<{ preview: ImportPreview; errors: { line: number; message: string }[] }>('/api/teacher/roster/preview', { body: { csv: text } })
      setCsv(text)
      setPreview(r.preview)
      setParseErrors(r.errors)
      setTab(r.preview.flagged.length ? 'flagged' : 'new')
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!csv) return
    setBusy(true)
    setError(null)
    try {
      setResult(await api('/api/teacher/roster/apply', { body: { csv, deactivateMissing: deactivate } }))
      setPreview(null)
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  const total = preview ? preview.newStudents.length + preview.changed.length + preview.unchanged : 0

  return (
    <TeacherLayout>
      <div>
        <h1 className="text-2xl font-extrabold">นำเข้ารายชื่อจาก ZipGrade</h1>
        <p className="text-sm text-stone-500">ตรวจสอบก่อนยืนยัน ระบบยังไม่บันทึกอะไรจนกว่าจะกด "ยืนยันนำเข้า"</p>
      </div>

      <Card className="p-4 flex flex-col gap-2">
        <label htmlFor="csv" className="text-sm font-semibold">
          เลือกไฟล์ CSV จาก ZipGrade
        </label>
        <input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        <p className="text-xs text-stone-500">ใน ZipGrade: Students → Export (คอลัมน์ ZipGrade ID, First Name, Last Name, Classes)</p>
      </Card>

      <ErrorBox message={error} />
      {busy && <p className="text-sm text-stone-500">กำลังประมวลผล…</p>}

      {result && (
        <Card className="p-4 bg-board-soft border-green-200">
          <p className="font-bold text-board">
            นำเข้าสำเร็จ: เพิ่ม {result.created} คน · อัปเดต {result.updated} คน · ปิดใช้งาน {result.deactivated} คน
          </p>
          <Link to="/teacher" className="text-sm underline">
            กลับหน้าแรก
          </Link>
        </Card>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap gap-2">
            <Stat label="คนใหม่" value={preview.newStudents.length} testId="stat-new" tone="text-board" />
            <Stat label="ข้อมูลเปลี่ยน" value={preview.changed.length} testId="stat-changed" tone="text-blue-700" />
            <Stat label="ไม่เปลี่ยน" value={preview.unchanged} testId="stat-unchanged" />
            <Stat label="ไม่อยู่ในไฟล์" value={preview.missing.length} testId="stat-missing" />
            <Stat label="ควรตรวจสอบ" value={preview.flagged.length} testId="stat-flagged" tone="text-amber-700" />
          </div>
          {preview.newClasses.length > 0 && <p className="text-sm">ห้องใหม่: {preview.newClasses.join(', ')}</p>}
          {parseErrors.length > 0 && (
            <Card className="p-3 border-red-200">
              <p className="font-bold text-red-700 text-sm">แถวที่นำเข้าไม่ได้ ({parseErrors.length})</p>
              <ul className="text-sm text-red-700 list-disc pl-5">
                {parseErrors.map((e) => (
                  <li key={e.line}>{e.message}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-3 overflow-x-auto">
            <div className="flex flex-wrap gap-1 mb-2" role="tablist">
              {(
                [
                  ['flagged', `ควรตรวจสอบ (${preview.flagged.length})`],
                  ['new', `คนใหม่ (${preview.newStudents.length})`],
                  ['changed', `เปลี่ยน (${preview.changed.length})`],
                  ['missing', `ไม่อยู่ในไฟล์ (${preview.missing.length})`],
                ] as [Tab, string][]
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-board text-white' : 'bg-stone-100 text-stone-600'}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'flagged' && <RowsTable rows={preview.flagged} />}
            {tab === 'new' && <RowsTable rows={preview.newStudents} />}
            {tab === 'changed' &&
              (preview.changed.length === 0 ? (
                <p className="text-sm text-stone-500 p-3">ไม่มีรายการ</p>
              ) : (
                <ul className="text-sm divide-y divide-stone-100">
                  {preview.changed.map(({ row, before }) => (
                    <li key={row.zipgradeId} className="p-2">
                      <b>{row.zipgradeId}</b>: {name(before)} ({before.className}) → {name(row)} ({row.className})
                    </li>
                  ))}
                </ul>
              ))}
            {tab === 'missing' &&
              (preview.missing.length === 0 ? (
                <p className="text-sm text-stone-500 p-3">ไม่มีรายการ</p>
              ) : (
                <ul className="text-sm divide-y divide-stone-100">
                  {preview.missing.map((m) => (
                    <li key={m.id} className="p-2">
                      <b>{m.zipgradeId}</b> {m.name} · {m.className}
                    </li>
                  ))}
                </ul>
              ))}
          </Card>

          <Card className="p-4 flex flex-col gap-3">
            {preview.missing.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
                ปิดใช้งาน {preview.missing.length} คนที่ไม่อยู่ในไฟล์ (ไม่ลบข้อมูล)
              </label>
            )}
            <Button onClick={apply} disabled={busy}>
              ยืนยันนำเข้า {total} คน
            </Button>
          </Card>
        </>
      )}
    </TeacherLayout>
  )
}
