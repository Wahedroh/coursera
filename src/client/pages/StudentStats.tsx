import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { formatDate } from '../lib/format'
import type { StudentStats as Stats } from '../../shared/stats'
import { Button, Card, ErrorBox, Loading } from '../ui'

const pinInput = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white text-center text-xl tracking-[0.5em]'

export default function StudentStats() {
  const navigate = useNavigate()
  const [s, setS] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Stats>('/api/student/stats')
      .then(setS)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])

  const days = s ? Object.values(s.attendance).reduce((a, b) => a + b, 0) : 0
  const came = s ? s.attendance.present + s.attendance.late : 0
  const scored = s?.exams.filter((x) => x.pct !== null) ?? []
  const last2 = scored.slice(-2)
  const trend = last2.length === 2 ? last2[1].pct! - last2[0].pct! : 0

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">📈 สถิติของฉัน</h1>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {!s && !error && <Loading />}
        {s && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-3 text-center">
                <div className="text-3xl font-extrabold text-board">{days ? `${Math.round((came / days) * 100)}%` : '–'}</div>
                <div className="text-sm font-semibold">มาเรียน</div>
                <div className="text-xs text-stone-500">
                  {days ? `${came}/${days} วัน · สาย ${s.attendance.late} · ขาด ${s.attendance.absent}` : 'ยังไม่มีการเช็กชื่อ'}
                </div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-3xl font-extrabold text-board">
                  {s.assignments.onTime + s.assignments.late}/{s.assignments.total - s.assignments.notDue}
                </div>
                <div className="text-sm font-semibold">ส่งงาน</div>
                <div className="text-xs text-stone-500">
                  ตรงเวลา {s.assignments.onTime} · สาย {s.assignments.late}
                  {s.assignments.missing > 0 && <span className="text-red-700"> · ค้าง {s.assignments.missing}</span>}
                </div>
              </Card>
            </div>
            <Card className="p-3">
              <p className="font-bold text-sm">คะแนนสอบของฉัน (%)</p>
              {s.exams.length === 0 ? (
                <p className="text-sm text-stone-500 py-3 text-center">ยังไม่มีคะแนนที่ครูเผยแพร่</p>
              ) : (
                <>
                  <div className="flex items-end gap-2 h-32 pt-5 border-b-2 border-line" data-testid="score-chart">
                    {s.exams.map((x, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <span className="text-[10px] text-stone-600">{x.absent ? 'ขาด' : x.pct ?? '–'}</span>
                        <span
                          className={`w-full rounded-t-md ${x.absent ? 'bg-red-200' : i === s.exams.length - 1 ? 'bg-amber-400' : 'bg-board'}`}
                          style={{ height: `${x.absent ? 4 : Math.max(4, x.pct ?? 0)}%` }}
                          title={`${x.title} · ${formatDate(x.takenOn)}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 text-[10px] text-stone-500 mt-1">
                    {s.exams.map((x, i) => (
                      <span key={i} className="flex-1 text-center truncate">
                        {x.title}
                      </span>
                    ))}
                  </div>
                  {trend > 0 && <p className="text-sm font-bold text-board mt-2">▲ ดีขึ้น {trend}% จากครั้งก่อน เก่งมาก!</p>}
                  {trend < 0 && <p className="text-sm font-semibold text-amber-700 mt-2">ครั้งล่าสุดลดลง {-trend}% — สู้ต่อครั้งหน้านะ 💪</p>}
                </>
              )}
            </Card>
            <Card className="p-3 flex items-center gap-3">
              <span className="rounded-lg bg-amber-400 px-2 py-0.5 font-extrabold text-amber-950">Lv {s.level}</span>
              <span className="text-sm">
                {s.exp} EXP · อีก {s.nextLevelAt - s.exp} EXP ขึ้นเลเวลถัดไป
              </span>
            </Card>
          </>
        )}
        <ChangePin />
      </section>
    </main>
  )
}

function ChangePin() {
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== again) return setMsg({ ok: false, text: 'PIN ใหม่ทั้งสองช่องไม่ตรงกัน' })
    setBusy(true)
    try {
      await api('/api/student/change-pin', { body: { currentPin: cur, newPin: next } })
      setMsg({ ok: true, text: 'เปลี่ยน PIN แล้ว ✓ ครั้งหน้าเข้าสู่ระบบด้วย PIN ใหม่ (เครื่องอื่นที่เคยเข้าไว้จะออกจากระบบ)' })
      setCur('')
      setNext('')
      setAgain('')
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiClientError ? err.message : 'เปลี่ยน PIN ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-3 flex flex-col gap-2">
      <button type="button" className="flex justify-between items-center font-bold text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>🔒 เปลี่ยน PIN</span>
        <span className="text-stone-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-stone-600">
            PIN เดิม
            <input className={pinInput} inputMode="numeric" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(digits(e.target.value))} />
          </label>
          <label className="text-xs font-semibold text-stone-600">
            PIN ใหม่ (ตัวเลข 4 หลัก)
            <input className={pinInput} inputMode="numeric" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(digits(e.target.value))} />
          </label>
          <label className="text-xs font-semibold text-stone-600">
            PIN ใหม่อีกครั้ง
            <input className={pinInput} inputMode="numeric" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
          </label>
          {msg && <p className={`text-sm ${msg.ok ? 'text-board font-semibold' : 'text-red-700'}`}>{msg.text}</p>}
          <Button type="submit" disabled={busy || cur.length !== 4 || next.length !== 4 || again.length !== 4}>
            เปลี่ยน PIN
          </Button>
          <p className="text-xs text-stone-500">อย่าใช้ PIN ที่เดาง่าย เช่น 1234, 0000 หรือวันเกิด · จำ PIN เดิมไม่ได้ ให้แจ้งครูรีเซ็ต</p>
        </form>
      )}
    </Card>
  )
}
