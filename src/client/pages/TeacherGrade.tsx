import { createRef, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { api } from '../api'
import { AnnotateCanvas, type AnnotateHandle } from '../components/AnnotateCanvas'
import { fileUrl, uploadImage } from '../lib/upload'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Detail = {
  submission: { id: string; text: string; imageKeys: string[]; annotatedKeys: string[]; status: string; score: number | null; comment: string; submittedAt: number; imagesPurgedAt: number | null }
  assignment: { id: string; classId: string; title: string; maxScore: number; dueAt: number | null }
  student: { title: string | null; firstName: string; lastName: string; zipgradeId: string }
  neighbors: { prevId: string | null; nextId: string | null }
}

const QUICK_COMMENTS = ['เก่งมาก 👍', 'เขียนให้ชัดขึ้นนะ', 'แสดงวิธีทำด้วย', 'ลองตรวจทานอีกครั้ง']
const STATUS: Record<string, [string, 'green' | 'amber' | 'purple' | 'gray']> = {
  submitted: ['ส่งตรงเวลา', 'green'],
  late: ['ส่งสาย', 'amber'],
  graded: ['ตรวจแล้ว', 'gray'],
  returned: ['ส่งกลับแก้', 'purple'],
}
const fmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function TeacherGrade() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const handle = useTeacherErrorHandler()
  const [d, setD] = useState<Detail | null>(null)
  const [score, setScore] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const flash = (location.state as { flash?: string } | null)?.flash

  useEffect(() => {
    setD(null)
    api<Detail>(`/api/teacher/submissions/${id}`)
      .then((x) => {
        setD(x)
        setScore(x.submission.score === null ? '' : String(x.submission.score))
        setComment(x.submission.comment)
      })
      .catch((e) => setError(handle(e)))
  }, [id, handle])

  const canvases = useMemo(() => (d?.submission.imageKeys ?? []).map(() => createRef<AnnotateHandle>()), [d])

  function goNext(message: string) {
    if (!d) return
    if (d.neighbors.nextId) navigate(`/teacher/submissions/${d.neighbors.nextId}`, { state: { flash: message } })
    else navigate(`/teacher/classes/${d.assignment.classId}/gradebook`, { state: { flash: `${message} · ตรวจครบทุกคนที่ส่งแล้ว` } })
  }

  async function save() {
    if (!d) return
    setBusy(true)
    setError(null)
    try {
      let annotatedKeys = d.submission.annotatedKeys
      if (canvases.some((c) => c.current?.hasChanges())) {
        annotatedKeys = []
        for (const c of canvases) {
          if (c.current) annotatedKeys.push(await uploadImage(await c.current.toBlob(), 'annotation', d.submission.id))
        }
      }
      await api(`/api/teacher/submissions/${id}/grade`, { body: { score: Number(score), comment, annotatedKeys } })
      goNext('บันทึกคะแนนแล้ว')
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  async function sendBack() {
    setBusy(true)
    try {
      await api(`/api/teacher/submissions/${id}/return`, { body: { comment } })
      goNext('ส่งกลับให้แก้แล้ว')
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  if (!d) return <TeacherLayout>{error ? <ErrorBox message={error} /> : <Loading />}</TeacherLayout>
  const [statusLabel, statusTone] = STATUS[d.submission.status] ?? ['', 'gray']
  const max = d.assignment.maxScore
  const quickScores = [max, max - 1, max - 2, max - 3, max - 4, max - 5].filter((x) => x >= 0)

  return (
    <TeacherLayout>
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <div>
          <Link to={`/teacher/classes/${d.assignment.classId}/gradebook`} className="text-sm text-stone-500">
            ← {d.assignment.title}
          </Link>
          <h1 className="text-xl font-extrabold">
            {d.student.title ?? ''}
            {d.student.firstName} {d.student.lastName} <Chip tone={statusTone}>{statusLabel}</Chip>
          </h1>
          <p className="text-xs text-stone-500">
            รหัส {d.student.zipgradeId} · ส่งเมื่อ {fmt.format(d.submission.submittedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {d.neighbors.prevId && (
            <Link to={`/teacher/submissions/${d.neighbors.prevId}`} className="rounded-2xl border-2 border-line bg-white px-3 py-2 font-bold text-sm">
              ← ก่อนหน้า
            </Link>
          )}
          {d.neighbors.nextId && (
            <Link to={`/teacher/submissions/${d.neighbors.nextId}`} className="rounded-2xl border-2 border-line bg-white px-3 py-2 font-bold text-sm">
              ถัดไป →
            </Link>
          )}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {d.submission.imageKeys.length === 0 && (
            <Card className="p-4 text-sm text-stone-500">{d.submission.imagesPurgedAt ? 'ลบรูปงานนี้แล้วเพื่อประหยัดพื้นที่ (คะแนนยังอยู่)' : 'ไม่มีรูปงาน'}</Card>
          )}
          {d.submission.imageKeys.map((k, i) => (
            <div key={k} className="flex flex-col gap-1">
              {d.submission.annotatedKeys[i] && <p className="text-xs text-stone-500">แสดงรูปที่ตรวจไว้แล้ว เขียนเพิ่มต่อได้</p>}
              <AnnotateCanvas ref={canvases[i]} src={fileUrl(d.submission.annotatedKeys[i] ?? k)} label={`รูปงาน ${i + 1}`} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Card className="p-4">
            <p className="text-xs font-semibold text-stone-500">ข้อความจากนักเรียน</p>
            <p className="text-sm whitespace-pre-wrap">{d.submission.text || '—'}</p>
          </Card>
          <Card className="p-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-stone-500" htmlFor="score">
              คะแนน
            </label>
            <div className="flex items-center gap-2">
              <input id="score" type="number" min={0} max={max} step={0.5} value={score} onChange={(e) => setScore(e.target.value)} className="w-24 border-2 border-line rounded-xl px-3 py-2 text-center font-extrabold text-lg" />
              <span className="text-stone-500">/ {max}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {quickScores.map((q) => (
                <button key={q} type="button" onClick={() => setScore(String(q))} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${score === String(q) ? 'bg-board-soft text-board' : 'bg-stone-100 text-stone-600'}`}>
                  {q}
                </button>
              ))}
            </div>
            <label className="text-xs font-semibold text-stone-500 mt-2" htmlFor="comment">
              คอมเมนต์
            </label>
            <textarea id="comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className="border-2 border-line rounded-xl px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-1">
              {QUICK_COMMENTS.map((q) => (
                <button key={q} type="button" onClick={() => setComment(comment ? `${comment} ${q}` : q)} className="rounded-full px-2.5 py-0.5 text-xs bg-stone-100 text-stone-600">
                  + {q}
                </button>
              ))}
            </div>
          </Card>
          <ErrorBox message={error} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={sendBack} disabled={busy} className="text-violet-700">
              ↺ ส่งกลับให้แก้
            </Button>
            <Button onClick={save} disabled={busy || score === ''}>
              บันทึก & ถัดไป
            </Button>
          </div>
          <p className="text-xs text-stone-500 text-center">บันทึกครั้งแรกนักเรียนได้ EXP อัตโนมัติ (+10 ตรงเวลา / +5 สาย)</p>
        </div>
      </div>
    </TeacherLayout>
  )
}
