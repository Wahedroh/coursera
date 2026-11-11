import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { AvatarArt } from './PixelArt'
import { avatarConfigSchema, DEFAULT_AVATAR } from '../../shared/avatar'
import { LETTERS, type CardGameResult, type CardGameState } from '../../shared/cardgame'
import { Button } from '../ui'

/** สถานะเกม (ดึงใหม่ทุก ~1.5 วินาที ให้จอหน้าห้องกับมือถือครูตรงกัน) */
export function useCardGame(id: string, onError: (e: unknown) => void, intervalMs = 1500) {
  const [state, setState] = useState<CardGameState | null>(null)
  const load = useCallback(() => api<CardGameState>(`/api/teacher/card-games/${id}`).then(setState).catch(onError), [id, onError])
  useEffect(() => {
    void load()
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), intervalMs)
    return () => clearInterval(t)
  }, [load, intervalMs])
  return { state, reload: load }
}

/** นับถอยหลังของข้อปัจจุบัน (วินาทีที่เหลือ) · null = ไม่จำกัดเวลา */
export function useCountdown(state: CardGameState | null): number | null {
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    setDeadline(state && state.remainingMs !== null && !state.revealed && !state.ended ? Date.now() + state.remainingMs : null)
  }, [state])
  useEffect(() => {
    if (deadline === null) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [deadline])
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
}

export function Countdown({ left, big }: { left: number | null; big?: boolean }) {
  if (left === null) return null
  return (
    <span
      data-testid="countdown"
      className={`inline-flex items-center justify-center rounded-full font-extrabold tabular-nums ${big ? 'w-20 h-20 text-4xl' : 'w-11 h-11 text-xl'} ${left <= 5 ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-300 text-amber-950'}`}
      aria-label={left ? `เหลือ ${left} วินาที` : 'หมดเวลา'}
    >
      {left || '⏰'}
    </span>
  )
}

/** ปุ่มควบคุม: เฉลย · ข้อก่อน/ถัดไป · จบเกม */
export function GameControls({
  state,
  reload,
  onError,
  compact,
  onEnded,
}: {
  state: CardGameState
  reload: () => Promise<unknown>
  onError: (e: unknown) => void
  compact?: boolean
  onEnded?: (r: CardGameResult) => void
}) {
  const [ending, setEnding] = useState(false)
  const [saveScore, setSaveScore] = useState(true)
  const [attendance, setAttendance] = useState(false)
  const [busy, setBusy] = useState(false)
  const act = async (path: string, body: unknown = {}) => {
    setBusy(true)
    try {
      const r = await api<unknown>(`/api/teacher/card-games/${state.id}/${path}`, { body })
      if (path === 'end') onEnded?.(r as CardGameResult)
      await reload()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  if (state.ended) return null
  const last = state.current >= state.questions.length - 1
  const btn = `rounded-xl px-3 ${compact ? 'py-2 text-sm' : 'py-2.5'} font-bold disabled:opacity-50`
  return (
    <div className="flex flex-wrap gap-2 items-center" data-testid="game-controls">
      <button type="button" className={`${btn} border-2 border-line bg-white text-stone-900`} disabled={busy || state.current === 0} onClick={() => void act('goto', { index: state.current - 1 })} aria-label="ข้อก่อน">
        ◀
      </button>
      {!state.revealed ? (
        <button type="button" className={`${btn} bg-amber-400 text-amber-950`} disabled={busy} onClick={() => void act('reveal')}>
          เฉลย
        </button>
      ) : !last ? (
        <button type="button" className={`${btn} bg-board text-white`} disabled={busy} onClick={() => void act('goto', { index: state.current + 1 })}>
          ข้อถัดไป ▶
        </button>
      ) : null}
      <button type="button" className={`${btn} border-2 border-red-200 text-red-700 bg-white`} disabled={busy} onClick={() => setEnding(true)}>
        จบเกม
      </button>
      {ending && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEnding(false)}>
          <div role="dialog" aria-label="จบเกม" className="bg-white text-stone-900 rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <b className="text-lg">จบเกมและให้ EXP?</b>
            <p className="text-sm text-stone-600">คนที่ชูการ์ดได้ +3 EXP และตอบถูกได้ข้อละ +1 EXP</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saveScore} onChange={(e) => setSaveScore(e.target.checked)} />
              บันทึกเป็นคะแนนเก็บ (หน้าคะแนนสอบ)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={attendance} onChange={(e) => setAttendance(e.target.checked)} />
              นับเป็นการเช็กชื่อวันนี้ (ชูการ์ด = มาเรียน)
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEnding(false)
                  void act('end', { saveScore, attendance })
                }}
              >
                จบเกม
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEnding(false)}>
                เล่นต่อ
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const avatarOf = (v: unknown) => {
  const r = avatarConfigSchema.safeParse(v)
  return r.success ? r.data : DEFAULT_AVATAR
}

/** ผลเกม: โพเดียม 3 อันดับ + ตารางทุกคน + ข้อที่ตอบผิดมากที่สุด */
export function GameResults({ result, state }: { result: CardGameResult; state: CardGameState }) {
  const played = result.players.filter((p) => p.answered > 0)
  const podium = [played[1], played[0], played[2]]
  const hardest = result.perQuestion
    .map((q, i) => ({ i, pct: q.answered ? Math.round((q.correct / q.answered) * 100) : null }))
    .filter((x) => x.pct !== null)
    .sort((a, b) => a.pct! - b.pct!)
    .slice(0, 3)
  return (
    <div className="flex flex-col gap-5" data-testid="game-results">
      <div className="rounded-3xl bg-gradient-to-b from-board to-[#2c7a5c] text-white p-6 flex items-end justify-center gap-6">
        {podium.map((p, k) =>
          p ? (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <AvatarArt config={avatarOf(p.avatar)} size={k === 1 ? 7 : 5} label={p.name} />
              <b className="text-lg">{p.name.split(' ')[0]}</b>
              <span className="text-sm opacity-90">
                ถูก {p.correct}/{result.total}
              </span>
              <div className={`w-28 rounded-t-xl flex justify-center pt-2 text-3xl font-extrabold text-amber-950 ${k === 1 ? 'h-36 bg-amber-300' : k === 0 ? 'h-24 bg-stone-300' : 'h-16 bg-[#CD8B4E]'}`}>{[2, 1, 3][k]}</div>
            </div>
          ) : (
            <div key={k} className="w-28" />
          ),
        )}
      </div>
      {hardest.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm">
          <b>ข้อที่ควรอธิบายซ้ำ:</b>
          {hardest.map((h) => (
            <div key={h.i}>
              ข้อ {h.i + 1}. {state.questions[h.i].q || '(โจทย์เป็นรูป)'} — ตอบถูก <b>{h.pct}%</b> (เฉลย {LETTERS[state.questions[h.i].answer]})
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white rounded-xl">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="p-2">ZipGrade ID</th>
              <th className="p-2">ชื่อ</th>
              <th className="p-2">ถูก</th>
              <th className="p-2">ตอบ</th>
              <th className="p-2">EXP</th>
            </tr>
          </thead>
          <tbody>
            {result.players.map((p) => (
              <tr key={p.id} className="border-t border-stone-100">
                <td className="p-2">{state.roster.find((r) => r.id === p.id)?.zipgradeId ?? p.no}</td>
                <td className="p-2">{p.name}</td>
                <td className="p-2 tabular-nums">{p.answered ? `${p.correct}/${result.total}` : '–'}</td>
                <td className="p-2 tabular-nums">{p.answered || 'ไม่ได้เล่น'}</td>
                <td className="p-2 tabular-nums">{p.exp ? `+${p.exp}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.saved && (result.saved.scoreItemId || result.saved.attendanceDate) && (
        <p className="text-sm text-board font-semibold">
          {result.saved.scoreItemId && '✓ บันทึกเป็นคะแนนเก็บแล้ว (ยังไม่เผยแพร่ให้นักเรียน) '}
          {result.saved.attendanceDate && '✓ เช็กชื่อวันนี้แล้ว'}
        </p>
      )}
    </div>
  )
}
