import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../api'
import type { Gradebook } from '../../shared/assignments'
import { todayBangkok } from '../../shared/attendance'
import { CATEGORY_LABEL, SCORE_CATEGORIES, type ScoreBook, type ScoreCategory, type ScoreItemSummary } from '../../shared/scores'
import { exportGradebook } from '../lib/excel'
import { formatDate } from '../lib/format'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

export default function TeacherScores() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const handle = useTeacherErrorHandler()
  const [items, setItems] = useState<ScoreItemSummary[] | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [className, setClassName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ScoreCategory>('quiz')
  const [maxScore, setMaxScore] = useState('20')
  const [takenOn, setTakenOn] = useState(todayBangkok())
  const [classIds, setClassIds] = useState<string[]>([id])

  const load = useCallback(() => {
    api<ScoreItemSummary[]>(`/api/teacher/classes/${id}/score-items`).then(setItems).catch((e) => setError(handle(e)))
  }, [id, handle])
  useEffect(load, [load])
  useEffect(() => {
    setClassIds([id])
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
      const { ids } = await api<{ ids: string[] }>('/api/teacher/score-items', {
        body: { title, category, maxScore: Number(maxScore), takenOn, classIds },
      })
      // ไปหน้ากรอกของห้องนี้ทันที (ห้องอื่นกรอกได้จากหน้าห้องนั้น)
      navigate(`/teacher/score-items/${ids[classIds.indexOf(id)] ?? ids[0]}`)
    } catch (err) {
      setError(handle(err))
    } finally {
      setBusy(false)
    }
  }

  async function exportAll() {
    try {
      const [gb, book] = await Promise.all([
        api<Gradebook>(`/api/teacher/classes/${id}/gradebook`),
        api<ScoreBook>(`/api/teacher/classes/${id}/score-book`),
      ])
      await exportGradebook(gb, book)
    } catch (e) {
      setError(handle(e))
    }
  }

  const toggle = (cid: string) => setClassIds((xs) => (xs.includes(cid) ? xs.filter((x) => x !== cid) : [...xs, cid]))

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← {className || 'หน้าห้อง'}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <h1 className="text-2xl font-extrabold">คะแนนสอบ</h1>
        <button type="button" onClick={exportAll} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
          ⬇ Excel สมุดคะแนน
        </button>
      </div>
      <ErrorBox message={error} />
      {!items && !error && <Loading />}
      {items && items.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีรายการคะแนน</Card>}
      {items && items.length > 0 && (
        <Card className="divide-y divide-stone-100">
          {items.map((it) => (
            <Link key={it.id} to={`/teacher/score-items/${it.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-stone-50">
              <span>
                <span className="font-bold">{it.title}</span>
                <span className="block text-xs text-stone-500">
                  {CATEGORY_LABEL[it.category]} · {formatDate(it.takenOn)} · เต็ม {it.maxScore}
                </span>
              </span>
              <span className="flex gap-2 items-center text-sm">
                <span className="text-stone-500">
                  กรอกแล้ว {it.filled}/{it.total}
                </span>
                {it.published ? <Chip tone="green">เผยแพร่แล้ว</Chip> : <Chip>ยังไม่เผยแพร่</Chip>}
              </span>
            </Link>
          ))}
        </Card>
      )}
      <form onSubmit={create} className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">+ สร้างรายการคะแนน</h2>
          <label className="text-sm font-semibold">
            ชื่อรายการ
            <input className={input} required maxLength={200} placeholder="เช่น สอบย่อย บทที่ 3" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm font-semibold">
              หมวด
              <select className={input} value={category} onChange={(e) => setCategory(e.target.value as ScoreCategory)}>
                {SCORE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              คะแนนเต็ม
              <input type="number" min={0.01} step={0.01} max={1000} required className={input} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </label>
            <label className="text-sm font-semibold">
              วันที่สอบ
              <input type="date" required className={input} value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
            </label>
          </div>
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
