import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Student = { id: string; firstName: string; lastName: string; active: boolean }
type Layout = { cols: number; seats: (string | null)[] }
type Points = { studentId: string; exp: number; level: number }[]

const REASONS = ['ตอบคำถาม', 'ช่วยเพื่อน', 'ตั้งใจเรียน', 'ไม่ส่งการบ้าน', 'คุยในห้อง']

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TeacherSeating() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [className, setClassName] = useState('')
  const [students, setStudents] = useState<Map<string, Student>>(new Map())
  const [layout, setLayout] = useState<Layout | null>(null)
  const [points, setPoints] = useState<Map<string, number>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [arrange, setArrange] = useState(false)
  const [moveFrom, setMoveFrom] = useState<number | null>(null)
  const [reason, setReason] = useState(REASONS[0])
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [groupCount, setGroupCount] = useState(6)
  const [groups, setGroups] = useState<string[][] | null>(null)
  const [leaderboard, setLeaderboard] = useState(false)
  const pickKey = `picked:${id}`

  const loadPoints = useCallback(() => {
    api<Points>(`/api/teacher/classes/${id}/points`)
      .then((p) => setPoints(new Map(p.map((x) => [x.studentId, x.exp]))))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    api<{ class: { name: string }; students: Student[] }>(`/api/teacher/classes/${id}/students`)
      .then((d) => {
        setClassName(d.class.name)
        setStudents(new Map(d.students.filter((s) => s.active).map((s) => [s.id, s])))
      })
      .catch((e) => setError(handle(e)))
    api<Layout>(`/api/teacher/classes/${id}/seating`).then(setLayout).catch((e) => setError(handle(e)))
    api<{ leaderboardEnabled: boolean }>('/api/teacher/settings').then((s) => setLeaderboard(s.leaderboardEnabled)).catch(() => {})
    loadPoints()
  }, [id, handle, loadPoints])

  async function give(delta: number) {
    if (!selected) return
    try {
      await api('/api/teacher/points', { body: { studentIds: [selected], delta, reason } })
      setFlash(`ให้ ${delta > 0 ? '+' : ''}${delta} แต้ม: ${students.get(selected)?.firstName} (${reason})`)
      loadPoints()
    } catch (e) {
      setError(handle(e))
    }
  }

  function tapSeat(i: number) {
    if (!layout) return
    if (!arrange) {
      const sid = layout.seats[i]
      setSelected(sid && sid !== selected ? sid : null)
      return
    }
    if (moveFrom === null) return setMoveFrom(i)
    const seats = [...layout.seats]
    ;[seats[moveFrom], seats[i]] = [seats[i] ?? null, seats[moveFrom] ?? null]
    setLayout({ ...layout, seats })
    setMoveFrom(null)
  }

  async function saveLayout() {
    if (!layout) return
    const placed = new Set(layout.seats.filter(Boolean))
    const seats = [...layout.seats, ...[...students.keys()].filter((s) => !placed.has(s))]
    try {
      await api(`/api/teacher/classes/${id}/seating`, { method: 'PUT', body: { cols: layout.cols, seats } })
      setLayout({ ...layout, seats })
      setArrange(false)
      setFlash('บันทึกผังที่นั่งแล้ว')
    } catch (e) {
      setError(handle(e))
    }
  }

  function pick() {
    let done: string[] = []
    try {
      done = JSON.parse(sessionStorage.getItem(pickKey) ?? '[]')
    } catch {}
    let pool = [...students.keys()].filter((s) => !done.includes(s))
    if (pool.length === 0) {
      done = []
      pool = [...students.keys()]
    }
    const s = pool[Math.floor(Math.random() * pool.length)]
    try {
      sessionStorage.setItem(pickKey, JSON.stringify([...done, s]))
    } catch {}
    setPicked(s ?? null)
  }

  function makeGroups() {
    const ids = shuffle([...students.keys()])
    const n = Math.max(2, Math.min(groupCount, ids.length))
    const g: string[][] = Array.from({ length: n }, () => [])
    ids.forEach((s, i) => g[i % n].push(s))
    setGroups(g)
  }

  async function toggleLeaderboard(v: boolean) {
    setLeaderboard(v)
    await api('/api/teacher/settings/leaderboard', { method: 'PUT', body: { enabled: v } }).catch((e) => setError(handle(e)))
  }

  const name = (sid: string) => students.get(sid)?.firstName ?? ''
  const remaining = (() => {
    try {
      return students.size - JSON.parse(sessionStorage.getItem(pickKey) ?? '[]').length
    } catch {
      return students.size
    }
  })()

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← {className || 'หน้าห้อง'}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <h1 className="text-2xl font-extrabold">ผังห้อง & แต้ม</h1>
        <div className="flex gap-2">
          {arrange ? (
            <Button onClick={saveLayout}>บันทึกผัง</Button>
          ) : (
            <Button variant="ghost" onClick={() => (setArrange(true), setSelected(null))}>
              จัดที่นั่ง
            </Button>
          )}
        </div>
      </div>
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      <ErrorBox message={error} />
      {arrange && <p className="text-sm text-stone-500">แตะที่นั่งหนึ่ง แล้วแตะอีกที่นั่งเพื่อสลับ</p>}
      {!layout && !error && <Loading />}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px] items-start">
        {layout && (
          <Card className="p-3 overflow-x-auto">
            <div className="text-center mb-2">
              <span className="text-xs bg-stone-100 rounded-full px-6 py-1">กระดาน / หน้าห้อง</span>
            </div>
            <div className="grid gap-2 min-w-[480px]" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
              {[...layout.seats, null, null].map((sid, i) => {
                const st = sid ? students.get(sid) : null
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => tapSeat(i)}
                    aria-label={st ? `${st.firstName} ${st.lastName}` : `ที่นั่งว่าง ${i + 1}`}
                    className={`relative rounded-xl border-[1.5px] min-h-16 p-1 text-xs ${st ? 'bg-[#FFFDF8]' : 'bg-stone-50 border-dashed'} ${
                      (sid && sid === selected) || moveFrom === i ? 'border-board ring-2 ring-board/30' : 'border-line'
                    }`}
                  >
                    {st && (
                      <>
                        <b className="block text-sm">{st.firstName}</b>
                        <span className="text-stone-400">{points.get(st.id) ?? 0} EXP</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>
        )}
        <div className="flex flex-col gap-3">
          {selected && !arrange && (
            <Card className="p-4 flex flex-col gap-2 border-board">
              <b>
                {students.get(selected)?.firstName} {students.get(selected)?.lastName}
              </b>
              <div className="flex flex-wrap gap-1">
                {REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={`rounded-full px-2.5 py-1 text-xs ${reason === r ? 'bg-board-soft text-board font-semibold' : 'bg-stone-100 text-stone-600'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => give(-1)}>
                  −1
                </Button>
                <Button onClick={() => give(1)}>+1</Button>
                <Button onClick={() => give(5)} className="bg-amber-400 text-amber-950 shadow-[0_3px_0_#c48d1c]">
                  +5
                </Button>
              </div>
            </Card>
          )}
          <Card className="p-4 bg-board text-white text-center flex flex-col gap-2 border-0">
            <span className="text-xs opacity-80">🎲 สุ่มชื่อ (เหลือ {remaining} คนที่ยังไม่ถูกสุ่ม)</span>
            {picked && <span className="text-2xl font-extrabold">{name(picked)}</span>}
            <button type="button" onClick={pick} className="rounded-xl bg-amber-400 text-amber-950 px-3 py-2 font-bold">
              สุ่มชื่อ
            </button>
          </Card>
          <Card className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm">
                จำนวนกลุ่ม
                <input type="number" min={2} max={20} value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))} className="w-16 border-2 border-line rounded-lg px-2 py-1 ml-2" />
              </label>
              <button type="button" onClick={makeGroups} className="rounded-xl border-2 border-line px-3 py-1 font-bold text-sm">
                👥 แบ่งกลุ่ม
              </button>
            </div>
            {groups?.map((g, i) => (
              <p key={i} className="text-xs">
                <b>กลุ่ม {i + 1}:</b> {g.map(name).join(', ')}
              </p>
            ))}
          </Card>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={leaderboard} onChange={(e) => toggleLeaderboard(e.target.checked)} />
            เปิดกระดานจัดอันดับให้นักเรียนเห็น
          </label>
        </div>
      </div>
    </TeacherLayout>
  )
}
