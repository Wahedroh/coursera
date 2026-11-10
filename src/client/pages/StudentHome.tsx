import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, type Me } from '../api'
import type { StudentAssignment, StudentStatus } from '../../shared/assignments'
import { baht, type StudentFee } from '../../shared/fees'
import type { AvatarConfig } from '../../shared/avatar'
import { AvatarArt } from '../components/PixelArt'
import { EXP_PER_LEVEL } from '../../shared/points'
import StudentAnnouncements from '../components/StudentAnnouncements'
import WeeklyQuests from '../components/WeeklyQuests'
import AppSetupCard from '../components/AppSetupCard'
import NotificationBell from '../components/NotificationBell'
import type { StudentBadge } from '../../shared/badges'
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
  const [exp, setExp] = useState<{ exp: number; level: number; nextLevelAt: number } | null>(null)
  const [badges, setBadges] = useState<StudentBadge[]>([])
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
    loadExp()
    api<StudentBadge[]>('/api/student/badges')
      .then((b) => setBadges(b.filter((x) => x.earned)))
      .catch(() => {})
    api<StudentFee[]>('/api/student/fees')
      .then((fs) => setFeeOwed(fs.reduce((n, f) => n + f.outstanding, 0)))
      .catch(() => {})
  }, [navigate])

  function loadExp() {
    api<{ exp: number; level: number; nextLevelAt: number }>('/api/student/exp')
      .then(setExp)
      .catch(() => {})
  }

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
      <header className="relative overflow-hidden bg-gradient-to-b from-board to-[#2c7a5c] text-white px-5 pt-5 pb-5 rounded-b-3xl">
        <NotificationBell />
        {avatar && (
          <Link to="/me/avatar" aria-label="แต่งตัวละคร" className="absolute top-4 right-4 z-10 rounded-full bg-amber-400 text-amber-950 px-3 py-1 text-xs font-extrabold shadow">
            ✏️ แต่งตัว
          </Link>
        )}
        {/* เวทีตัวละคร: ตัวใหญ่ มีเงาใต้เท้าและประกาย */}
        <Link to="/me/avatar" tabIndex={-1} aria-hidden className="relative flex h-56 items-end justify-center" data-testid="avatar-stage">
          <span className="absolute bottom-1 left-1/2 h-6 w-40 -translate-x-1/2 rounded-[50%] bg-black/25" />
          <span className="absolute left-[22%] top-6 text-amber-200 animate-pulse">✦</span>
          <span className="absolute right-[24%] top-16 text-amber-200 animate-pulse [animation-delay:600ms]">✧</span>
          <span className="absolute left-[30%] top-32 text-amber-100/70">·</span>
          {avatar ? (
            <span className="relative drop-shadow-[0_4px_0_rgba(0,0,0,0.15)] animate-hop-slow">
              <AvatarArt config={avatar.config} size={11} label="ตัวละครของฉัน" />
            </span>
          ) : (
            <span className="h-48" />
          )}
        </Link>
        <h1 className="mt-2 text-center text-2xl font-extrabold">สวัสดี {s.firstName} 👋</h1>
        {avatar?.nickname && <p className="text-center font-bold text-amber-200">“{avatar.nickname}”</p>}
        <p className="text-center text-sm opacity-85">
          {s.className} · รหัส {s.zipgradeId}
        </p>
        {exp && (
          <Link to="/me/progress" className="mt-3 flex items-center gap-2 text-xs" aria-label={`เลเวล ${exp.level} · ${exp.exp} EXP`}>
            <span className="rounded-lg bg-amber-400 px-2 py-0.5 font-extrabold text-amber-950">Lv {exp.level}</span>
            <span className="h-3 flex-1 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, Math.max(0, ((exp.exp - (exp.nextLevelAt - EXP_PER_LEVEL)) / EXP_PER_LEVEL) * 100))}%` }} />
            </span>
            <span className="tabular-nums">
              {Math.max(0, exp.exp - (exp.nextLevelAt - EXP_PER_LEVEL))}/{EXP_PER_LEVEL} EXP
            </span>
          </Link>
        )}
        {badges.length > 0 && (
          <Link to="/me/progress" className="mt-2 flex items-center justify-center gap-1" aria-label={`เหรียญตรา ${badges.length} เหรียญ`} data-testid="home-badges">
            {badges.map((b) => (
              <span key={b.id} title={b.title} className="rounded-full bg-white/20 w-8 h-8 flex items-center justify-center text-lg">
                {b.icon}
              </span>
            ))}
          </Link>
        )}
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
          <Link to="/me/materials" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            📄 เอกสารเรียน
          </Link>
          <Link to="/me/fees" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            🧾 ค่าเอกสาร
          </Link>
          <Link to="/me/calendar" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            📅 ปฏิทิน
          </Link>
          <Link to="/me/stats" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">
            📈 สถิติของฉัน
          </Link>
        </div>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <StudentAnnouncements />
        <WeeklyQuests onClaimed={loadExp} />
        <AppSetupCard />
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
