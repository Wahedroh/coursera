import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, ApiClientError } from '../api'
import { fileUrl } from '../lib/upload'
import { fileIcon, fmtSize, groupByDate, groupByTopic } from '../lib/materials'
import { MATERIAL_KIND_LABEL, splitMaterials, type MaterialKind, type StudentMaterial } from '../../shared/materials'
import { Card, ErrorBox, Loading } from '../ui'

export default function StudentMaterials() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: MaterialKind = params.get('tab') === 'notes' ? 'notes' : 'blank'
  const [items, setItems] = useState<StudentMaterial[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<StudentMaterial[]>('/api/student/materials')
      .then(setItems)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])

  const split = items ? splitMaterials(items) : null
  const list = split?.[tab] ?? []
  const groups = tab === 'notes' ? groupByDate(list) : groupByTopic(list)

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">เอกสารเรียน</h1>
      </header>
      <section className="p-5 flex flex-col gap-4">
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
          {(['blank', 'notes'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => setParams(k === 'notes' ? { tab: 'notes' } : {}, { replace: true })}
              className={`rounded-lg px-2 py-2 text-sm font-semibold ${tab === k ? 'bg-white shadow-sm text-board' : 'text-stone-500'}`}
            >
              {k === 'blank' ? '📄 ' : '📒 '}
              {MATERIAL_KIND_LABEL[k]}
              {split && <span className="ml-1 text-xs opacity-70">({split[k].length})</span>}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500 -mt-2">
          {tab === 'blank' ? 'ใบงาน/ใบความรู้ฉบับเปล่า ไว้ปริ้นหรือเขียนตาม' : 'เอกสารที่ครูเขียน/จดระหว่างสอน เรียงตามวันที่เรียน — ขาดเรียนวันไหนดูย้อนหลังได้'}
        </p>
        <ErrorBox message={error} />
        {!items && !error && <Loading />}
        {items && list.length === 0 && <p className="text-sm text-stone-500 text-center py-6">{tab === 'notes' ? 'ยังไม่มีเอกสารที่จดในห้อง' : 'ยังไม่มีเอกสาร'}</p>}
        {groups.map(([g, rows]) => (
          <div key={g} className="flex flex-col gap-2">
            <h2 className="font-bold text-stone-600">{g}</h2>
            <Card className="divide-y divide-stone-100">
              {rows.map((m) => {
                const icon = fileIcon(m.fileName)
                return (
                  <a key={m.id} href={fileUrl(m.fileKey)} target="_blank" rel="noreferrer" className="p-3 flex items-center gap-3">
                    <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xs font-extrabold ${icon.cls}`}>{icon.label}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold">{m.title}</span>
                      <span className="block text-xs text-stone-500 truncate">
                        {tab === 'notes' && m.topic ? `${m.topic} · ` : ''}
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
