import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import type { StudentVideo } from '../../shared/videos'
import { Card, ErrorBox, Loading } from '../ui'

export default function StudentVideos() {
  const navigate = useNavigate()
  const [items, setItems] = useState<StudentVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<StudentVideo[]>('/api/student/videos')
      .then(setItems)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">คลิปย้อนหลัง</h1>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {!items && !error && <Loading />}
        {items?.length === 0 && <p className="text-sm text-stone-500 text-center py-6">ยังไม่มีคลิป</p>}
        {items?.map((v) => (
          <Link key={v.id} to={`/me/videos/${v.id}`} className="block">
            <Card className="overflow-hidden">
              <div className="relative">
                <img src={`https://i.ytimg.com/vi/${v.youtubeId}/mqdefault.jpg`} alt="" className="w-full aspect-video object-cover bg-stone-200" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-12 h-12 rounded-full bg-black/60 text-white text-xl flex items-center justify-center pl-1">▶</span>
                </span>
              </div>
              <div className="p-3">
                <h3 className="font-bold">{v.title}</h3>
                {v.description && <p className="text-sm text-stone-500 line-clamp-2">{v.description}</p>}
              </div>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  )
}
