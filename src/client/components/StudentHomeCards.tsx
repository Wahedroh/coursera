import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { REMEDIAL_STATUS_LABEL } from '../../shared/remedial'
import type { StudentHomeCards as Data } from '../../shared/studentHome'
import Icon from './Icon'

const hm = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'short' })
const TARGET_KEY = 'gradeTarget'

function until(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `อีก ${m} นาที`
  const h = Math.floor(m / 60)
  if (h < 24) return `อีก ${h} ชม.${m % 60 ? ` ${m % 60} นาที` : ''}`
  return `อีก ${Math.round(h / 24)} วัน`
}

const card = 'rounded-2xl border-2 border-line bg-white p-3 text-sm flex flex-col gap-1.5'

/** การ์ดหน้าแรกนักเรียน: คาบถัดไป · เวลาเรียน · เป้าหมายเกรด · ครูตอบงาน · งานซ่อม */
export default function StudentHomeCards() {
  const [d, setD] = useState<Data | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    api<Data>('/api/student/home-cards')
      .then(setD)
      .catch(() => {})
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  if (!d) return null
  return (
    <div className="flex flex-col gap-3" data-testid="home-cards">
      {d.remedials.length > 0 && <Remedials items={d.remedials} />}
      {d.next && <NextClass n={d.next} now={now} />}
      <Attendance a={d.attendance} />
      {d.target && <Target t={d.target} />}
      {d.feedback.length > 0 && <Feedback items={d.feedback} />}
    </div>
  )
}

function NextClass({ n, now }: { n: NonNullable<Data['next']>; now: number }) {
  const live = n.start <= now
  const today = dayFmt.format(n.start) === dayFmt.format(now)
  return (
    <section className={card} aria-label="คาบถัดไป">
      <b className="text-base">
        <Icon n="alarm" /> {live ? 'กำลังเรียนอยู่' : until(n.start - now)} · {today ? 'วันนี้' : dayFmt.format(n.start)} {hm.format(n.start)}–{hm.format(n.end)} น.
      </b>
      {n.online && (
        <p>
          <Icon n="laptop" /> เรียนออนไลน์{' '}
          {n.meetUrl && (
            <a href={n.meetUrl} target="_blank" rel="noreferrer" className="font-bold text-board underline">
              เข้า Google Meet
            </a>
          )}
        </p>
      )}
      {n.note && <p className="text-stone-600">{n.note}</p>}
      {n.due.map((a) => (
        <Link key={a.id} to={`/me/assignments/${a.id}`} className="text-amber-800">
          <Icon n="warning" /> ต้องส่งก่อนจบคาบ: <b className="underline">{a.title}</b> ({hm.format(a.dueAt)} น.)
        </Link>
      ))}
    </section>
  )
}

function Attendance({ a }: { a: Data['attendance'] }) {
  if (!a.days) return null
  const bad = a.pct !== null && a.pct < a.min
  const pct = a.pct ?? 0
  return (
    <section className={card} aria-label="เวลาเรียน">
      <b className="text-base">
        <Icon n="check" /> มาเรียน {a.days - a.absent}/{a.days} ครั้ง ({a.pct}%)
      </b>
      <div className="relative h-2.5 rounded-full bg-stone-200 overflow-hidden" role="img" aria-label={`เวลาเรียน ${a.pct}% เกณฑ์ ${a.min}%`}>
        <span className={`block h-full ${bad ? 'bg-red-600' : 'bg-board'}`} style={{ width: `${pct}%` }} />
        <span className="absolute -top-1 -bottom-1 w-0.5 bg-red-700" style={{ left: `${a.min}%` }} />
      </div>
      <p className={`text-xs ${bad ? 'text-red-700 font-semibold' : 'text-stone-500'}`}>
        {bad ? `ต่ำกว่า ${a.min}% เสี่ยงติด มส — มาเรียนให้ครบ แล้วคุยกับครูนะ` : a.left > 0 ? `ต้องมาเรียน ≥ ${a.min}% · ขาดได้อีก ${a.left} ครั้งก่อนติด มส` : `ต้องมาเรียน ≥ ${a.min}% · ห้ามขาดเพิ่มแล้ว!`}
        {a.sick + a.leave > 0 && ` · ป่วย/ลา ${a.sick + a.leave} ครั้ง (ไม่นับขาด)`}
      </p>
    </section>
  )
}

function Target({ t }: { t: NonNullable<Data['target']> }) {
  const choices = t.bands.filter((b) => b.gap > 0 || b.grade === t.grade)
  const [pick, setPick] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TARGET_KEY)
      if (saved && t.bands.some((b) => b.grade === saved)) return saved
    } catch {
      // ใช้ค่าเริ่มต้น
    }
    return [...t.bands].reverse().find((b) => b.gap > 0)?.grade ?? t.bands[0]?.grade ?? ''
  })
  const choose = (g: string) => {
    setPick(g)
    try {
      localStorage.setItem(TARGET_KEY, g)
    } catch {
      // ไม่จำก็ได้
    }
  }
  const band = t.bands.find((b) => b.grade === pick)
  if (!band || !choices.length) return null
  // งานที่ส่งแล้วพอถึงเป้า (เรียงตามกำหนดส่ง)
  const plan: typeof t.pending = []
  let sum = 0
  for (const p of t.pending) {
    if (sum >= band.gap) break
    plan.push(p)
    sum += p.maxScore
  }
  return (
    <section className={card} aria-label="เป้าหมายเกรด">
      <div className="flex items-center gap-2">
        <b className="text-base">
          <Icon n="target" /> เป้าหมาย: เกรด
        </b>
        <select aria-label="เลือกเกรดเป้าหมาย" value={pick} onChange={(e) => choose(e.target.value)} className="rounded-lg border-2 border-line px-2 py-0.5 font-bold">
          {t.bands.map((b) => (
            <option key={b.grade} value={b.grade}>
              {b.grade}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-stone-500">ตอนนี้ {t.grade ?? '–'}</span>
      </div>
      <div className="h-2.5 rounded-full bg-stone-200 overflow-hidden">
        <span className="block h-full bg-amber-400" style={{ width: `${band.pct}%` }} />
      </div>
      {band.gap <= 0 ? (
        <p className="text-board font-semibold">ถึงเป้าแล้ว! รักษาไว้นะ 🎉</p>
      ) : (
        <p>
          ขาดอีกประมาณ <b>{band.gap} คะแนน</b>
          {plan.length > 0 && sum >= band.gap && (
            <>
              {' '}
              · ส่ง{' '}
              {plan.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link to={`/me/assignments/${p.id}`} className="underline font-semibold">
                    {p.title}
                  </Link>{' '}
                  ({p.maxScore})
                </span>
              ))}{' '}
              ให้ได้คะแนนดี ก็ถึงแล้ว!
            </>
          )}
          {plan.length > 0 && sum < band.gap && ' · ส่งงานที่ค้างให้ครบ และตั้งใจสอบนะ'}
        </p>
      )}
      <p className="text-[11px] text-stone-400">เกรดเทียบกับคะแนนเพื่อนในห้องตอนนี้ ตัวเลขเปลี่ยนได้เมื่อมีงาน/สอบเพิ่ม</p>
    </section>
  )
}

function Feedback({ items }: { items: Data['feedback'] }) {
  return (
    <section className={card} aria-label="ครูตอบงานของฉัน">
      <b className="text-base">
        <Icon n="megaphone" /> ครูตอบงานของฉัน
      </b>
      <ul>
        {items.map((f) => (
          <li key={f.assignmentId} className="border-b border-stone-100 last:border-0 py-1">
            <Link to={`/me/assignments/${f.assignmentId}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {f.title}
                {f.comment && <i className="text-stone-500"> · “{f.comment}”</i>}
              </span>
              {f.status === 'returned' ? <span className="rounded-full bg-violet-100 text-violet-700 px-2 text-xs font-bold whitespace-nowrap">ส่งแก้</span> : <b className="tabular-nums whitespace-nowrap">{f.score ?? 0}/{f.maxScore}</b>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Remedials({ items }: { items: Data['remedials'] }) {
  return (
    <section className={`${card} border-amber-300 bg-amber-50`} aria-label="งานซ่อมของฉัน">
      <b className="text-base">
        <Icon n="edit" /> งานซ่อมของฉัน
      </b>
      {items.map((r) => (
        <Link key={r.id} to={`/me/remedial/${r.id}`} className="flex items-center gap-2">
          <span className="flex-1 underline font-semibold">{r.title}</span>
          <span className="text-xs">{REMEDIAL_STATUS_LABEL[r.status]}</span>
        </Link>
      ))}
    </section>
  )
}
