import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiClientError } from '../api'
import ProtectedYouTube from '../components/ProtectedYouTube'
import type { StudentVideo as Video } from '../../shared/videos'
import { ErrorBox, Loading } from '../ui'

export default function StudentVideo() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [v, setV] = useState<Video | null>(null)
  const [error, setError] = useState<string | null>(null)

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
            <ProtectedYouTube videoId={v.youtubeId} title={v.title} />
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
