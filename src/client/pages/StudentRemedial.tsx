import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiClientError } from '../api'
import { formatDue } from '../lib/format'
import { resizeImage } from '../lib/image'
import { fileUrl, uploadImage } from '../lib/upload'
import { REMEDIAL_STATUS_LABEL, RISK_DESC, type RemedialItem } from '../../shared/remedial'
import Icon from '../components/Icon'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'

const TONE = { assigned: 'amber', submitted: 'blue', returned: 'purple', passed: 'green' } as const

/** งานซ่อมเฉพาะคน: อ่านโจทย์ · พิมพ์คำตอบ/แนบรูป · ส่ง */
export default function StudentRemedial() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [r, setR] = useState<RemedialItem | null>(null)
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<RemedialItem>(`/api/student/remedials/${id}`)
      .then((x) => {
        setR(x)
        setText(x.text)
        setImages(x.imageKeys)
      })
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [id, navigate])

  async function add(files: FileList | null) {
    if (!files?.length) return
    setBusy('กำลังอัปโหลดรูป…')
    setError(null)
    try {
      for (const f of Array.from(files).slice(0, 10 - images.length)) {
        const key = await uploadImage(await resizeImage(f), 'submission')
        setImages((x) => [...x, key])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function submit() {
    setBusy('กำลังส่ง…')
    setError(null)
    try {
      setR(await api<RemedialItem>(`/api/student/remedials/${id}/submission`, { method: 'PUT', body: { text, imageKeys: images } }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const editable = r && r.status !== 'passed'
  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">
          <Icon n="edit" /> งานซ่อม{r ? `: ${r.title}` : ''}
        </h1>
        {r && <p className="text-sm opacity-90">ซ่อมเรื่อง{RISK_DESC[r.reason]} · {formatDue(r.dueAt)}</p>}
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {!r && !error && <Loading />}
        {r && (
          <>
            <div className="flex items-center gap-2">
              <Chip tone={TONE[r.status]}>{REMEDIAL_STATUS_LABEL[r.status]}</Chip>
              {r.resultGrade && <Chip tone="green">ผลหลังซ่อม {r.resultGrade}</Chip>}
            </div>
            {r.comment && (
              <Card className="p-3 text-sm border-violet-200 bg-violet-50">
                <b>ครู:</b> {r.comment}
              </Card>
            )}
            {r.instructions && (
              <Card className="p-3 text-sm whitespace-pre-wrap">
                <b className="block mb-1">สิ่งที่ต้องทำ</b>
                {r.instructions}
              </Card>
            )}
            <label className="text-sm font-semibold">
              คำตอบ
              <textarea aria-label="คำตอบงานซ่อม" className="w-full rounded-xl border-2 border-line bg-white px-3 py-2" rows={4} value={text} disabled={!editable} onChange={(e) => setText(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              {images.map((k) => (
                <div key={k} className="relative">
                  <img src={fileUrl(k)} alt="รูปที่แนบ" className="h-20 w-20 rounded-lg object-cover border border-line" />
                  {editable && (
                    <button type="button" aria-label="ลบรูป" onClick={() => setImages((x) => x.filter((y) => y !== k))} className="absolute -top-2 -right-2 rounded-full bg-red-600 text-white w-6 h-6 text-xs">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {editable && images.length < 10 && (
                <label className="h-20 w-20 rounded-lg border-2 border-dashed border-line flex flex-col items-center justify-center text-xs cursor-pointer bg-white">
                  <Icon n="camera" className="text-2xl" />
                  แนบรูป
                  <input type="file" accept="image/*" multiple className="sr-only" aria-label="แนบรูปงานซ่อม" onChange={(e) => void add(e.target.files)} />
                </label>
              )}
            </div>
            {editable && (
              <Button onClick={submit} disabled={!!busy || (!text.trim() && !images.length)}>
                {busy ?? (r.status === 'assigned' ? 'ส่งงานซ่อม' : 'ส่งอีกครั้ง')}
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  )
}
