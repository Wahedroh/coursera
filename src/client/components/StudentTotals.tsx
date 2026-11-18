import { useEffect, useState } from 'react'
import { api } from '../api'
import type { StudentScoreBreakdown } from '../../shared/grades'
import { EXP_SOURCE_ICON, EXP_SOURCE_LABEL, type ExpBreakdown, type ExpSource } from '../../shared/points'
import { CATEGORY_LABEL, type ScoreCategory } from '../../shared/scores'
import Icon from './Icon'

const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })
const STATUS: Record<StudentScoreBreakdown['assignments'][number]['status'], string> = {
  graded: '',
  submitted: 'ส่งแล้ว รอครูตรวจ',
  late: 'ส่งช้า รอครูตรวจ',
  returned: 'ครูส่งกลับให้แก้',
  missing: 'ยังไม่ส่ง',
  closed: 'ไม่ส่ง (0)',
}

/** หน้าแรกนักเรียน: คะแนนรวม · เกรด · EXP — แตะเพื่อดูว่าได้มาจากอะไรบ้าง */
export default function StudentTotals({ exp }: { exp: { exp: number; level: number } | null }) {
  const [score, setScore] = useState<StudentScoreBreakdown | null>(null)
  const [open, setOpen] = useState<'score' | 'exp' | null>(null)
  useEffect(() => {
    api<StudentScoreBreakdown>('/api/student/grade/breakdown')
      .then(setScore)
      .catch(() => {})
  }, [])
  const grade = score?.grade.visible ? score.grade.grade : null
  const tile = (on: boolean) => `flex-1 rounded-2xl border-2 px-3 py-2 text-left transition ${on ? 'border-board bg-board-soft' : 'border-line bg-white'}`
  return (
    <section className="mx-4 mt-4" data-testid="student-totals">
      <div className="flex gap-2">
        <button type="button" className={tile(open === 'score')} onClick={() => setOpen(open === 'score' ? null : 'score')} aria-expanded={open === 'score'} aria-label="ดูที่มาของคะแนนรวม">
          <span className="block text-xs text-stone-500"><Icon n="chart" /> คะแนนรวม</span>
          <b className="text-xl tabular-nums">{score ? score.total : '–'}</b>
          {score && score.maxTotal > 0 && <span className="text-xs text-stone-500"> / {score.maxTotal}</span>}
          {score?.grade.visible && (
            <span className="block text-xs">
              เกรด <b className="text-board text-base">{grade ?? '–'}</b>
            </span>
          )}
        </button>
        <button type="button" className={tile(open === 'exp')} onClick={() => setOpen(open === 'exp' ? null : 'exp')} aria-expanded={open === 'exp'} aria-label="ดูที่มาของ EXP">
          <span className="block text-xs text-stone-500">⭐ EXP เทอมนี้</span>
          <b className="text-xl tabular-nums">{exp ? exp.exp : '–'}</b>
          {exp && <span className="block text-xs">Lv {exp.level}</span>}
        </button>
      </div>
      <p className="text-[11px] text-stone-500 text-center pt-1">{open ? '' : 'แตะเพื่อดูว่าได้มาจากอะไรบ้าง'}</p>
      {open === 'score' && score && <ScoreDetail d={score} />}
      {open === 'exp' && <ExpDetail />}
    </section>
  )
}

function ScoreDetail({ d }: { d: StudentScoreBreakdown }) {
  return (
    <div className="rounded-2xl border-2 border-line bg-white p-3 text-sm flex flex-col gap-3" data-testid="score-detail">
      <p>
        งาน <b>{d.assignmentTotal}</b> + สอบ <b>{d.examTotal}</b> = <b>{d.total}</b> คะแนน
        {d.grade.visible && d.grade.fullSetBonus && <span className="block text-xs text-board">🏆 สะสมสัตว์วิเศษครบชุด + สอบถึงเกณฑ์ ได้เกรดสูงสุดตามกติกาครู</span>}
      </p>
      <div>
        <b className="text-xs text-stone-500"><Icon n="task" /> งาน ({d.assignments.length})</b>
        {!d.assignments.length && <p className="text-xs text-stone-400">ยังไม่มีงาน</p>}
        <ul>
          {d.assignments.map((a) => (
            <li key={a.id} className="flex justify-between gap-2 border-b border-stone-100 py-1">
              <span className="min-w-0 truncate">{a.title}</span>
              {a.status === 'graded' ? (
                <b className="tabular-nums whitespace-nowrap">
                  {a.score ?? 0}/{a.maxScore}
                </b>
              ) : (
                <span className={`text-xs whitespace-nowrap ${a.status === 'missing' || a.status === 'returned' || a.status === 'closed' ? 'text-red-700' : 'text-stone-500'}`}>{STATUS[a.status]}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <b className="text-xs text-stone-500"><Icon n="exam" /> คะแนนสอบ ({d.exams.length})</b>
        {!d.exams.length && <p className="text-xs text-stone-400">ยังไม่มีคะแนนสอบที่ครูเผยแพร่</p>}
        <ul>
          {d.exams.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 border-b border-stone-100 py-1">
              <span className="min-w-0 truncate">
                <span className="text-xs text-stone-400">{CATEGORY_LABEL[e.category as ScoreCategory] ?? ''}</span> {e.title}
              </span>
              <b className="tabular-nums whitespace-nowrap">{e.absent ? <span className="text-xs text-red-700">ขาดสอบ</span> : e.score === null ? <span className="text-xs text-stone-400 font-normal">รอกรอก</span> : `${e.score}/${e.maxScore}`}</b>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-stone-500">คะแนนรวม = งานที่ครูตรวจแล้ว + คะแนนสอบที่ครูเผยแพร่ · งานที่ยังไม่ส่ง/รอตรวจยังไม่ได้คะแนน</p>
    </div>
  )
}

function ExpDetail() {
  const [d, setD] = useState<ExpBreakdown | null>(null)
  const [only, setOnly] = useState<ExpSource | null>(null)
  useEffect(() => {
    api<ExpBreakdown>('/api/student/exp/breakdown')
      .then(setD)
      .catch(() => {})
  }, [])
  if (!d) return <p className="text-sm text-stone-500 py-2 text-center">กำลังโหลด…</p>
  const max = Math.max(1, ...d.bySource.map((x) => x.exp))
  const list = d.events.filter((e) => !only || e.source === only)
  return (
    <div className="rounded-2xl border-2 border-line bg-white p-3 text-sm flex flex-col gap-2" data-testid="exp-detail">
      {!d.bySource.length && <p className="text-xs text-stone-500">ยังไม่มี EXP เทอมนี้ — ส่งงาน มาเรียน ทบทวนคลิป เพื่อเก็บ EXP</p>}
      <ul className="flex flex-col gap-1">
        {d.bySource.map((x) => (
          <li key={x.source}>
            <button type="button" onClick={() => setOnly(only === x.source ? null : x.source)} className={`w-full flex items-center gap-2 rounded-lg px-1 py-0.5 text-left ${only === x.source ? 'bg-amber-100' : ''}`}>
              <span className="w-28 shrink-0 text-xs">
                <Icon n={EXP_SOURCE_ICON[x.source]} /> {EXP_SOURCE_LABEL[x.source]}
              </span>
              <span className="h-2 flex-1 rounded-full bg-stone-200 overflow-hidden">
                <span className="block h-full bg-amber-400" style={{ width: `${(Math.max(0, x.exp) / max) * 100}%` }} />
              </span>
              <b className="w-10 text-right tabular-nums">{x.exp}</b>
            </button>
          </li>
        ))}
      </ul>
      {d.bySource.length > 0 && (
        <>
          <b className="text-xs text-stone-500">
            {only ? `${EXP_SOURCE_LABEL[only]} (${list.length})` : `ทุกรายการ (${list.length})`}
            {only && (
              <button type="button" className="ml-2 underline font-normal" onClick={() => setOnly(null)}>
                ดูทั้งหมด
              </button>
            )}
          </b>
          <ul className="max-h-64 overflow-y-auto">
            {list.map((e, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-stone-100 py-1 text-xs">
                <span className="min-w-0 truncate">
                  <span className="text-stone-400">{day.format(e.createdAt)}</span> {e.reason}
                </span>
                <b className={`tabular-nums ${e.delta < 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {e.delta > 0 ? '+' : ''}
                  {e.delta}
                </b>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
