import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiClientError } from '../api'
import LiveResults from '../components/LiveResults'
import { KIND_LABEL, OPTION_COLORS, OPTION_SYMBOLS, type MyLiveAnswer, type StudentLiveState } from '../../shared/live'
import { useCountdown, useLive } from '../lib/useLive'
import { Button, Card, ErrorBox, Loading } from '../ui'

type Full = StudentLiveState & { mine: MyLiveAnswer }

export default function StudentLive() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState<MyLiveAnswer>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const onError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiClientError && e.status === 401) navigate(`/?next=/live/${id}`, { replace: true })
      else setError(e instanceof ApiClientError ? e.message : 'เชื่อมต่อไม่ได้')
    },
    [id, navigate],
  )
  const load = useCallback(async () => {
    const s = await api<Full>(`/api/student/live/${id}`)
    setMine(s.mine)
    return s
  }, [id])
  const { state, offset } = useLive<StudentLiveState>(id, load, onError)
  const cur = state?.current
  const left = useCountdown(cur?.activity.deadline ?? null, offset)

  // state ที่ push มาไม่มีคำตอบของเรา: ดึงใหม่เมื่อเปลี่ยนกิจกรรมหรือครูเปิดเฉลย
  const activityId = cur?.activity.id
  const shown = cur?.activity.showResults
  useEffect(() => {
    if (!activityId) return
    setText('')
    api<Full>(`/api/student/live/${id}`)
      .then((s) => setMine(s.mine))
      .catch(() => {})
  }, [id, activityId, shown])

  async function send(answer: unknown) {
    if (!cur) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/student/live/${id}/answer`, { body: answer })
      setMine({ activityId: cur.activity.id, answer: answer as Record<string, unknown>, correct: null })
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'already_answered') load().catch(() => {})
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!state) return error ? <ErrorBox message={error} /> : <Loading />
  const answered = mine && cur && mine.activityId === cur.activity.id ? mine : null
  const open = cur?.activity.accepting && (left === null || left > 0)

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">🔴 {state.session.title}</h1>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {state.session.status === 'ended' ? (
          <Card className="p-6 text-center">
            <p className="text-2xl font-extrabold">🎉 จบไลฟ์แล้ว</p>
            <Link to="/me/progress" className="text-board underline text-sm">
              ดู EXP ของฉัน
            </Link>
          </Card>
        ) : !cur ? (
          <Card className="p-6 text-center text-stone-500">รอครูเปิดกิจกรรม…</Card>
        ) : (
          <>
            <div className="flex justify-between text-sm text-stone-500">
              <span>{KIND_LABEL[cur.activity.kind]}</span>
              {left !== null && open && <b className="text-red-600 tabular-nums">เหลือ {left} วิ</b>}
            </div>
            <h2 className="text-2xl font-extrabold" data-testid="live-prompt">
              {cur.activity.prompt}
            </h2>
            {answered ? (
              <Card className={`p-4 text-center ${answered.correct === true ? 'bg-board-soft border-green-200' : answered.correct === false ? 'bg-red-50 border-red-200' : ''}`} >
                <p className="font-bold" data-testid="live-answered">
                  {answered.correct === true ? '✓ ถูกต้อง! +3 EXP' : answered.correct === false ? '✗ ยังไม่ถูก +1 EXP' : '✓ ส่งคำตอบแล้ว +1 EXP'}
                </p>
                <p className="text-sm text-stone-500">{describe(answered.answer, cur.activity.options)}</p>
              </Card>
            ) : !open ? (
              <Card className="p-4 text-center text-stone-500">ปิดรับคำตอบแล้ว</Card>
            ) : cur.activity.options ? (
              <div className="grid gap-2">
                {cur.activity.options.map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => send({ choice: i })}
                    className="rounded-2xl p-4 text-left text-lg font-bold text-white flex items-center gap-3 disabled:opacity-60"
                    style={{ background: OPTION_COLORS[i] }}
                  >
                    <span aria-hidden>{OPTION_SYMBOLS[i]}</span>
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  send(cur.activity.kind === 'wordcloud' ? { word: text } : { text })
                }}
                className="flex flex-col gap-2"
              >
                <input
                  aria-label="คำตอบ"
                  className="border-2 border-line rounded-xl px-3 py-3 bg-white text-lg"
                  maxLength={cur.activity.kind === 'wordcloud' ? 30 : 200}
                  required
                  placeholder={cur.activity.kind === 'wordcloud' ? 'พิมพ์คำสั้น ๆ' : 'พิมพ์คำตอบ'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <Button type="submit" disabled={busy || !text.trim()}>
                  ส่งคำตอบ
                </Button>
              </form>
            )}
            {cur.results && (
              <Card className="p-4">
                <LiveResults results={cur.results} options={cur.activity.options} />
              </Card>
            )}
            <p className="text-xs text-stone-500 text-center">ตอบแล้ว {cur.responseCount} คน</p>
          </>
        )}
      </section>
    </main>
  )
}

function describe(a: Record<string, unknown>, options?: string[]): string {
  if (typeof a.choice === 'number') return `คุณเลือก: ${options?.[a.choice] ?? ''}`
  return `คำตอบ: ${String(a.word ?? a.text ?? '')}`
}
