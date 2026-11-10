import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../api'
import VideoQuestionsEditor from '../components/VideoQuestionsEditor'
import { LETTERS, MAX_CARD_QUESTIONS, type CardQuestion, type CardQuizSummary } from '../../shared/cardgame'
import { Button, Card, ErrorBox } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string }[] }
type Game = { id: string; className: string; quizTitle: string; createdAt: number; endedAt: number | null; n: number }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

/** เกมตอบคำถามด้วยการ์ด QR: ชุดคำถาม · เริ่มเกม · พิมพ์การ์ด · เกมล่าสุด */
export default function TeacherCardGame() {
  const handle = useTeacherErrorHandler()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [schools, setSchools] = useState<School[]>([])
  const [quizzes, setQuizzes] = useState<CardQuizSummary[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [classId, setClassId] = useState(params.get('class') ?? '')
  const [quizId, setQuizId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; title: string; questions: CardQuestion[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<CardQuizSummary[]>('/api/teacher/card-quizzes')
      .then((q) => {
        setQuizzes(q)
        setQuizId((cur) => cur || q[0]?.id || '')
      })
      .catch((e) => setError(handle(e)))
    api<Game[]>('/api/teacher/card-games').then(setGames).catch(() => {})
  }, [handle])
  useEffect(load, [load])
  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then((s) => {
        setSchools(s)
        setClassId((cur) => cur || s[0]?.classes[0]?.id || '')
      })
      .catch((e) => setError(handle(e)))
  }, [handle])

  async function start() {
    setBusy(true)
    try {
      const { id } = await api<{ id: string }>('/api/teacher/card-games', { body: { quizId, classId } })
      navigate(`/teacher/card-games/${id}`)
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  async function edit(id: string) {
    try {
      const q = await api<{ id: string; title: string; questions: CardQuestion[] }>(`/api/teacher/card-quizzes/${id}`)
      setEditing(q)
    } catch (e) {
      setError(handle(e))
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const body = { title: editing.title, questions: editing.questions }
      if (editing.id) await api(`/api/teacher/card-quizzes/${editing.id}`, { method: 'PUT', body })
      else {
        const { id } = await api<{ id: string }>('/api/teacher/card-quizzes', { body })
        setQuizId(id)
      }
      setEditing(null)
      load()
    } catch (err) {
      setError(handle(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(q: CardQuizSummary) {
    if (!window.confirm(`ลบชุดคำถาม "${q.title}"?`)) return
    try {
      await api(`/api/teacher/card-quizzes/${q.id}`, { method: 'DELETE' })
      if (quizId === q.id) setQuizId('')
      load()
    } catch (e) {
      setError(handle(e))
    }
  }

  const sel = 'border-2 border-line rounded-xl px-3 py-2 bg-white font-semibold'
  const classSelect = (label: string) => (
    <select aria-label={label} className={sel} value={classId} onChange={(e) => setClassId(e.target.value)}>
      {schools.map((s) => (
        <optgroup key={s.schoolId} label={s.schoolName}>
          {s.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">🃏 เกมการ์ด QR</h1>
      <p className="text-sm text-stone-500 -mt-2">นักเรียนชูการ์ด หมุนตัวอักษรที่ตอบไว้ด้านบน · ครูสแกนทั้งห้องด้วยกล้องมือถือเครื่องเดียว</p>
      <ErrorBox message={error} />
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">▶️ เริ่มเกม</h2>
          <div className="flex flex-wrap gap-2">
            {classSelect('ห้องที่เล่น')}
            <select aria-label="ชุดคำถาม" className={sel} value={quizId} onChange={(e) => setQuizId(e.target.value)}>
              {quizzes.length === 0 && <option value="">— สร้างชุดคำถามก่อน —</option>}
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.count} ข้อ)
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={() => void start()} disabled={busy || !quizId || !classId}>
            เริ่มเกม
          </Button>
          <p className="text-xs text-stone-500">เปิดหน้าจอเกมบนคอม/โปรเจกเตอร์ แล้วสแกน QR บนจอด้วยมือถือครู (ต้องล็อกอินครูในมือถือ) เพื่อเปิดกล้อง · หรือเล่นจากมือถือเครื่องเดียวก็ได้</p>
        </Card>
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">🖨️ พิมพ์การ์ดประจำตัว</h2>
          <div className="flex flex-wrap gap-2 items-center">
            {classSelect('ห้องที่พิมพ์การ์ด')}
            <Link to={`/teacher/classes/${classId}/cards`} className="rounded-xl border-2 border-line bg-white px-4 py-2 font-bold">
              เปิดหน้าพิมพ์การ์ด
            </Link>
          </div>
          <p className="text-xs text-stone-500">การ์ด 1 ใบ/คน ใช้ได้ทุกเกมทั้งเทอม · QR เก็บเลข ZipGrade · การ์ดหายพิมพ์ใหม่รายคนได้</p>
        </Card>
      </div>
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="font-bold">📚 ชุดคำถาม</h2>
          <button type="button" className="rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm font-bold" onClick={() => setEditing({ id: null, title: '', questions: [{ q: '', choices: ['', '', '', ''], answer: 0 }] })}>
            + สร้างชุดคำถาม
          </button>
        </div>
        {quizzes.length === 0 && <p className="text-sm text-stone-500">ยังไม่มีชุดคำถาม</p>}
        {quizzes.map((q) => (
          <div key={q.id} className="flex items-center gap-2 border-t border-stone-100 pt-2">
            <span className="flex-1">
              <b>{q.title}</b> <span className="text-xs text-stone-500">{q.count} ข้อ</span>
            </span>
            <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" onClick={() => void edit(q.id)}>
              แก้
            </button>
            <button type="button" className="rounded-lg border border-red-200 text-red-700 bg-white px-2 py-1 text-xs font-semibold" onClick={() => void remove(q)}>
              ลบ
            </button>
          </div>
        ))}
      </Card>
      {editing && (
        <form onSubmit={save}>
          <Card className="p-4 flex flex-col gap-3 border-board">
            <h2 className="font-bold">{editing.id ? 'แก้ชุดคำถาม' : 'สร้างชุดคำถาม'}</h2>
            <label className="text-sm font-semibold">
              ชื่อชุด
              <input className={input} required maxLength={120} placeholder="เช่น ทบทวนกฎของนิวตัน" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <VideoQuestionsEditor
              value={editing.questions}
              onChange={(questions) => setEditing({ ...editing, questions })}
              max={MAX_CARD_QUESTIONS}
              letters={LETTERS}
              legend={`คำถาม (สูงสุด ${MAX_CARD_QUESTIONS} ข้อ · ตัวเลือก 2–4 ข้อ)`}
              hint="ติ๊กวงกลมหน้าตัวเลือกที่ถูก · ตัวเลือก A–D ตรงกับด้านของการ์ด"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !editing.title.trim() || editing.questions.length === 0}>
                บันทึกชุดคำถาม
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                ยกเลิก
              </Button>
            </div>
          </Card>
        </form>
      )}
      {games.length > 0 && (
        <Card className="p-4 flex flex-col gap-1">
          <h2 className="font-bold">🕘 เกมล่าสุด</h2>
          {games.map((g) => (
            <Link key={g.id} to={`/teacher/card-games/${g.id}`} className="flex justify-between gap-2 border-t border-stone-100 pt-1.5 text-sm hover:underline">
              <span>
                <b>{g.quizTitle}</b> · {g.className}
              </span>
              <span className="text-stone-500 text-xs">
                {new Date(g.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} · {g.endedAt ? 'จบแล้ว' : 'กำลังเล่น'}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </TeacherLayout>
  )
}
