import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { fileUrl } from '../lib/upload'
import { fileIcon, fmtSize, groupByTopic, uploadMaterial } from '../lib/materials'
import { MATERIAL_ACCEPT, MAX_MATERIAL_BYTES, materialExt, type TeacherMaterial } from '../../shared/materials'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'
const small = 'rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold'

export default function TeacherMaterials() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [items, setItems] = useState<TeacherMaterial[] | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [className, setClassName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [classIds, setClassIds] = useState<string[]>([id])
  const [busy, setBusy] = useState(false)
  const [formKey, setFormKey] = useState(0)

  const load = useCallback(() => {
    api<TeacherMaterial[]>(`/api/teacher/classes/${id}/materials`).then(setItems).catch((e) => setError(handle(e)))
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

  const fileError = file && (!materialExt(file.name) ? 'รองรับเฉพาะ PDF, Word, PowerPoint หรือรูป' : file.size > MAX_MATERIAL_BYTES ? 'ไฟล์ใหญ่เกิน 25MB' : null)
  const topics = [...new Set((items ?? []).map((m) => m.topic).filter(Boolean))]

  function pick(f: File | null) {
    setFile(f)
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const ids = await uploadMaterial(file, { title, topic, classIds })
      setFlash(`อัปโหลด "${title}" แล้ว ${ids.length} ห้อง`)
      setFile(null)
      setTitle('')
      setFormKey((k) => k + 1)
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
      <h1 className="text-2xl font-extrabold">เอกสารเรียน</h1>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      {!items && !error && <Loading />}
      {items?.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีเอกสารในห้องนี้</Card>}
      {items &&
        groupByTopic(items).map(([t, list]) => (
          <section key={t} className="flex flex-col gap-2">
            <h2 className="font-bold text-stone-600">{t}</h2>
            <Card className="divide-y divide-stone-100">
              {list.map((m) => {
                const icon = fileIcon(m.fileName)
                return (
                  <div key={m.id} className="p-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-extrabold ${icon.cls}`}>{icon.label}</span>
                      <div className="flex-1 min-w-40">
                        <div className="font-bold">{m.title}</div>
                        <div className="text-xs text-stone-500 break-all">
                          {m.fileName} · {fmtSize(m.size)}
                        </div>
                        <div className="mt-1">{m.published ? <Chip tone="green">นักเรียนเห็น</Chip> : <Chip>ซ่อนอยู่</Chip>}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <a className={small} href={fileUrl(m.fileKey)} target="_blank" rel="noreferrer">
                          เปิด
                        </a>
                        <button type="button" className={small} onClick={() => setEditing(editing === m.id ? null : m.id)}>
                          แก้
                        </button>
                        <button type="button" className={small} onClick={() => act(`/api/teacher/materials/${m.id}/published`, 'PUT', { published: !m.published })}>
                          {m.published ? 'ซ่อน' : 'แสดง'}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 text-red-700 bg-white px-2 py-1 text-xs font-semibold"
                          onClick={() => act(`/api/teacher/materials/${m.id}`, 'DELETE', undefined, `ลบเอกสาร "${m.title}"?`)}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                    {editing === m.id && (
                      <EditMaterial
                        material={m}
                        onSave={async (body) => {
                          await act(`/api/teacher/materials/${m.id}`, 'PUT', body)
                          setEditing(null)
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </Card>
          </section>
        ))}
      <form key={formKey} onSubmit={create} className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">+ อัปโหลดเอกสาร</h2>
          <label className="text-sm font-semibold">
            ไฟล์ (PDF, Word, PowerPoint หรือรูป ไม่เกิน 25MB)
            <input className={input} type="file" required accept={MATERIAL_ACCEPT} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            {fileError && <span className="text-xs text-red-600">{fileError}</span>}
          </label>
          <label className="text-sm font-semibold">
            ชื่อเอกสาร
            <input className={input} required maxLength={200} placeholder="เช่น ใบความรู้ เรื่องแรง" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="text-sm font-semibold">
            หัวข้อ / บท (ไม่บังคับ)
            <input className={input} maxLength={100} list="material-topics" placeholder="เช่น บทที่ 1" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <datalist id="material-topics">
              {topics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <p className="text-xs text-stone-500">PDF และรูปนักเรียนเปิดดูในเว็บได้เลย · Word และ PowerPoint จะดาวน์โหลดไปเปิดในเครื่อง</p>
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
          <Button type="submit" disabled={busy || !file || !!fileError || classIds.length === 0}>
            {busy ? 'กำลังอัปโหลด…' : 'อัปโหลด'}
          </Button>
        </Card>
      </form>
    </TeacherLayout>
  )
}

function EditMaterial({ material, onSave }: { material: TeacherMaterial; onSave: (body: { title: string; topic: string }) => Promise<void> }) {
  const [title, setTitle] = useState(material.title)
  const [topic, setTopic] = useState(material.topic)
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ title, topic })
      }}
    >
      <input aria-label="แก้ชื่อเอกสาร" className={input} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="แก้หัวข้อ" className={input} maxLength={100} placeholder="หัวข้อ / บท" value={topic} onChange={(e) => setTopic(e.target.value)} />
      <Button type="submit">บันทึกการแก้ไข</Button>
    </form>
  )
}
