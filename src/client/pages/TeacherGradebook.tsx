import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { api } from '../api'
import { missingText, type Gradebook, type GradebookCell } from '../../shared/assignments'
import type { ScoreBook } from '../../shared/scores'
import { exportGradebook } from '../lib/excel'
import { formatDue } from '../lib/format'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const CELL: Record<GradebookCell['status'], { cls: string; text: (c: GradebookCell) => string; label: string }> = {
  missing: { cls: 'bg-red-50 text-red-700', text: () => '–', label: 'ยังไม่ส่ง' },
  submitted: { cls: 'bg-board-soft text-board', text: () => '✓', label: 'ส่งแล้ว รอตรวจ' },
  late: { cls: 'bg-amber-100 text-amber-800', text: () => '!', label: 'ส่งสาย' },
  graded: { cls: 'bg-board text-white', text: (c) => String(c.score ?? ''), label: 'ตรวจแล้ว' },
  returned: { cls: 'bg-violet-100 text-violet-700', text: () => '↺', label: 'ส่งกลับแก้' },
}

export default function TeacherGradebook() {
  const { id = '' } = useParams()
  const location = useLocation()
  const handle = useTeacherErrorHandler()
  const [gb, setGb] = useState<Gradebook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>((location.state as { flash?: string } | null)?.flash ?? null)
  const [paper, setPaper] = useState<{ studentId: string; assignmentId: string } | null>(null)

  const load = useCallback(() => {
    api<Gradebook>(`/api/teacher/classes/${id}/gradebook`).then(setGb).catch((e) => setError(handle(e)))
  }, [id, handle])
  useEffect(load, [load])

  /** คนถัดไปในงานเดียวกันที่ยังไม่ส่ง/ส่งกลับแก้ (ไว้บันทึกกระดาษต่อเนื่องทั้งห้อง) */
  function nextPending(g: Gradebook, assignmentId: string, afterStudentId: string) {
    const i = g.students.findIndex((s) => s.id === afterStudentId)
    return g.students.slice(i + 1).find((s) => ['missing', 'returned'].includes(s.cells[assignmentId].status))
  }

  async function savePaper(body: { score: number | null; late: boolean; comment: string }, goNext: boolean) {
    if (!paper || !gb) return
    const st = gb.students.find((s) => s.id === paper.studentId)
    try {
      await api(`/api/teacher/assignments/${paper.assignmentId}/paper/${paper.studentId}`, { method: 'PUT', body })
      setFlash(`📄 บันทึกส่งกระดาษ: ${st?.firstName} ${st?.lastName}${body.score !== null ? ` · ${body.score} คะแนน` : ' · รอให้คะแนน'}`)
      setError(null)
      const next = goNext ? nextPending(gb, paper.assignmentId, paper.studentId) : undefined
      setPaper(next ? { studentId: next.id, assignmentId: paper.assignmentId } : null)
      load()
    } catch (e) {
      setError(handle(e))
    }
  }

  async function exportAll() {
    if (!gb) return
    try {
      await exportGradebook(gb, await api<ScoreBook>(`/api/teacher/classes/${id}/score-book`))
    } catch (e) {
      setError(handle(e))
    }
  }

  async function copyMissing(assignmentId: string) {
    if (!gb) return
    await navigator.clipboard.writeText(missingText(gb, assignmentId)).catch(() => {})
    setFlash('คัดลอกรายชื่อแล้ว วางในกลุ่มแชตของห้องได้เลย')
  }

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← หน้าห้อง
      </Link>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      {!gb && !error && <Loading />}
      {gb && (
        <>
          <div className="flex flex-wrap justify-between items-end gap-2">
            <div>
              <h1 className="text-2xl font-extrabold">ตารางทวงงาน · {gb.class.name}</h1>
              <p className="text-sm text-stone-500">
                {gb.students.length} คน · {gb.assignments.length} งาน
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={exportAll} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                ⬇ Excel
              </button>
              <Link to={`/teacher/assignments/new?classId=${id}`} className="rounded-2xl bg-board text-white px-4 py-2 font-bold">
                + สร้างงาน
              </Link>
            </div>
          </div>
          {paper && (
            <PaperForm
              key={`${paper.studentId}|${paper.assignmentId}`}
              gb={gb}
              studentId={paper.studentId}
              assignmentId={paper.assignmentId}
              onSave={savePaper}
              onClose={() => setPaper(null)}
            />
          )}
          <p className="text-xs text-stone-500">นักเรียนส่งเป็นกระดาษ? แตะช่อง <b>–</b> (ยังไม่ส่ง) เพื่อบันทึกว่าส่งแล้วและให้คะแนนได้เลย · 📄 = ส่งกระดาษ</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {Object.entries(CELL).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={`inline-flex w-6 h-6 rounded-md items-center justify-center font-bold ${v.cls}`}>{k === 'graded' ? '8' : v.text({} as GradebookCell)}</span>
                {v.label}
              </span>
            ))}
          </div>
          {gb.assignments.length === 0 ? (
            <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีงานในห้องนี้</Card>
          ) : (
            <Card className="p-2 overflow-x-auto">
              <table className="text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-xs text-stone-500 align-bottom">
                    <th className="p-2 text-left sticky left-0 bg-white">#</th>
                    <th className="p-2 text-left sticky left-6 bg-white min-w-36">ชื่อ</th>
                    {gb.assignments.map((a) => (
                      <th key={a.id} className="p-2 min-w-28 text-center font-semibold">
                        <Link to={`/teacher/assignments/${a.id}/edit`} className="block text-ink hover:underline">
                          {a.title}
                        </Link>
                        <span className="block font-normal">{formatDue(a.dueAt).replace('กำหนดส่ง ', '')}</span>
                        {a.published === false && (
                          <span className="block font-normal text-violet-700">{a.publishAt ? `⏰ เผยแพร่ ${formatDue(a.publishAt).replace('กำหนดส่ง ', '')}` : 'ร่าง (นักเรียนยังไม่เห็น)'}</span>
                        )}
                        <button type="button" onClick={() => copyMissing(a.id)} className="mt-1 rounded-md border border-line px-1.5 py-0.5 font-normal" aria-label={`คัดลอกรายชื่อคนยังไม่ส่ง ${a.title}`}>
                          📋 ยังไม่ส่ง
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gb.students.map((s, i) => (
                    <tr key={s.id} className="border-t border-stone-100">
                      <td className="p-2 text-stone-500 sticky left-0 bg-white">{i + 1}</td>
                      <td className="p-2 whitespace-nowrap sticky left-6 bg-white">
                        {s.firstName} {s.lastName}
                        <span className="block text-xs text-stone-500 font-mono">{s.zipgradeId}</span>
                      </td>
                      {gb.assignments.map((a) => {
                        const c = s.cells[a.id]
                        const v = CELL[c.status]
                        const box = (
                          <span className={`relative inline-flex w-8 h-8 rounded-lg items-center justify-center font-bold ${v.cls}`}>
                            {v.text(c)}
                            {c.onPaper && <span className="absolute -top-1.5 -right-1.5 text-[10px]" aria-hidden>📄</span>}
                          </span>
                        )
                        const pending = c.status === 'missing' || c.status === 'returned'
                        return (
                          <td key={a.id} className="p-1 text-center">
                            {pending ? (
                              <button
                                type="button"
                                onClick={() => setPaper({ studentId: s.id, assignmentId: a.id })}
                                aria-label={`บันทึกส่งกระดาษ ${s.firstName} ${s.lastName} · ${a.title}`}
                                title={`${v.label} — แตะเพื่อบันทึกส่งกระดาษ`}
                                className={paper?.studentId === s.id && paper.assignmentId === a.id ? 'rounded-lg ring-2 ring-board' : ''}
                              >
                                {box}
                              </button>
                            ) : c.submissionId ? (
                              <Link to={`/teacher/submissions/${c.submissionId}`} aria-label={`${s.firstName} ${s.lastName} · ${a.title}`} title={v.label}>
                                {box}
                              </Link>
                            ) : (
                              <span title={v.label}>{box}</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </TeacherLayout>
  )
}

function PaperForm({
  gb,
  studentId,
  assignmentId,
  onSave,
  onClose,
}: {
  gb: Gradebook
  studentId: string
  assignmentId: string
  onSave: (body: { score: number | null; late: boolean; comment: string }, goNext: boolean) => Promise<void>
  onClose: () => void
}) {
  const a = gb.assignments.find((x) => x.id === assignmentId)!
  const st = gb.students.find((x) => x.id === studentId)!
  const [score, setScore] = useState('')
  const [late, setLate] = useState(a.dueAt !== null && Date.now() > a.dueAt)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const n = score.trim() === '' ? null : Number(score.replace(',', '.'))
  const bad = n !== null && !(Number.isFinite(n) && n >= 0 && n <= a.maxScore)
  async function go(next: boolean) {
    setBusy(true)
    await onSave({ score: n, late, comment: comment.trim() }, next)
    setBusy(false)
  }
  return (
    <Card className="p-4 flex flex-col gap-3 border-board">
      <div className="flex justify-between gap-2">
        <div>
          <p className="font-bold">📄 บันทึกส่งงานแบบกระดาษ</p>
          <p className="text-sm text-stone-600">
            {st.firstName} {st.lastName} ({st.zipgradeId}) · {a.title}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-stone-500 self-start">
          ปิด
        </button>
      </div>
      <form
        className="flex flex-wrap gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault()
          void go(true)
        }}
      >
        <label className="text-sm font-semibold">
          คะแนน (เต็ม {a.maxScore})
          <input
            autoFocus
            inputMode="decimal"
            aria-label="คะแนนงานกระดาษ"
            className={`block w-24 border-2 rounded-xl px-3 py-2 bg-white ${bad ? 'border-red-500 bg-red-50' : 'border-line'}`}
            placeholder="ว่าง = ตรวจทีหลัง"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </label>
        <label className="text-sm font-semibold flex-1 min-w-40">
          คอมเมนต์ (ไม่บังคับ)
          <input className="block w-full border-2 border-line rounded-xl px-3 py-2 bg-white" maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /> ส่งช้า
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={busy || bad} onClick={() => void go(false)}>
            บันทึก
          </Button>
          <Button type="submit" disabled={busy || bad}>
            บันทึก แล้วคนถัดไป →
          </Button>
        </div>
      </form>
      {bad && <p className="text-xs text-red-600">คะแนนต้องอยู่ระหว่าง 0–{a.maxScore}</p>}
      <p className="text-xs text-stone-500">ไม่ใส่คะแนน = บันทึกว่าส่งแล้ว รอตรวจ (แตะช่องเพื่อให้คะแนนทีหลัง) · ส่งตรงเวลาได้ EXP เต็ม ส่งช้าได้ครึ่ง (เมื่อให้คะแนน) · Enter = บันทึกแล้วไปคนถัดไปที่ยังไม่ส่ง</p>
    </Card>
  )
}
