import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import ProtectedYouTube from '../components/ProtectedYouTube'
import { parseYouTubeId, type TeacherVideo, type VideoQuestion, type VideoViewers } from '../../shared/videos'
import { VIDEO_WATCH_RATIO } from '../../shared/points'
import VideoQuestionsEditor from '../components/VideoQuestionsEditor'
import PublishPicker, { PUBLISH_NOW, publishBody, publishValid, ScheduleChip, type PublishValue } from '../components/PublishPicker'
import CopyButton from '../components/CopyDialog'
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
  const [viewers, setViewers] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<VideoQuestion[]>([])
  const [classIds, setClassIds] = useState<string[]>([id])
  const [busy, setBusy] = useState(false)
  const [pub, setPub] = useState<PublishValue>(PUBLISH_NOW)

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
      const { ids } = await api<{ ids: string[] }>('/api/teacher/videos', { body: { title, url, description, questions, classIds, ...publishBody(pub) } })
      setFlash(`เพิ่มคลิปแล้ว ${ids.length} ห้อง${pub.mode === 'now' ? '' : ' · ตั้งเวลาเผยแพร่แล้ว'}`)
      setTitle('')
      setUrl('')
      setDescription('')
      setQuestions([])
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
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.published ? <Chip tone="green">นักเรียนเห็น</Chip> : v.publishAt ? <ScheduleChip published={false} publishAt={v.publishAt} /> : <Chip>ซ่อนอยู่</Chip>}
                    {v.questions.length > 0 && <Chip tone="purple">คำถามท้ายคลิป {v.questions.length} ข้อ</Chip>}
                    <button
                      type="button"
                      onClick={() => setViewers(viewers === v.id ? null : v.id)}
                      aria-expanded={viewers === v.id}
                      className="rounded-full bg-blue-50 text-blue-800 px-2 py-0.5 text-xs font-bold"
                      title="ดูรายชื่อนักเรียนที่ดูคลิปนี้"
                    >
                      👀 ดูแล้ว {v.views.done}/{v.views.total} คน{v.views.started > v.views.done ? ` · กำลังดู ${v.views.started - v.views.done}` : ''}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <CopyButton type="video" id={v.id} title={v.title} fromClass={id} onCopied={setFlash} />
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
              {viewers === v.id && <ViewerList videoId={v.id} />}
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
          <VideoQuestionsEditor value={questions} onChange={setQuestions} allowImage />
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
          <div className="border-t border-stone-100 pt-2">
            <PublishPicker value={pub} onChange={setPub} allowDraft={false} />
          </div>
          <Button type="submit" disabled={busy || classIds.length === 0 || !urlOk || !publishValid(pub)}>
            เพิ่มคลิป
          </Button>
        </Card>
      </form>
    </TeacherLayout>
  )
}

const seen = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** รายชื่อนักเรียนกับเปอร์เซ็นต์ที่ดูคลิป (สูงสุดที่เคยดู) */
function ViewerList({ videoId }: { videoId: string }) {
  const [d, setD] = useState<VideoViewers | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api<VideoViewers>(`/api/teacher/videos/${videoId}/viewers`)
      .then(setD)
      .catch((e) => setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'))
  }, [videoId])
  if (err) return <ErrorBox message={err} />
  if (!d) return <Loading />
  const goal = Math.round(VIDEO_WATCH_RATIO * 100)
  return (
    <div className="mt-2 rounded-xl border border-line bg-stone-50 p-3" data-testid="video-viewers">
      <p className="text-sm pb-2">
        ดูครบ (≥{goal}%) <b>{d.done}</b> · เริ่มดูแล้ว <b>{d.started}</b> · ยังไม่ดู <b>{d.total - d.started}</b> จาก {d.total} คน
      </p>
      {d.quiz && (
        <div className="mb-3 rounded-lg bg-white border border-line p-2.5 text-sm" data-testid="video-quiz-summary">
          <b>📝 คำถามท้ายคลิป</b> · ตอบแล้ว <b>{d.quiz.answered}</b> คน · ถูกครบ {d.quiz.total} ข้อ <b>{d.quiz.passed}</b> คน
          <ul className="flex flex-col gap-1.5 pt-1.5">
            {d.quiz.questions.map((q, i) => {
              const pct = q.answered ? Math.round((q.correct / q.answered) * 100) : 0
              const wrong = q.counts.map((n, k) => ({ n, k })).filter((x) => x.k !== q.answer && x.n > 0).sort((a, b) => b.n - a.n)[0]
              return (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-48 truncate" title={q.q}>
                    {i + 1}. {q.q || (q.hasImage ? '(โจทย์เป็นรูป)' : '')}
                  </span>
                  <span className="h-2 flex-1 min-w-16 rounded-full bg-stone-200 overflow-hidden">
                    <span className={`block h-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-xs tabular-nums">
                    ถูก <b>{q.correct}</b>/{q.answered} ({pct}%)
                  </span>
                  {wrong && (
                    <span className="text-xs text-red-700">
                      ตอบผิดบ่อย: {['ก', 'ข', 'ค', 'ง'][wrong.k]}
                      {q.choices[wrong.k] ? ` “${q.choices[wrong.k]}”` : ''} {wrong.n} คน
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] text-stone-500 pt-1">นับจากคำตอบครั้งล่าสุดของแต่ละคน · คนที่ได้ EXP ก่อนเริ่มเก็บผลนับว่าถูกครบ (ไม่รู้ว่าตอบข้อละอะไร)</p>
        </div>
      )}
      <ul className="grid gap-1 sm:grid-cols-2">
        {d.viewers.map((x) => {
          const pct = x.percent ?? (x.rewarded ? goal : null)
          return (
            <li key={x.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right text-xs text-stone-400 tabular-nums">{x.no}</span>
              <span className="w-36 truncate" title={x.name}>
                {x.nickname ? <b>{x.nickname}</b> : x.name}
                {x.nickname && <span className="text-xs text-stone-500"> ({x.name.split(' ')[0]})</span>}
              </span>
              {pct === null ? (
                <span className="text-xs text-stone-400">ยังไม่ดู</span>
              ) : (
                <>
                  <span className="h-2 flex-1 min-w-12 rounded-full bg-stone-200 overflow-hidden">
                    <span className={`block h-full ${pct >= goal ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums font-bold">{x.percent === null ? `≥${goal}%` : `${pct}%`}</span>
                  {x.rewarded && <span title="ได้ EXP แล้ว">⭐</span>}
                </>
              )}
              {d.quiz && x.quiz && (
                <span
                  className={`rounded-full px-1.5 text-[11px] font-bold whitespace-nowrap ${x.quiz.best === d.quiz.total ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}
                  title={`ตอบ ${x.quiz.attempts} ครั้ง · ถูกมากสุด ${x.quiz.best}/${d.quiz.total} · ครั้งล่าสุด ${x.quiz.last}/${d.quiz.total}`}
                >
                  📝 {x.quiz.best}/{d.quiz.total}
                  {x.quiz.attempts > 1 ? ` · ${x.quiz.attempts} ครั้ง` : ''}
                </span>
              )}
              {x.updatedAt && <span className="hidden lg:inline text-[11px] text-stone-400">{seen.format(x.updatedAt)}</span>}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-stone-500 pt-2">
        เปอร์เซ็นต์ = ส่วนของคลิปที่ดูจริงสูงสุดในครั้งเดียว (ไม่นับช่วงที่กดข้าม) · ⭐ = ได้ EXP แล้ว (ดูถึง {goal}%{' '}และตอบคำถามถูก ถ้ามี){d.quiz ? ' · 📝 = ข้อที่ตอบถูกมากสุด · จำนวนครั้งที่ตอบ' : ''}
      </p>
    </div>
  )
}

function EditVideo({ video, onSave }: { video: TeacherVideo; onSave: (body: { title: string; url: string; description: string; questions: VideoQuestion[] }) => Promise<void> }) {
  const [title, setTitle] = useState(video.title)
  const [questions, setQuestions] = useState<VideoQuestion[]>(video.questions)
  const [url, setUrl] = useState(`https://youtu.be/${video.youtubeId}`)
  const [description, setDescription] = useState(video.description)
  const ok = parseYouTubeId(url) !== null
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ title, url, description, questions })
      }}
    >
      <input aria-label="แก้ชื่อคลิป" className={input} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="แก้ลิงก์ YouTube" className={`${input} ${ok ? '' : 'border-red-500 bg-red-50'}`} required value={url} onChange={(e) => setUrl(e.target.value)} />
      <textarea aria-label="แก้คำอธิบาย" className={input} rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      <VideoQuestionsEditor value={questions} onChange={setQuestions} allowImage />
      <Button type="submit" disabled={!ok}>
        บันทึกการแก้ไข
      </Button>
    </form>
  )
}
