import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { GameControls, GameResults, useCardGame } from '../components/CardGameParts'
import { qrSvg } from '../components/QrCard'
import { LETTERS, type CardGameResult } from '../../shared/cardgame'
import { ErrorBox, Loading } from '../ui'
import { useTeacherErrorHandler } from './useTeacherGuard'

/** จอหน้าห้อง: คำถาม · ใครตอบแล้ว (ไม่บอกคำตอบจนกว่าเฉลย) · กราฟคำตอบ · ผลเกม */
export default function TeacherCardGameScreen() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [error, setError] = useState<string | null>(null)
  const onError = useCallback((e: unknown) => setError(handle(e)), [handle])
  const { state, reload } = useCardGame(id, onError)
  const [result, setResult] = useState<CardGameResult | null>(null)
  const [showWrong, setShowWrong] = useState(false)

  useEffect(() => {
    if (state?.ended && !result) api<CardGameResult>(`/api/teacher/card-games/${id}/result`).then(setResult).catch(onError)
  }, [state?.ended, result, id, onError])
  useEffect(() => setShowWrong(false), [state?.current])

  if (!state) return error ? <ErrorBox message={error} /> : <Loading />
  const q = state.questions[state.current]
  const answered = state.roster.filter((r) => state.answers[r.id] !== undefined)
  const counts = q.choices.map((_, k) => answered.filter((r) => state.answers[r.id] === k).length)
  const scanUrl = `${location.origin}/teacher/card-games/${id}/scan`
  const qr = qrSvg(scanUrl, 'Byte')

  return (
    <main className="min-h-screen bg-[#16402f] text-white p-4 sm:p-8 flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <Link to="/teacher/card-game" className="text-sm opacity-75">
            ← เกมการ์ด
          </Link>
          <h1 className="text-2xl font-extrabold">
            🃏 {state.quizTitle} · {state.class.name}
          </h1>
        </div>
        {!state.ended && (
          <div className="flex items-center gap-4">
            <span className="text-xl">
              ข้อ <b>{state.current + 1}</b> / {state.questions.length} · สแกนแล้ว{' '}
              <b data-testid="scanned-count">
                {answered.length} / {state.roster.length}
              </b>
            </span>
            <Link to={`/teacher/card-games/${id}/scan`} className="flex items-center gap-2 rounded-xl bg-white text-stone-900 p-1.5 pr-3 text-xs font-bold" title="สแกน QR นี้ด้วยมือถือครู เพื่อเปิดกล้อง">
              <svg viewBox={`0 0 ${qr.n} ${qr.n}`} className="w-16 h-16" shapeRendering="crispEdges" aria-hidden>
                <rect width={qr.n} height={qr.n} fill="#fff" />
                <path d={qr.d} fill="#000" />
              </svg>
              📷 มือถือครู
              <br />
              สแกนเพื่อเปิดกล้อง
            </Link>
          </div>
        )}
      </header>
      <ErrorBox message={error} />
      {state.ended ? (
        result ? (
          <div className="bg-[#FDFBF3] text-stone-900 rounded-3xl p-5">
            <GameResults result={result} state={state} />
          </div>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <div className="rounded-2xl bg-white text-stone-900 p-5 text-2xl sm:text-3xl font-extrabold" data-testid="game-question">
            {q.q}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {q.choices.map((c, k) => {
              const right = state.revealed && k === q.answer
              return (
                <div key={k} className={`rounded-2xl p-4 text-xl font-bold flex gap-3 items-center ${right ? 'bg-green-400 text-green-950' : state.revealed ? 'bg-white/10 opacity-70' : 'bg-white/15'}`}>
                  <span className="w-10 h-10 rounded-xl bg-white/90 text-stone-900 flex items-center justify-center text-2xl font-extrabold shrink-0">{LETTERS[k]}</span>
                  <span className="flex-1">{c}</span>
                  {state.revealed && <span className="text-lg tabular-nums">{counts[k]} คน</span>}
                  {right && '✓'}
                </div>
              )
            })}
          </div>
          {state.revealed ? (
            <div className="rounded-2xl bg-white/10 p-4 flex flex-col gap-2" data-testid="game-reveal">
              {q.choices.map((_, k) => (
                <div key={k} className="flex items-center gap-3">
                  <b className="w-6">{LETTERS[k]}</b>
                  <div className={`h-6 rounded-r-lg ${k === q.answer ? 'bg-green-400' : 'bg-white/40'}`} style={{ width: `${answered.length ? (counts[k] / answered.length) * 100 : 0}%`, minWidth: 4 }} />
                  <span className="tabular-nums">{counts[k]}</span>
                </div>
              ))}
              <p>
                ตอบถูก <b>{counts[q.answer]}</b> / {answered.length} คน{answered.length ? ` (${Math.round((counts[q.answer] / answered.length) * 100)}%)` : ''}
                {' · '}
                <button type="button" className="underline" onClick={() => setShowWrong((v) => !v)}>
                  {showWrong ? 'ซ่อนชื่อ' : 'แสดงชื่อคนที่ตอบผิด'}
                </button>
              </p>
              {showWrong && (
                <p className="text-sm">
                  {answered
                    .filter((r) => state.answers[r.id] !== q.answer)
                    .map((r) => `${r.name.split(' ')[0]} (${LETTERS[state.answers[r.id]]})`)
                    .join(', ') || 'ไม่มี 🎉'}
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }} data-testid="answered-grid">
                {state.roster.map((r) => (
                  <div key={r.id} title={r.name} className={`h-11 rounded-lg flex items-center justify-center font-extrabold ${state.answers[r.id] !== undefined ? 'bg-green-400 text-green-950' : 'bg-white/10 text-white/60'}`}>
                    {r.no}
                  </div>
                ))}
              </div>
              <p className="text-sm opacity-75 mt-2">ช่องเขียว = เลขที่ที่สแกนแล้ว (ยังไม่แสดงว่าตอบอะไรจนกว่าจะเฉลย)</p>
            </div>
          )}
          <GameControls state={state} reload={reload} onError={onError} onEnded={setResult} />
        </>
      )}
    </main>
  )
}
