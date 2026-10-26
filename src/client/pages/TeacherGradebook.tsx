import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { api } from '../api'
import { missingText, type Gradebook, type GradebookCell } from '../../shared/assignments'
import type { ScoreBook } from '../../shared/scores'
import { exportGradebook } from '../lib/excel'
import { formatDue } from '../lib/format'
import { Card, ErrorBox, Loading } from '../ui'
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

  useEffect(() => {
    api<Gradebook>(`/api/teacher/classes/${id}/gradebook`).then(setGb).catch((e) => setError(handle(e)))
  }, [id, handle])

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
                      </td>
                      {gb.assignments.map((a) => {
                        const c = s.cells[a.id]
                        const v = CELL[c.status]
                        const box = <span className={`inline-flex w-8 h-8 rounded-lg items-center justify-center font-bold ${v.cls}`}>{v.text(c)}</span>
                        return (
                          <td key={a.id} className="p-1 text-center">
                            {c.submissionId ? (
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
