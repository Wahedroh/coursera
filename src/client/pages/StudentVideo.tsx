import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { fileUrl } from '../lib/upload'
import { api, ApiClientError } from '../api'
import ProtectedYouTube from '../components/ProtectedYouTube'
import type { StudentVideo as Video, VideoWatchResult } from '../../shared/videos'
import { ErrorBox, Loading } from '../ui'
import { EXP_RULES, VIDEO_WATCH_RATIO } from '../../shared/points'
import Icon from '../components/Icon'

export default function StudentVideo() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [v, setV] = useState<Video | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [got, setGot] = useState<'no' | 'sending' | 'quiz' | 'yes'>('no')
  const sent = useRef(false)
  // วินาทีที่ดูแล้ว (ใช้ส่งพร้อมคำตอบ)
  const watch = useRef({ watched: 0, duration: 1 })
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [quizMsg, setQuizMsg] = useState<string | null>(null)

  function send(body: { watchedSeconds: number; durationSeconds: number; answers?: number[] }) {
    return api<VideoWatchResult>(`/api/student/videos/${id}/watched`, { body })
  }

  // ส่งความคืบหน้าให้ครูเห็น: ทุก ๆ +5% และตอนออกจากหน้า (เก็บเปอร์เซ็นต์สูงสุดที่เคยดู)
  const lastSent = useRef(0)
  const inFlight = useRef(false)
  function sendProgress(keepalive = false) {
    const { watched, duration } = watch.current
    const p = Math.min(100, Math.round((watched / duration) * 100))
    if (duration <= 1 || p <= lastSent.current) return
    if (keepalive) {
      lastSent.current = p
      void fetch(`/api/student/videos/${id}/progress`, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ watchedSeconds: watched, durationSeconds: duration }) }).catch(() => {})
      return
    }
    if (inFlight.current) return
    inFlight.current = true
    api(`/api/student/videos/${id}/progress`, { body: { watchedSeconds: watched, durationSeconds: duration } })
      .then(() => {
        lastSent.current = Math.max(lastSent.current, p)
      })
      .catch(() => {})
      .finally(() => {
        inFlight.current = false
      })
  }
  useEffect(() => {
    const leave = () => sendProgress(true)
    const hidden = () => document.visibilityState === 'hidden' && leave()
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', hidden)
      leave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function onWatch(watched: number, duration: number) {
    setPct(Math.min(100, Math.round((watched / duration) * 100)))
    watch.current = { watched: Math.max(watch.current.watched, watched), duration }
    const p = Math.min(100, Math.round((watch.current.watched / duration) * 100))
    if (p >= lastSent.current + 5 || (p === 100 && lastSent.current < 100)) sendProgress()
    if (!v || v.rewarded || sent.current || watched + 1 < duration * VIDEO_WATCH_RATIO) return
    sent.current = true
    // มีคำถามท้ายคลิป: ดูครบแล้วให้ตอบคำถามก่อน
    if (v.quiz.length) {
      setAnswers(v.quiz.map(() => null))
      setGot('quiz')
      return
    }
    setGot('sending')
    send({ watchedSeconds: watched, durationSeconds: duration })
      .then(() => setGot('yes'))
      .catch(() => {
        sent.current = false
        setGot('no')
      })
  }

  async function submitQuiz(e: React.FormEvent) {
    e.preventDefault()
    setQuizMsg(null)
    try {
      const r = await send({ watchedSeconds: watch.current.watched, durationSeconds: watch.current.duration, answers: answers.map((a) => a ?? 0) })
      if (r.awarded || r.correct === r.total) setGot('yes')
      else setQuizMsg(`ถูก ${r.correct}/${r.total} ข้อ — ลองทบทวนแล้วตอบใหม่อีกครั้งนะ`)
    } catch (err) {
      setQuizMsg(err instanceof ApiClientError ? err.message : 'ส่งคำตอบไม่สำเร็จ')
    }
  }

  useEffect(() => {
    api<Video>(`/api/student/videos/${id}`)
      .then(setV)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate(`/?next=/me/videos/${id}`, { replace: true }) : setError(e.message)))
  }, [id, navigate])

  return (
    <main className="min-h-screen max-w-3xl mx-auto pb-8">
      <header className="px-5 pt-5 pb-3">
        <Link to="/me/videos" className="text-sm text-stone-500">
          ← คลิปทั้งหมด
        </Link>
      </header>
      <section className="px-3 sm:px-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {!v && !error && <Loading />}
        {v && (
          <>
            <ProtectedYouTube videoId={v.youtubeId} title={v.title} onWatch={onWatch} />
            <div className="mx-2 rounded-xl bg-white border border-line px-3 py-2 text-sm flex items-center gap-3" data-testid="watch-reward">
              {v.rewarded || got === 'yes' ? (
                <span className="font-semibold text-board">✓ ทบทวนคลิปนี้แล้ว ได้ +{EXP_RULES.video} EXP</span>
              ) : (
                <>
                  <span className="whitespace-nowrap">
                    ⭐ ดูถึง {Math.round(VIDEO_WATCH_RATIO * 100)}%{v.quiz.length > 0 && ` + ตอบ ${v.quiz.length} ข้อ`} รับ <b>+{EXP_RULES.video} EXP</b>
                  </span>
                  <span className="h-2 flex-1 rounded-full bg-stone-200 overflow-hidden">
                    <span className="block h-full bg-amber-400" style={{ width: `${Math.min(100, (pct / (VIDEO_WATCH_RATIO * 100)) * 100)}%` }} />
                  </span>
                  <span className="text-xs text-stone-500 tabular-nums">ดูแล้ว {pct}%</span>
                </>
              )}
            </div>
            {got === 'quiz' && !v.rewarded && (
              <form onSubmit={submitQuiz} className="mx-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 flex flex-col gap-3" data-testid="video-quiz">
                <b><Icon n="task" /> คำถามท้ายคลิป — ตอบถูกทุกข้อรับ +{EXP_RULES.video} EXP</b>
                {v.quiz.map((q, i) => (
                  <fieldset key={i} className="flex flex-col gap-1">
                    <legend className="font-semibold text-sm mb-1">
                      {i + 1}. {q.q}
                    </legend>
                    {q.image && (
                      <a href={fileUrl(q.image)} target="_blank" rel="noreferrer" className="block mb-1">
                        <img src={fileUrl(q.image)} alt={`รูปคำถามข้อ ${i + 1}`} className="w-full max-h-80 object-contain rounded-xl border border-line bg-white" />
                      </a>
                    )}
                    {q.choices.map((c, k) => (
                      <label key={k} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm bg-white ${answers[i] === k ? 'border-board ring-2 ring-board/20' : 'border-line'}`}>
                        <input type="radio" name={`q-${i}`} checked={answers[i] === k} onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))} />
                        <b className="w-4 text-stone-500">{['ก', 'ข', 'ค', 'ง'][k]}</b>
                        {c}
                      </label>
                    ))}
                  </fieldset>
                ))}
                {quizMsg && <p className="text-sm font-semibold text-red-700">{quizMsg}</p>}
                <button type="submit" disabled={answers.some((a) => a === null)} className="rounded-xl bg-amber-400 text-amber-950 px-3 py-2 font-bold disabled:opacity-50">
                  ส่งคำตอบ
                </button>
              </form>
            )}
            <h1 className="text-xl font-extrabold px-2" data-testid="video-title">
              {v.title}
            </h1>
            {v.description && <p className="text-sm text-stone-600 whitespace-pre-line px-2">{v.description}</p>}
          </>
        )}
      </section>
    </main>
  )
}
