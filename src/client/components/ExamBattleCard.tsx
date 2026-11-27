import { useState } from 'react'
import { avatarConfigSchema, DEFAULT_AVATAR } from '../../shared/avatar'
import { BATTLE_PASS_PCT, type BattlePlayer, type ExamBattle } from '../../shared/battle'
import { Card } from '../ui'
import { AvatarArt } from './PixelArt'

const avatarOf = (v: unknown) => {
  const r = avatarConfigSchema.safeParse(v)
  return r.success ? r.data : DEFAULT_AVATAR
}

const MEDAL = ['🥇', '🥈', '🥉']
const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit' })

/** ตารางศึกสอบ: อันดับห้องตามค่าเฉลี่ย % · ผ่านเกณฑ์ · พัฒนาการจากครั้งก่อน (ไม่มีข้อมูลรายคน) */
export default function ExamBattleCard({ b }: { b: ExamBattle }) {
  const mine = b.rows.find((r) => r.mine)
  const [tab, setTab] = useState<'class' | 'people'>('class')
  return (
    <div data-testid="battle-card">
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="mr-auto font-extrabold">⚔️ {b.title}</h3>
          <span className="text-xs text-stone-500">
            เต็ม {b.maxScore} · {day.format(Date.parse(`${b.takenOn}T00:00:00Z`))} · {b.rows.length} ห้อง
          </span>
        </div>
        {mine && (
          <p className="rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">
            ห้องเราได้อันดับ {mine.rank} จาก {b.rows.length} ห้อง {MEDAL[mine.rank - 1] ?? ''}
            {b.mostImproved === mine.classId && ' · 🚀 พัฒนาขึ้นมากที่สุด!'}
            {b.me && (
              <span className="block text-xs font-semibold">
                อันดับของฉัน {b.me.rank} จาก {b.players} คน (ทุกโรงเรียน) · {b.me.score}/{b.maxScore}
              </span>
            )}
          </p>
        )}
        <div role="tablist" className="flex gap-1 self-start rounded-xl bg-stone-100 p-1 text-sm">
          {(
            [
              ['class', '🏫 อันดับห้อง'],
              ['people', '🏅 อันดับรายคน'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1 font-semibold ${tab === k ? 'bg-white text-board shadow-sm' : 'text-stone-500'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'people' ? (
          <People b={b} />
        ) : (
        <ol className="flex flex-col gap-1.5">
          {b.rows.map((r) => (
            <li key={r.classId} className={`rounded-xl px-2.5 py-1.5 ${r.mine ? 'bg-board-soft ring-2 ring-board' : 'bg-stone-50'}`}>
              <div className="flex items-center gap-2 text-sm">
                <b className="w-7 shrink-0 text-center">{MEDAL[r.rank - 1] ?? r.rank}</b>
                <span className="min-w-0 flex-1 truncate">
                  <b>{r.className}</b> <span className="text-xs text-stone-500">{r.schoolName}</span>
                  {b.mostImproved === r.classId && <span title="พัฒนาขึ้นมากที่สุด"> 🚀</span>}
                </span>
                <b className="tabular-nums">{r.avgPct}%</b>
              </div>
              <div className="ml-9 mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-board" style={{ width: `${Math.min(100, r.avgPct)}%` }} />
              </div>
              <div className="ml-9 mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-stone-500">
                <span>ผ่าน {BATTLE_PASS_PCT}%: {r.passPct}%</span>
                <span>{r.n} คน</span>
                {r.deltaPct !== null && <span className={r.deltaPct >= 0 ? 'text-board font-semibold' : 'text-red-700'}>{r.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(r.deltaPct)} จากครั้งก่อน</span>}
              </div>
            </li>
          ))}
        </ol>
        )}
        <p className="text-[11px] text-stone-400">{tab === 'class' ? 'เทียบค่าเฉลี่ยรายห้องของข้อสอบชุดเดียวกัน · 🚀 = พัฒนาขึ้นจากสอบครั้งก่อนมากที่สุด' : 'คะแนนสูงสุด 10 อันดับจากทุกโรงเรียน · แสดงเฉพาะชื่อเล่น (ชื่อในเกม) และโรงเรียน ไม่แสดงชื่อจริง · ตั้งชื่อเล่นได้ที่หน้าแต่งตัว'}</p>
      </Card>
    </div>
  )
}

/** อันดับรายคน: โพเดียม 3 อันดับแรก (ตัวละคร + ชื่อเล่น + โรงเรียน) แล้วตามด้วยอันดับ 4–10 */
function People({ b }: { b: ExamBattle }) {
  const [first, second, third, ...rest] = b.top
  const podium: [BattlePlayer | undefined, number][] = [
    [second, 0],
    [first, 1],
    [third, 2],
  ]
  if (!b.top.length) return <p className="text-sm text-stone-500">ยังไม่มีคะแนน</p>
  return (
    <div className="flex flex-col gap-2" data-testid="battle-people">
      <div className="flex items-end justify-center gap-2 rounded-2xl bg-gradient-to-b from-board to-[#2c7a5c] px-2 pt-3 text-white">
        {podium.map(([p, k]) =>
          p ? (
            <div key={k} className={`flex w-1/3 flex-col items-center gap-0.5 ${p.mine ? 'drop-shadow-[0_0_6px_#f2b544]' : ''}`}>
              <AvatarArt config={avatarOf(p.avatar)} size={k === 1 ? 5 : 4} label={p.nickname} />
              <b className="max-w-full truncate text-sm">{p.nickname}</b>
              <span className="max-w-full truncate text-[11px] opacity-85">{p.schoolName}</span>
              <span className="text-xs font-bold">
                {p.score}/{b.maxScore}
              </span>
              <div className={`flex w-full justify-center rounded-t-xl pt-1 text-xl font-extrabold text-amber-950 ${k === 1 ? 'h-14 bg-amber-300' : k === 0 ? 'h-10 bg-stone-300' : 'h-7 bg-[#CD8B4E]'}`}>{p.rank}</div>
            </div>
          ) : (
            <div key={k} className="w-1/3" />
          ),
        )}
      </div>
      {rest.length > 0 && (
        <ol className="flex flex-col divide-y divide-stone-100 text-sm">
          {rest.map((p, i) => (
            <li key={i} className={`flex items-center gap-2 px-2 py-1 ${p.mine ? 'rounded-lg bg-board-soft font-bold' : ''}`}>
              <b className="w-6 text-center tabular-nums">{p.rank}</b>
              <span className="min-w-0 flex-1 truncate">
                {p.nickname} <span className="text-xs text-stone-500">{p.schoolName}</span>
              </span>
              <span className="tabular-nums">
                {p.score}/{b.maxScore}
              </span>
            </li>
          ))}
        </ol>
      )}
      {b.me && b.me.rank > (b.top.at(-1)?.rank ?? 0) && (
        <p className="rounded-lg bg-board-soft px-2 py-1 text-sm font-bold text-board">
          อันดับของฉัน {b.me.rank} · {b.me.score}/{b.maxScore}
        </p>
      )}
    </div>
  )
}
