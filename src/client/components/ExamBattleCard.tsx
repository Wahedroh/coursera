import { BATTLE_PASS_PCT, type ExamBattle } from '../../shared/battle'
import { Card } from '../ui'

const MEDAL = ['🥇', '🥈', '🥉']
const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit' })

/** ตารางศึกสอบ: อันดับห้องตามค่าเฉลี่ย % · ผ่านเกณฑ์ · พัฒนาการจากครั้งก่อน (ไม่มีข้อมูลรายคน) */
export default function ExamBattleCard({ b }: { b: ExamBattle }) {
  const mine = b.rows.find((r) => r.mine)
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
          </p>
        )}
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
        <p className="text-[11px] text-stone-400">เทียบค่าเฉลี่ยรายห้องของข้อสอบชุดเดียวกัน · ไม่แสดงชื่อหรือคะแนนรายคน · 🚀 = พัฒนาขึ้นจากสอบครั้งก่อนมากที่สุด</p>
      </Card>
    </div>
  )
}
