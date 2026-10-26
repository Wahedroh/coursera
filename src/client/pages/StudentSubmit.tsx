import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiClientError } from '../api'
import type { StudentAssignment } from '../../shared/assignments'
import { formatDue } from '../lib/format'
import { resizeImage } from '../lib/image'
import { fileUrl, uploadImage } from '../lib/upload'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'

const MAX_IMAGES = 10
type Pending = { id: string; preview: string; key?: string; error?: string }

function storage<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export default function StudentSubmit() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const draftKey = `draft:${id}`
  const [a, setA] = useState<StudentAssignment | null>(null)
  const [text, setText] = useState('')
  const [images, setImages] = useState<Pending[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<StudentAssignment>(`/api/student/assignments/${id}`)
      .then((x) => {
        setA(x)
        const draft = storage(() => localStorage.getItem(draftKey), null)
        setText(draft ?? x.submission?.text ?? '')
        setImages((x.submission?.imageKeys ?? []).map((key) => ({ id: key, preview: fileUrl(key), key })))
      })
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [id, draftKey, navigate])

  function updateText(v: string) {
    setText(v)
    storage(() => localStorage.setItem(draftKey, v), undefined)
  }

  async function addFiles(files: FileList | null) {
    if (!files) return
    const room = MAX_IMAGES - images.length
    for (const file of [...files].slice(0, room)) {
      const pid = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      setImages((xs) => [...xs, { id: pid, preview }])
      try {
        const key = await uploadImage(await resizeImage(file), 'submission')
        setImages((xs) => xs.map((x) => (x.id === pid ? { ...x, key } : x)))
      } catch (e) {
        const msg = e instanceof ApiClientError ? e.message : 'อัปโหลดไม่สำเร็จ'
        setImages((xs) => xs.map((x) => (x.id === pid ? { ...x, error: msg } : x)))
      }
    }
  }

  async function submit() {
    if (!a) return
    setBusy(true)
    setError(null)
    try {
      const next = await api<StudentAssignment>(`/api/student/assignments/${id}/submission`, {
        method: 'PUT',
        body: { text, imageKeys: images.flatMap((x) => (x.key ? [x.key] : [])), clientRequestId: crypto.randomUUID() },
      })
      storage(() => localStorage.removeItem(draftKey), undefined)
      setA(next)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'ส่งไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  if (!a) return error ? <ErrorBox message={error} /> : <Loading />
  const graded = a.status === 'graded'
  const uploading = images.some((x) => !x.key && !x.error)

  return (
    <main className="min-h-screen max-w-md mx-auto p-5 flex flex-col gap-3 pb-28">
      <Link to="/me" className="text-sm text-stone-500">
        ← งานของฉัน
      </Link>
      <h1 className="text-xl font-extrabold">{a.title}</h1>
      <div className="flex flex-wrap gap-2">
        <Chip tone={a.dueAt !== null && a.dueAt < Date.now() && a.status === 'missing' ? 'amber' : 'gray'}>{formatDue(a.dueAt)}</Chip>
        <Chip>{a.maxScore} คะแนน</Chip>
      </div>
      {a.instructions && (
        <Card className="p-4">
          <p className="text-xs font-semibold text-stone-500 mb-1">คำสั่งจากครู</p>
          <p className="text-sm whitespace-pre-wrap">{a.instructions}</p>
          {a.attachmentKeys.map((k, i) => (
            <img key={k} src={fileUrl(k)} alt={`รูปประกอบ ${i + 1}`} className="mt-2 rounded-xl border border-line" />
          ))}
        </Card>
      )}

      {graded && a.submission && (
        <Card className="p-4 bg-board-soft border-green-200 flex flex-col gap-2">
          <p className="text-sm text-board font-semibold">ครูตรวจแล้ว</p>
          <p className="text-3xl font-extrabold text-board">
            {a.submission.score}/{a.maxScore}
          </p>
          {a.submission.comment && <p className="text-sm">“{a.submission.comment}”</p>}
          {a.submission.annotatedKeys.map((k, i) => (
            <img key={k} src={fileUrl(k)} alt={`รูปที่ครูตรวจ ${i + 1}`} className="rounded-xl border border-line" />
          ))}
        </Card>
      )}
      {a.status === 'returned' && (
        <Card className="p-4 bg-violet-50 border-violet-200">
          <p className="text-sm font-semibold text-violet-700">ครูส่งกลับให้แก้</p>
          {a.submission?.comment && <p className="text-sm text-violet-700">“{a.submission.comment}”</p>}
        </Card>
      )}
      {(a.status === 'submitted' || a.status === 'late') && (
        <Card className="p-3 bg-board-soft border-green-200">
          <p className="text-sm font-semibold text-board">{a.status === 'late' ? 'ส่งแล้ว (สาย) รอครูตรวจ' : 'ส่งแล้ว รอครูตรวจ'}</p>
          <p className="text-xs text-stone-500">แก้ไขและส่งใหม่ได้จนกว่าครูจะตรวจ</p>
        </Card>
      )}

      {a.submitMode !== 'text' && (
        <div>
          <p className="text-xs font-semibold text-stone-500 mb-1">
            รูปงาน ({images.length}/{MAX_IMAGES})
          </p>
          <div className="flex flex-wrap gap-2">
            {images.map((x, i) => (
              <div key={x.id} className="relative w-24 h-28">
                <img src={x.preview} alt={`รูปงาน ${i + 1}`} className="w-full h-full object-cover rounded-xl border border-line" />
                {!x.key && !x.error && <span className="absolute inset-0 rounded-xl bg-black/50 text-white text-xs font-bold flex items-center justify-center">กำลังอัปโหลด…</span>}
                {x.error && <span className="absolute inset-0 rounded-xl bg-red-600/80 text-white text-xs p-1 flex items-center justify-center text-center">{x.error}</span>}
                {!graded && (
                  <button type="button" aria-label={`ลบรูปงาน ${i + 1}`} onClick={() => setImages(images.filter((y) => y.id !== x.id))} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-line text-xs">
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!graded && images.length < MAX_IMAGES && (
              <label className="w-24 h-28 rounded-xl border-2 border-dashed border-line bg-white flex flex-col items-center justify-center text-xs font-semibold text-stone-500 cursor-pointer">
                <span className="text-2xl" aria-hidden>
                  📷
                </span>
                ถ่าย/เลือกรูป
                <input type="file" accept="image/*" multiple aria-label="เพิ่มรูปงาน" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
              </label>
            )}
          </div>
        </div>
      )}
      {a.submitMode !== 'image' && (
        <div>
          <label htmlFor="text" className="text-xs font-semibold text-stone-500">
            ข้อความ{a.submitMode === 'both' ? ' (ไม่บังคับ)' : ''}
          </label>
          <textarea
            id="text"
            value={text}
            disabled={graded}
            onChange={(e) => updateText(e.target.value)}
            rows={4}
            className="w-full border-2 border-line rounded-2xl px-3 py-2 bg-white mt-1"
          />
        </div>
      )}
      <ErrorBox message={error} />
      {!graded && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-paper/95 border-t border-line">
          <div className="max-w-md mx-auto">
            <Button onClick={submit} disabled={busy || uploading} className="w-full text-lg">
              {uploading ? 'รออัปโหลดรูป…' : a.status === 'missing' ? 'ส่งงาน' : 'ส่งงานอีกครั้ง'}
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
