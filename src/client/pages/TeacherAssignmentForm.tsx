import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../api'
import type { SubmitMode } from '../../shared/assignments'
import { epochToLocal, localToEpoch } from '../lib/format'
import { resizeImage } from '../lib/image'
import { fileUrl, uploadImage } from '../lib/upload'
import { Button, Card, ErrorBox } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
type Existing = { classId: string; title: string; instructions: string; attachmentKeys: string[]; dueAt: number | null; maxScore: number; submitMode: SubmitMode }

const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'

export default function TeacherAssignmentForm() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const handle = useTeacherErrorHandler()
  const [schools, setSchools] = useState<School[]>([])
  const [classIds, setClassIds] = useState<string[]>(search.get('classId') ? [search.get('classId')!] : [])
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [attachmentKeys, setAttachmentKeys] = useState<string[]>([])
  const [due, setDue] = useState('')
  const [maxScore, setMaxScore] = useState('10')
  const [submitMode, setSubmitMode] = useState<SubmitMode>('both')
  const [existingClass, setExistingClass] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<School[]>('/api/teacher/classes').then(setSchools).catch((e) => setError(handle(e)))
    if (id)
      api<Existing>(`/api/teacher/assignments/${id}`)
        .then((a) => {
          setExistingClass(a.classId)
          setTitle(a.title)
          setInstructions(a.instructions)
          setAttachmentKeys(a.attachmentKeys)
          setDue(epochToLocal(a.dueAt))
          setMaxScore(String(a.maxScore))
          setSubmitMode(a.submitMode)
        })
        .catch((e) => setError(handle(e)))
  }, [id, handle])

  async function addAttachment(files: FileList | null) {
    try {
      for (const f of [...(files ?? [])].slice(0, 5 - attachmentKeys.length)) {
        const key = await uploadImage(await resizeImage(f), 'attachment')
        setAttachmentKeys((ks) => [...ks, key])
      }
    } catch (e) {
      setError(handle(e))
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = { title, instructions, attachmentKeys, dueAt: localToEpoch(due), maxScore: Number(maxScore), submitMode }
    try {
      if (id) {
        await api(`/api/teacher/assignments/${id}`, { method: 'PUT', body })
        navigate(`/teacher/classes/${existingClass}/gradebook`, { state: { flash: 'บันทึกการแก้ไขแล้ว' } })
      } else {
        const { ids } = await api<{ ids: string[] }>('/api/teacher/assignments', { body: { ...body, classIds } })
        setDone(`สร้างงานแล้ว ${ids.length} ห้อง`)
        setTitle('')
        setInstructions('')
        setAttachmentKeys([])
      }
    } catch (err) {
      setError(handle(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !window.confirm('ลบงานนี้?')) return
    try {
      await api(`/api/teacher/assignments/${id}`, { method: 'DELETE' })
      navigate(`/teacher/classes/${existingClass}/gradebook`, { state: { flash: 'ลบงานแล้ว' } })
    } catch (e) {
      setError(handle(e))
    }
  }

  const toggle = (cid: string) => setClassIds((xs) => (xs.includes(cid) ? xs.filter((x) => x !== cid) : [...xs, cid]))

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">{id ? 'แก้ไขงาน' : 'สร้างงาน'}</h1>
      {done && (
        <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold" >
          {done} ·{' '}
          <Link to="/teacher" className="underline font-normal">
            กลับหน้าแรก
          </Link>
        </Card>
      )}
      <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <Card className="p-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
            ชื่องาน
            <input className={input} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="text-sm font-semibold">
            คำสั่ง
            <textarea className={input} rows={4} maxLength={5000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {attachmentKeys.map((k) => (
              <img key={k} src={fileUrl(k)} alt="รูปประกอบ" className="w-20 h-20 object-cover rounded-lg border border-line" />
            ))}
            {attachmentKeys.length < 5 && (
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-line text-xs text-stone-500 flex items-center justify-center text-center cursor-pointer">
                + รูปประกอบ
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addAttachment(e.target.files)} />
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">
              กำหนดส่ง (ไม่บังคับ)
              <input type="datetime-local" className={input} value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            <label className="text-sm font-semibold">
              คะแนนเต็ม
              <input type="number" min={0.5} step={0.5} max={1000} required className={input} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </label>
          </div>
          <label className="text-sm font-semibold">
            รูปแบบการส่ง
            <select className={input} value={submitMode} onChange={(e) => setSubmitMode(e.target.value as SubmitMode)}>
              <option value="both">ข้อความหรือรูป</option>
              <option value="image">รูปเท่านั้น</option>
              <option value="text">ข้อความเท่านั้น</option>
            </select>
          </label>
        </Card>
        <Card className="p-4 flex flex-col gap-2">
          {id ? (
            <p className="text-sm text-stone-500">งานนี้อยู่ในห้องเดียว แก้ไขได้ทุกช่อง</p>
          ) : (
            <>
              <p className="text-sm font-semibold">มอบหมายให้ห้อง</p>
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
            </>
          )}
          <ErrorBox message={error} />
          <Button type="submit" disabled={busy || (!id && classIds.length === 0)}>
            {id ? 'บันทึก' : 'สร้างงาน'}
          </Button>
          {id && (
            <Button type="button" variant="danger" onClick={remove}>
              ลบงาน
            </Button>
          )}
        </Card>
      </form>
    </TeacherLayout>
  )
}
