import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, fullName } from '../api'
import { CATEGORY_LABEL, SCORE_CATEGORIES, parsePastedColumn, parseScore, scoreStats, type ScoreCategory, type ScoreRow, type ScoreSheet } from '../../shared/scores'
import { formatDate } from '../lib/format'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type RowState = 'idle' | 'saving' | 'saved' | 'invalid' | 'error'
/** score/absent/note = ค่าที่บันทึกในเซิร์ฟเวอร์แล้ว; text/noteText/absentDraft = ค่าบนหน้าจอ */
type Row = ScoreRow & { text: string; noteText: string; absentDraft: boolean; state: RowState }

const toRow = (s: ScoreRow): Row => ({ ...s, text: s.score === null ? '' : String(s.score), noteText: s.note, absentDraft: s.absent, state: 'idle' })
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

export default function TeacherScoreEntry() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const handle = useTeacherErrorHandler()
  const [sheet, setSheet] = useState<ScoreSheet | null>(null)
  const [rows, setRowsState] = useState<Row[]>([])
  const rowsRef = useRef<Row[]>([])
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  // คิวต่อแถว: บันทึกทีละครั้งตามลำดับ และอ่านค่าล่าสุดตอนถึงคิว (กันคำตอบเก่ามาทับค่าใหม่)
  const queues = useRef(new Map<string, Promise<void>>())
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const setRows = useCallback((f: (rs: Row[]) => Row[]) => {
    rowsRef.current = f(rowsRef.current)
    setRowsState(rowsRef.current)
  }, [])
  const patch = useCallback((i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r))), [setRows])

  const load = useCallback(() => {
    api<ScoreSheet>(`/api/teacher/score-items/${id}`)
      .then((s) => {
        setSheet(s)
        setRows(() => s.students.map(toRow))
      })
      .catch((e) => setError(handle(e)))
  }, [id, handle, setRows])
  useEffect(load, [load])

  const max = sheet?.item.maxScore ?? 0

  /** บันทึกแถว i ถ้าค่าเปลี่ยนจากที่บันทึกไว้; ค่าผิดขึ้นกรอบแดงไม่บันทึก (หมายเหตุยังบันทึกได้ด้วยคะแนนเดิม) */
  const saveNow = useCallback(
    async (rowId: string, over: { absent?: boolean; noteOnly?: boolean }) => {
      const i = rowsRef.current.findIndex((x) => x.id === rowId)
      const r = rowsRef.current[i]
      if (!r) return
      const absent = over.absent ?? r.absentDraft
      const parsed = absent ? ({ ok: true, value: null } as const) : parseScore(r.text, max)
      if (!parsed.ok && !over.noteOnly) return patch(i, { state: 'invalid' })
      const body = { score: parsed.ok ? parsed.value : r.score, absent, note: r.noteText.trim() }
      if (body.score === r.score && body.absent === r.absent && body.note === r.note) return patch(i, { state: r.state === 'invalid' && parsed.ok ? 'idle' : r.state })
      patch(i, { state: 'saving', absentDraft: absent })
      try {
        await api(`/api/teacher/score-items/${id}/scores/${r.id}`, { method: 'PUT', body })
        const j = rowsRef.current.findIndex((x) => x.id === rowId)
        // ขาดสอบแล้วล้างช่องคะแนน (หลังบันทึกสำเร็จเท่านั้น ถ้าพลาดคะแนนเดิมยังอยู่)
        patch(j, { score: body.score, absent: body.absent, note: body.note, state: parsed.ok ? 'saved' : 'invalid', ...(body.absent ? { text: '' } : {}) })
        setError(null)
      } catch (e) {
        const j = rowsRef.current.findIndex((x) => x.id === rowId)
        patch(j, { state: 'error', absentDraft: rowsRef.current[j]?.absent ?? absent })
        setError(handle(e))
      }
    },
    [id, max, patch, handle],
  )

  const commit = useCallback(
    (i: number, over: { absent?: boolean; noteOnly?: boolean } = {}): Promise<void> => {
      const r = rowsRef.current[i]
      if (!r) return Promise.resolve()
      const next = (queues.current.get(r.id) ?? Promise.resolve()).then(() => saveNow(r.id, over))
      queues.current.set(r.id, next)
      return next
    },
    [saveNow],
  )

  /** โฟกัสช่องถัดไปที่กรอกได้ (ข้ามคนขาดสอบซึ่งช่องถูกปิด) */
  function focus(i: number, step: 1 | -1) {
    for (let k = i; k >= 0 && k < inputs.current.length; k += step) {
      const el = inputs.current[k]
      if (el && !el.disabled) {
        el.focus()
        el.select()
        return
      }
    }
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      void commit(i)
      focus(i + 1, 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      void commit(i)
      focus(i - 1, -1)
    }
  }

  /** วางทั้งคอลัมน์จาก Excel/Sheets: ค่าที่ k ลงแถว i+k ตรงตามลำดับรายชื่อ
   *  ช่องว่างไม่แตะคะแนนเดิม · แถวขาดสอบข้ามไป (แต่ใช้ค่าของแถวนั้นไปแล้ว ไม่เลื่อนแถว) */
  async function onPaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const raw = e.clipboardData.getData('text')
    const values = parsePastedColumn(raw)
    if (values.length < 2) return
    e.preventDefault()
    const targets: number[] = []
    let skippedAbsent = 0
    values.forEach((v, k) => {
      const r = rowsRef.current[i + k]
      if (!r || v === '') return
      if (r.absentDraft) return void skippedAbsent++
      patch(i + k, { text: v })
      targets.push(i + k)
    })
    const notes = []
    if (i + values.length > rowsRef.current.length) notes.push(`วางได้ถึงคนสุดท้าย ${rowsRef.current.length - i} จาก ${values.length} ค่า`)
    if (skippedAbsent) notes.push(`ข้ามคนที่ติ๊กขาดสอบ ${skippedAbsent} คน`)
    if (raw.split(/\r?\n/).some((l) => l.includes('\t'))) notes.push('วางมาหลายคอลัมน์ ใช้คอลัมน์แรกเท่านั้น กรุณาตรวจ')
    await Promise.all(targets.map((t) => commit(t)))
    if (notes.length) setError(notes.join(' · '))
  }

  async function togglePublish() {
    if (!sheet) return
    const published = !sheet.item.published
    try {
      await api(`/api/teacher/score-items/${id}/published`, { method: 'PUT', body: { published } })
      setSheet({ ...sheet, item: { ...sheet.item, published } })
    } catch (e) {
      setError(handle(e))
    }
  }

  async function remove() {
    if (!sheet || !window.confirm(`ลบรายการ "${sheet.item.title}" และคะแนนทั้งหมดในรายการนี้?`)) return
    try {
      await api(`/api/teacher/score-items/${id}`, { method: 'DELETE' })
      navigate(`/teacher/classes/${sheet.item.classId}/scores`, { replace: true })
    } catch (e) {
      setError(handle(e))
    }
  }

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body = { title: String(f.get('title')), category: String(f.get('category')), maxScore: Number(f.get('maxScore')), takenOn: String(f.get('takenOn')) }
    try {
      await api(`/api/teacher/score-items/${id}`, { method: 'PUT', body })
      setEditing(false)
      setError(null)
      // แก้แค่หัวรายการ ไม่โหลดตารางใหม่ (ไม่ทับช่องที่กำลังพิมพ์)
      setSheet((s) => (s ? { ...s, item: { ...s.item, ...body, category: body.category as ScoreSheet['item']['category'] } } : s))
    } catch (err) {
      setError(handle(err))
    }
  }

  if (!sheet) return <TeacherLayout>{error ? <ErrorBox message={error} /> : <Loading />}</TeacherLayout>
  const it = sheet.item
  const stats = scoreStats(rows.map((r) => r.score))
  const absentCount = rows.filter((r) => r.absent).length

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${it.classId}/scores`} className="text-sm text-stone-500">
        ← คะแนนสอบ · {sheet.class.name}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{it.title}</h1>
          <p className="text-sm text-stone-500">
            {CATEGORY_LABEL[it.category]} · {formatDate(it.takenOn)} · คะแนนเต็ม {it.maxScore}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {it.published ? <Chip tone="green">นักเรียนเห็นแล้ว</Chip> : <Chip>นักเรียนยังไม่เห็น</Chip>}
          <button type="button" onClick={togglePublish} className={`rounded-2xl px-4 py-2 font-bold ${it.published ? 'border-2 border-line bg-white' : 'bg-board text-white'}`}>
            {it.published ? 'ยกเลิกเผยแพร่' : 'เผยแพร่'}
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
            แก้รายละเอียด
          </button>
        </div>
      </div>
      {editing && (
        <Card className="p-4">
          <form onSubmit={saveDetails} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end">
            <label className="text-sm font-semibold">
              ชื่อรายการ
              <input name="title" className={input} required maxLength={200} defaultValue={it.title} />
            </label>
            <label className="text-sm font-semibold">
              หมวด
              <select name="category" className={input} defaultValue={it.category}>
                {SCORE_CATEGORIES.map((c: ScoreCategory) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              คะแนนเต็ม
              <input name="maxScore" type="number" min={0.01} step={0.01} max={1000} required className={input} defaultValue={it.maxScore} />
            </label>
            <label className="text-sm font-semibold">
              วันที่สอบ
              <input name="takenOn" type="date" required className={input} defaultValue={it.takenOn} />
            </label>
            <Button type="submit">บันทึก</Button>
          </form>
          <Button type="button" variant="danger" onClick={remove} className="mt-3">
            ลบรายการนี้
          </Button>
        </Card>
      )}
      <ErrorBox message={error} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="score-stats">
        {[
          ['กรอกแล้ว', `${stats.filled + absentCount}/${rows.length}`],
          ['ค่าเฉลี่ย', stats.avg ?? '–'],
          ['สูงสุด', stats.max ?? '–'],
          ['ต่ำสุด', stats.min ?? '–'],
        ].map(([label, v]) => (
          <Card key={label} className="p-2 text-center">
            <div className="text-xs text-stone-500">{label}</div>
            <div className="text-xl font-extrabold">{v}</div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-stone-500">
        Enter/↓ ไปคนถัดไป · บันทึกอัตโนมัติ · วางคะแนนทั้งคอลัมน์จาก Excel ได้ (คลิกช่องคนแรกแล้ววาง) · ช่องว่าง = ยังไม่กรอก{absentCount > 0 && ` · ขาดสอบ ${absentCount} คน`}
      </p>
      <Card className="p-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-500">
              <th className="p-2">#</th>
              <th className="p-2">ชื่อ · ZipGrade ID</th>
              <th className="p-2 whitespace-nowrap">คะแนน /{it.maxScore}</th>
              <th className="p-2 whitespace-nowrap">ขาดสอบ</th>
              <th className="p-2">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-stone-100">
                <td className="p-2 text-stone-500">{i + 1}</td>
                <td className="p-2">
                  <span className="block">{fullName(r)}</span>
                  <span className="block text-xs text-stone-500 font-mono">{r.zipgradeId}</span>
                </td>
                <td className="p-1">
                  <div className="flex items-center gap-1">
                    <input
                      ref={(el) => {
                        inputs.current[i] = el
                      }}
                      inputMode="decimal"
                      aria-label={`คะแนน ${r.firstName} ${r.lastName}`}
                      aria-invalid={r.state === 'invalid'}
                      disabled={r.absentDraft}
                      value={r.absentDraft ? '' : r.text}
                      onChange={(e) => patch(i, { text: e.target.value, state: r.state === 'invalid' ? 'idle' : r.state })}
                      onKeyDown={(e) => onKey(i, e)}
                      onBlur={() => void commit(i)}
                      onPaste={(e) => void onPaste(i, e)}
                      className={`w-16 rounded-lg border-2 px-2 py-1 text-right disabled:bg-stone-100 ${r.state === 'invalid' ? 'border-red-500 bg-red-50' : 'border-line'}`}
                    />
                    <span className="w-4 text-xs" aria-hidden>
                      {r.state === 'saving' ? '…' : r.state === 'saved' ? <span className="text-board">✓</span> : r.state === 'error' ? <span className="text-red-600">!</span> : ''}
                    </span>
                  </div>
                  {r.state === 'invalid' && <span className="block text-xs text-red-600">0–{it.maxScore} ทศนิยมไม่เกิน 2 ตำแหน่ง</span>}
                </td>
                <td className="p-2 text-center">
                  <input type="checkbox" aria-label={`ขาดสอบ ${r.firstName} ${r.lastName}`} checked={r.absentDraft} onChange={(e) => void commit(i, { absent: e.target.checked })} />
                </td>
                <td className="p-1">
                  <input
                    aria-label={`หมายเหตุ ${r.firstName} ${r.lastName}`}
                    maxLength={500}
                    value={r.noteText}
                    onChange={(e) => patch(i, { noteText: e.target.value })}
                    onBlur={() => void commit(i, { noteOnly: true })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    className="w-full min-w-28 rounded-lg border-2 border-line px-2 py-1"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </TeacherLayout>
  )
}
