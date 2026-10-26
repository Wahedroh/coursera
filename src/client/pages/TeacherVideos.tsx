import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import ProtectedYouTube from '../components/ProtectedYouTube'
import { parseYouTubeId, type TeacherVideo } from '../../shared/videos'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

export default function TeacherVideos() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [items, setItems] = useState<TeacherVideo[] | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [className, setClassName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [classIds, setClassIds] = useState<string[]>([id])
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<TeacherVideo[]>(`/api/teacher/classes/${id}/videos`).then(setItems).catch((e) => setError(handle(e)))
  }, [id, handle])
  useEffect(load, [load])
  useEffect(() => {
    setClassIds([id])
    api<School[]>('/api/teacher/classes')
      .then((s) => {
        setSchools(s)
        setClassName(s.flatMap((x) => x.classes).find((c) => c.id === id)?.name ?? '')
      })
      .catch((e) => setError(handle(e)))
  }, [id, handle])

  const urlOk = url.trim() === '' || parseYouTubeId(url) !== null

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { ids } = await api<{ ids: string[] }>('/api/teacher/videos', { body: { title, url, description, classIds } })
      setFlash(`เพิ่มคลิปแล้ว ${ids.length} ห้อง`)
      setTitle('')
      setUrl('')
      setDescription('')
      load()
    } catch (err) {
      setError(handle(err))
    } finally {
      setBusy(false)
    }
  }

  async function act(path: string, method: string, body?: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    try {
      await api(path, { method, body })
      load()
    } catch (e) {
      setError(handle(e))
    }
  }

  const toggle = (cid: string) => setClassIds((xs) => (xs.includes(cid) ? xs.filter((x) => x !== cid) : [...xs, cid]))

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← {className || 'หน้าห้อง'}
      </Link>
      <h1 className="text-2xl font-extrabold">คลิปย้อนหลัง</h1>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      {!items && !error && <Loading />}
      {items?.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีคลิปในห้องนี้</Card>}
      {items && items.length > 0 && (
        <Card className="divide-y divide-stone-100">
          {items.map((v) => (
            <div key={v.id} className="p-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <img src={`https://i.ytimg.com/vi/${v.youtubeId}/mqdefault.jpg`} alt="" className="w-28 aspect-video object-cover rounded-lg bg-stone-200" />
                <div className="flex-1 min-w-40">
                  <div className="font-bold">{v.title}</div>
                  {v.description && <div className="text-xs text-stone-500 line-clamp-2">{v.description}</div>}
                  <div className="mt-1">{v.published ? <Chip tone="green">นักเรียนเห็น</Chip> : <Chip>ซ่อนอยู่</Chip>}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" onClick={() => setEditing(editing === v.id ? null : v.id)}>
                    แก้
                  </button>
                  <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" onClick={() => setPreview(preview === v.id ? null : v.id)}>
                    {preview === v.id ? 'ปิดตัวอย่าง' : 'ดูตัวอย่าง'}
                  </button>
                  <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" onClick={() => act(`/api/teacher/videos/${v.id}/published`, 'PUT', { published: !v.published })}>
                    {v.published ? 'ซ่อน' : 'แสดง'}
                  </button>
                  <button type="button" className="rounded-lg border border-red-200 text-red-700 bg-white px-2 py-1 text-xs font-semibold" onClick={() => act(`/api/teacher/videos/${v.id}`, 'DELETE', undefined, `ลบคลิป "${v.title}"?`)}>
                    ลบ
                  </button>
                </div>
              </div>
              {editing === v.id && (
                <EditVideo
                  video={v}
                  onSave={async (body) => {
                    await act(`/api/teacher/videos/${v.id}`, 'PUT', body)
                    setEditing(null)
                  }}
                />
              )}
              {preview === v.id && <ProtectedYouTube videoId={v.youtubeId} title={v.title} />}
            </div>
          ))}
        </Card>
      )}
      <form onSubmit={create} className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">+ เพิ่มคลิป</h2>
          <label className="text-sm font-semibold">
            ลิงก์ YouTube
            <input
              className={`${input} ${urlOk ? '' : 'border-red-500 bg-red-50'}`}
              required
              placeholder="https://youtu.be/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!urlOk}
            />
            {!urlOk && <span className="text-xs text-red-600">ไม่ใช่ลิงก์คลิป YouTube</span>}
          </label>
          <label className="text-sm font-semibold">
            ชื่อคลิป
            <input className={input} required maxLength={200} placeholder="เช่น ทบทวนบทที่ 3" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="text-sm font-semibold">
            คำอธิบาย (ไม่บังคับ)
            <textarea className={input} rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <p className="text-xs text-stone-500">
            นักเรียนดูได้ในเว็บนี้เท่านั้น (กดออกไป YouTube หรือกดแชร์ไม่ได้) · แนะนำตั้งคลิปใน YouTube เป็น “ไม่เป็นสาธารณะ (Unlisted)” และเปิด “อนุญาตการฝัง”
          </p>
        </Card>
        <Card className="p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold">ให้ห้อง</p>
          {schools.map((s) => (
            <fieldset key={s.schoolId} className="border-t border-stone-100 pt-2">
              <legend className="text-xs text-stone-500">{s.schoolName}</legend>
              {s.classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm py-0.5">
                  <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => toggle(c.id)} aria-label={c.name} />
                  {c.grade !== null ? `ชั้น ${c.grade}` : c.name}
                </label>
              ))}
            </fieldset>
          ))}
          <Button type="submit" disabled={busy || classIds.length === 0 || !urlOk}>
            เพิ่มคลิป
          </Button>
        </Card>
      </form>
    </TeacherLayout>
  )
}

function EditVideo({ video, onSave }: { video: TeacherVideo; onSave: (body: { title: string; url: string; description: string }) => Promise<void> }) {
  const [title, setTitle] = useState(video.title)
  const [url, setUrl] = useState(`https://youtu.be/${video.youtubeId}`)
  const [description, setDescription] = useState(video.description)
  const ok = parseYouTubeId(url) !== null
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ title, url, description })
      }}
    >
      <input aria-label="แก้ชื่อคลิป" className={input} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="แก้ลิงก์ YouTube" className={`${input} ${ok ? '' : 'border-red-500 bg-red-50'}`} required value={url} onChange={(e) => setUrl(e.target.value)} />
      <textarea aria-label="แก้คำอธิบาย" className={input} rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      <Button type="submit" disabled={!ok}>
        บันทึกการแก้ไข
      </Button>
    </form>
  )
}
