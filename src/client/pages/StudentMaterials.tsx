import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { fileUrl } from '../lib/upload'
import { fileIcon, fmtSize, groupByTopic } from '../lib/materials'
import type { StudentMaterial } from '../../shared/materials'
import { Card, ErrorBox, Loading } from '../ui'

export default function StudentMaterials() {
  const navigate = useNavigate()
  const [items, setItems] = useState<StudentMaterial[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<StudentMaterial[]>('/api/student/materials')
      .then(setItems)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">เอกสารเรียน</h1>
      </header>
      <section className="p-5 flex flex-col gap-4">
        <ErrorBox message={error} />
        {!items && !error && <Loading />}
        {items?.length === 0 && <p className="text-sm text-stone-500 text-center py-6">ยังไม่มีเอกสาร</p>}
        {items &&
          groupByTopic(items).map(([t, list]) => (
            <div key={t} className="flex flex-col gap-2">
              <h2 className="font-bold text-stone-600">{t}</h2>
              <Card className="divide-y divide-stone-100">
                {list.map((m) => {
                  const icon = fileIcon(m.fileName)
                  return (
                    <a key={m.id} href={fileUrl(m.fileKey)} target="_blank" rel="noreferrer" className="p-3 flex items-center gap-3">
                      <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xs font-extrabold ${icon.cls}`}>{icon.label}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold">{m.title}</span>
                        <span className="block text-xs text-stone-500 truncate">
                          {m.fileName} · {fmtSize(m.size)}
                        </span>
                      </span>
                      <span className="text-board text-sm font-semibold">เปิด</span>
                    </a>
                  )
                })}
              </Card>
            </div>
          ))}
      </section>
    </main>
  )
}
