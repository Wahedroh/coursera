import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, type Me } from '../api'
import type { StudentAssignment, StudentStatus } from '../../shared/assignments'
import { formatDue, timeLeft } from '../lib/format'
import { Button, Card, Chip, Loading } from '../ui'

type StudentMe = Extract<Me, { kind: 'student' }>
type Tab = 'pending' | 'submitted' | 'graded' | 'returned'

const TAB_OF: Record<StudentStatus, Tab> = { missing: 'pending', submitted: 'submitted', late: 'submitted', graded: 'graded', returned: 'returned' }
const TABS: [Tab, string][] = [
  ['pending', 'ค้างส่ง'],
  ['submitted', 'ส่งแล้ว'],
  ['graded', 'ตรวจแล้ว'],
  ['returned', 'แก้'],
]

export default function StudentHome() {
  const navigate = useNavigate()
  const [me, setMe] = useState<StudentMe | null>(null)
  const [items, setItems] = useState<StudentAssignment[] | null>(null)
  const [tab, setTab] = useState<Tab>('pending')

  useEffect(() => {
    api<Me>('/api/me')
      .then((m) => (m.kind === 'student' ? setMe(m) : navigate('/teacher', { replace: true })))
      .catch(() => navigate('/', { replace: true }))
    api<StudentAssignment[]>('/api/student/assignments')
      .then(setItems)
      .catch(() => setItems([]))
  }, [navigate])

  async function logout() {
    await api('/api/logout', { body: {} }).catch(() => {})
    navigate('/', { replace: true })
  }

  if (!me) return <Loading />
  const s = me.student
  const pending = items?.filter((a) => a.status === 'missing' || a.status === 'returned') ?? []
  const urgent = pending.filter((a) => a.dueAt !== null && a.dueAt - Date.now() < 24 * 3600_000)
  const shown = items?.filter((a) => TAB_OF[a.status] === tab) ?? []

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-6 pb-6 rounded-b-3xl">
        <h1 className="text-xl font-extrabold">สวัสดี {s.firstName} 👋</h1>
        <p className="text-sm opacity-85">
          {s.className} · รหัส {s.zipgradeId}
        </p>
        <Link to="/me/progress" className="inline-block mt-3 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
          ⭐ ตัวละครและแต้มของฉัน
        </Link>
      </header>
      <section className="p-5 flex flex-col gap-3">
        {pending.length > 0 && (
          <Card className={`p-3 flex gap-2 items-center ${urgent.length ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <span className="text-xl" aria-hidden>
              ⏰
            </span>
            <p className="text-sm">
              <b>ค้างส่ง {pending.length} งาน</b>
              {urgent[0] && <> · {urgent[0].title} {formatDue(urgent[0].dueAt)}</>}
            </p>
          </Card>
        )}
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1 self-start" role="tablist">
          {TABS.map(([k, label]) => {
            const n = items?.filter((a) => TAB_OF[a.status] === k).length ?? 0
            return (
              <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-white shadow-sm' : 'text-stone-500'}`}>
                {label} {n}
              </button>
            )
          })}
        </div>
        {!items && <Loading />}
        {items && shown.length === 0 && <p className="text-sm text-stone-500 text-center py-6">ไม่มีงานในหมวดนี้</p>}
        {shown.map((a) => {
          const left = a.status === 'missing' ? timeLeft(a.dueAt) : null
          return (
            <Link key={a.id} to={`/me/assignments/${a.id}`} className="block">
              <Card className={`p-4 ${a.status === 'returned' ? 'bg-violet-50 border-violet-200' : ''}`}>
                <div className="flex justify-between items-center">
                  {a.status === 'returned' ? <Chip tone="purple">ครูส่งกลับให้แก้</Chip> : left ? <Chip tone={left.tone}>{left.label}</Chip> : <span />}
                  <span className="text-xs text-stone-500">
                    {a.status === 'graded' && a.submission?.score !== null ? `${a.submission?.score}/${a.maxScore}` : `${a.maxScore} คะแนน`}
                  </span>
                </div>
                <h3 className="font-bold mt-2">{a.title}</h3>
                {a.status === 'returned' && a.submission?.comment ? (
                  <p className="text-sm text-violet-700">“{a.submission.comment}”</p>
                ) : (
                  <p className="text-sm text-stone-500 line-clamp-2">{a.instructions}</p>
                )}
                <p className="text-xs text-stone-500 mt-2">{formatDue(a.dueAt)}</p>
              </Card>
            </Link>
          )
        })}
        <Button variant="ghost" onClick={logout} className="mt-4">
          ออกจากระบบ
        </Button>
      </section>
    </main>
  )
}
