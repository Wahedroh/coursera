import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiClientError } from '../api'
import ProtectedYouTube from '../components/ProtectedYouTube'
import type { StudentVideo as Video } from '../../shared/videos'
import { ErrorBox, Loading } from '../ui'
import { EXP_RULES, VIDEO_WATCH_RATIO } from '../../shared/points'

export default function StudentVideo() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [v, setV] = useState<Video | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [got, setGot] = useState<'no' | 'sending' | 'yes'>('no')
  const sent = useRef(false)

  function onWatch(watched: number, duration: number) {
    setPct(Math.min(100, Math.round((watched / duration) * 100)))
    if (!v || v.rewarded || sent.current || watched + 1 < duration * VIDEO_WATCH_RATIO) return
    sent.current = true
    setGot('sending')
    api<{ awarded: boolean }>(`/api/student/videos/${id}/watched`, { body: { watchedSeconds: watched, durationSeconds: duration } })
      .then(() => setGot('yes'))
      .catch(() => {
        sent.current = false
        setGot('no')
      })
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
                    ⭐ ดูถึง {Math.round(VIDEO_WATCH_RATIO * 100)}% รับ <b>+{EXP_RULES.video} EXP</b>
                  </span>
                  <span className="h-2 flex-1 rounded-full bg-stone-200 overflow-hidden">
                    <span className="block h-full bg-amber-400" style={{ width: `${Math.min(100, (pct / (VIDEO_WATCH_RATIO * 100)) * 100)}%` }} />
                  </span>
                  <span className="text-xs text-stone-500 tabular-nums">ดูแล้ว {pct}%</span>
                </>
              )}
            </div>
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
