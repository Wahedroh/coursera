import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, type Me } from '../api'
import type { StudentAssignment, StudentStatus } from '../../shared/assignments'
import { baht, type StudentFee } from '../../shared/fees'
import type { AvatarConfig } from '../../shared/avatar'
import { AvatarArt } from '../components/PixelArt'
import { formatDue, timeLeft } from '../lib/format'
import { clearDrafts } from '../lib/session'
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
  const [feeOwed, setFeeOwed] = useState(0)
  const [avatar, setAvatar] = useState<{ nickname: string; config: AvatarConfig; isDefault: boolean } | null>(null)

  useEffect(() => {
    api<Me>('/api/me')
      .then((m) => (m.kind === 'student' ? setMe(m) : navigate('/teacher', { replace: true })))
      .catch(() => navigate('/', { replace: true }))
    api<StudentAssignment[]>('/api/student/assignments')
      .then(setItems)
      .catch(() => setItems([]))
    api<{ nickname: string; config: AvatarConfig; isDefault: boolean }>('/api/student/avatar')
      .then(setAvatar)
      .catch(() => {})
    api<StudentFee[]>('/api/student/fees')
      .then((fs) => setFeeOwed(fs.reduce((n, f) => n + f.outstanding, 0)))
      .catch(() => {})
  }, [navigate])

  async function logout() {
    await api('/api/logout', { body: {} }).catch(() => {})
    clearDrafts()
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
        <div className="flex items-center gap-3">
          {avatar && (
            <Link to="/me/avatar" aria-label="แต่งตัวละคร" className="relative shrink-0 rounded-2xl bg-white/15 p-1.5">
              <AvatarArt config={avatar.config} size={4} />
              <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold px-1.5">แต่ง</span>
            </Link>
          )}
          <div>
            <h1 className="text-xl font-extrabold">สวัสดี {s.firstName} 👋</h1>
            {avatar?.nickname && <p className="text-sm font-semibold text-amber-200">“{avatar.nickname}”</p>}
            <p className="text-sm opacity-85">
              {s.className} · รหัส {s.zipgradeId}
            </p>
          </div>
        </div>
        {avatar?.isDefault && (
          <Link to="/me/avatar" className="mt-3 block rounded-xl bg-amber-400 text-amber-950 px-3 py-2 text-sm font-bold">
            ✨ แต่งตัวละครของคุณเองได้แล้ว! แตะเพื่อเริ่ม
          </Link>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <Link to="/me/progress" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            ⭐ ตัวละครและแต้มของฉัน
          </Link>
          <Link to="/me/scores" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            📊 คะแนนสอบ
          </Link>
          <Link to="/me/videos" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            🎬 คลิปย้อนหลัง
          </Link>
          <Link to="/me/fees" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            🧾 ค่าเอกสาร
          </Link>
        </div>
      </header>
      <section className="p-5 flex flex-col gap-3">
        {feeOwed > 0 && (
          <Link to="/me/fees" className="block">
            <Card className="p-3 flex gap-2 items-center bg-amber-50 border-amber-200">
              <span className="text-xl" aria-hidden>
                🧾
              </span>
              <p className="text-sm">
                <b>ค้างค่าเอกสาร {baht(feeOwed)}</b> · แตะเพื่อดูรายละเอียด
              </p>
            </Card>
          </Link>
        )}
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
