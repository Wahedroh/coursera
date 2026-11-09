import { useEffect, useState } from 'react'
import { api, ApiClientError } from '../api'
import type { WeeklyQuests as Quests } from '../../shared/quests'
import { Card } from '../ui'

/** ภารกิจประจำสัปดาห์ — ทำครบแล้วกดรับ EXP */
export default function WeeklyQuests({ onClaimed }: { onClaimed?: () => void }) {
  const [q, setQ] = useState<Quests | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<Quests>('/api/student/quests')
      .then(setQ)
      .catch(() => {})
  }, [])
  if (!q) return null

  async function claim(id: string) {
    setBusy(id)
    setError(null)
    try {
      setQ(await api<Quests>(`/api/student/quests/${id}/claim`, { body: {} }))
      onClaimed?.()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'รับรางวัลไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  const done = q.quests.filter((x) => x.claimed).length
  const daysLeft = Math.max(1, Math.ceil((q.endsAt - Date.now()) / 86400_000))
  return (
    <div data-testid="weekly-quests">
      <Card className="p-4 flex flex-col gap-2 border-amber-200">
        <div className="flex justify-between items-baseline">
          <h2 className="font-bold">🎯 ภารกิจสัปดาห์นี้</h2>
          <span className="text-xs text-stone-500">
            สำเร็จ {done}/{q.quests.length} · เหลือ {daysLeft} วัน
          </span>
        </div>
        {q.quests.map((x) => {
          const ready = x.progress >= x.need && !x.claimed
          return (
            <div key={x.id} className="flex items-center gap-3">
              <span className="text-xl" aria-hidden>
                {x.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-sm">
                  <span className={x.claimed ? 'text-stone-400 line-through' : 'font-semibold'}>{x.title}</span>
                  <span className="text-xs text-stone-500 tabular-nums">
                    {x.progress}/{x.need}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden mt-1">
                  <div className={`h-full rounded-full ${x.claimed ? 'bg-stone-300' : 'bg-amber-400'}`} style={{ width: `${(x.progress / x.need) * 100}%` }} />
                </div>
              </div>
              {x.claimed ? (
                <span className="text-xs font-bold text-board w-16 text-center">✓ รับแล้ว</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void claim(x.id)}
                  disabled={!ready || busy !== null}
                  aria-label={`รับ ${x.exp} EXP จากภารกิจ ${x.title}`}
                  className={`w-16 rounded-lg px-2 py-1 text-xs font-extrabold ${ready ? 'bg-amber-400 text-amber-950 shadow-[0_2px_0_#c48d1c] animate-pulse' : 'bg-stone-100 text-stone-400'}`}
                >
                  +{x.exp} EXP
                </button>
              )}
            </div>
          )
        })}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </Card>
    </div>
  )
}
