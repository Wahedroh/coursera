import { useState } from 'react'
import { api } from '../api'
import { canonicalZipgradeId } from '../../shared/zipgrade'
import { validScore, type ScoreSheet } from '../../shared/scores'
import { parseZipgradeResults, toItemScore, type ScoreImportResult, type ZipgradeResultsParse } from '../../shared/zipgrade-results'
import { Button, Card } from '../ui'

/** นำเข้าคะแนนจากไฟล์ผลสอบของ ZipGrade ลงรายการนี้ — ดูตัวอย่างก่อนยืนยัน แล้วแก้รายคนในตารางต่อได้ */
export default function ZipgradeImport({ sheet, onDone, onError }: { sheet: ScoreSheet; onDone: (msg: string) => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<{ name: string; parsed: ZipgradeResultsParse } | null>(null)
  const [scale, setScale] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [absentMissing, setAbsentMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const max = sheet.item.maxScore

  async function pick(f: File | undefined) {
    if (!f) return setFile(null)
    const parsed = parseZipgradeResults(await f.text())
    setFile({ name: f.name, parsed })
    // คะแนนเต็มในไฟล์ไม่ตรงกับรายการ → เสนอเทียบสัดส่วนไว้ก่อน
    setScale(parsed.rows.some((r) => r.possible !== null && r.possible !== max))
  }

  const roster = new Map(sheet.students.map((s) => [canonicalZipgradeId(s.zipgradeId), s]))
  const rows = file?.parsed.rows ?? []
  const matched = rows.filter((r) => roster.has(r.zipgradeId))
  const notInClass = rows.filter((r) => !roster.has(r.zipgradeId))
  const invalid = matched.filter((r) => !validScore(toItemScore(r, max, scale), max))
  const existing = matched.filter((r) => {
    const s = roster.get(r.zipgradeId)!
    return s.score !== null || s.absent
  })
  const inFile = new Set(matched.map((r) => r.zipgradeId))
  const missing = sheet.students.filter((s) => !inFile.has(canonicalZipgradeId(s.zipgradeId)) && s.score === null && !s.absent)
  const possibles = [...new Set(rows.map((r) => r.possible).filter((p): p is number => p !== null))]

  async function apply() {
    setBusy(true)
    try {
      const body = { rows: matched.map((r) => ({ zipgradeId: r.zipgradeId, score: toItemScore(r, max, scale) })), overwrite, absentMissing }
      const res = await api<ScoreImportResult>(`/api/teacher/score-items/${sheet.item.id}/import`, { body })
      const parts = [`นำเข้าคะแนน ${res.saved} คน`]
      if (res.keptExisting) parts.push(`คงคะแนนเดิม ${res.keptExisting} คน`)
      if (res.markedAbsent) parts.push(`ติ๊กขาดสอบ ${res.markedAbsent} คน`)
      if (res.invalid.length) parts.push(`ข้ามคะแนนผิด ${res.invalid.length} คน`)
      onDone(parts.join(' · ') + ' — แก้คะแนนรายคนในตารางด้านล่างได้')
      setFile(null)
      setOpen(false)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
        📥 นำเข้าจาก ZipGrade
      </button>
    )

  return (
    <Card className="p-4 flex flex-col gap-3 basis-full">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h2 className="font-bold">📥 นำเข้าคะแนนจาก ZipGrade</h2>
          <p className="text-xs text-stone-500">ZipGrade → เลือกแบบทดสอบ → Export → ไฟล์ CSV ผลสอบ · จับคู่นักเรียนด้วย ZipGrade ID</p>
        </div>
        <button type="button" className="text-sm text-stone-500" onClick={() => (setOpen(false), setFile(null))}>
          ปิด
        </button>
      </div>
      <label className="text-sm font-semibold">
        ไฟล์ผลสอบ (CSV)
        <input type="file" accept=".csv,text/csv" className="w-full border-2 border-line rounded-xl px-3 py-2 bg-white" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {file?.parsed.errors.map((m) => (
        <p key={m} className="text-sm text-red-700">
          {m}
        </p>
      ))}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center" data-testid="import-summary">
            {[
              ['พบในห้องนี้', `${matched.length} คน`],
              ['ไม่อยู่ในห้องนี้', `${notInClass.length} คน`],
              ['มีคะแนนอยู่แล้ว', `${existing.length} คน`],
              ['ไม่มีในไฟล์', `${missing.length} คน`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-stone-50 p-2">
                <div className="text-xs text-stone-500">{k}</div>
                <div className="font-extrabold">{v}</div>
              </div>
            ))}
          </div>
          {possibles.length > 0 && (
            <fieldset className="text-sm flex flex-col gap-1">
              <legend className="font-semibold">
                คะแนนเต็มในไฟล์ {possibles.join(', ')} · คะแนนเต็มของรายการนี้ {max}
              </legend>
              <label className="flex gap-2 items-center">
                <input type="radio" name="scale" checked={!scale} onChange={() => setScale(false)} /> ใช้คะแนนดิบตามไฟล์
              </label>
              <label className="flex gap-2 items-center">
                <input type="radio" name="scale" checked={scale} onChange={() => setScale(true)} /> เทียบสัดส่วนเป็นคะแนนเต็ม {max} (เช่น {possibles[0]}/{possibles[0]} → {max})
              </label>
            </fieldset>
          )}
          {existing.length > 0 && (
            <label className="flex gap-2 items-center text-sm">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> เขียนทับคะแนนที่กรอกไว้แล้ว ({existing.length} คน)
            </label>
          )}
          {missing.length > 0 && (
            <label className="flex gap-2 items-center text-sm">
              <input type="checkbox" checked={absentMissing} onChange={(e) => setAbsentMissing(e.target.checked)} /> ติ๊ก "ขาดสอบ" ให้คนที่ไม่มีในไฟล์ ({missing.length} คน)
            </label>
          )}
          {(notInClass.length > 0 || invalid.length > 0 || file!.parsed.duplicates.length > 0) && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-xs flex flex-col gap-1">
              {notInClass.length > 0 && <p>ไม่อยู่ในห้องนี้ (จะข้าม): {notInClass.map((r) => r.zipgradeId).join(', ')}</p>}
              {invalid.length > 0 && <p className="text-red-700">คะแนนเกิน {max} หรือไม่ถูกต้อง (จะข้าม): {invalid.map((r) => r.zipgradeId).join(', ')} — ลองเลือก "เทียบสัดส่วน"</p>}
              {file!.parsed.duplicates.length > 0 && <p>สแกนซ้ำ (ใช้ใบล่างสุดในไฟล์): {file!.parsed.duplicates.join(', ')}</p>}
            </div>
          )}
          <Button type="button" onClick={apply} disabled={busy || matched.length === invalid.length}>
            {busy ? 'กำลังนำเข้า…' : `ยืนยันนำเข้า ${matched.length - invalid.length - (overwrite ? 0 : existing.length)} คน`}
          </Button>
        </>
      )}
    </Card>
  )
}
