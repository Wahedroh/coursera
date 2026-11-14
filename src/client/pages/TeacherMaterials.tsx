import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api } from '../api'
import { fileUrl } from '../lib/upload'
import { fileIcon, fmtSize, groupByDate, groupByTopic, lessonDateLabel, uploadMaterial } from '../lib/materials'
import { MATERIAL_ACCEPT, MATERIAL_KIND_LABEL, MAX_MATERIAL_BYTES, materialExt, splitMaterials, type MaterialKind, type TeacherMaterial } from '../../shared/materials'
import { todayBangkok } from '../../shared/attendance'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import PublishPicker, { PUBLISH_NOW, publishBody, publishValid, ScheduleChip, type PublishValue } from '../components/PublishPicker'
import CopyButton from '../components/CopyDialog'
import PasteZone, { type PastedPage } from '../components/PasteZone'
import { combineToPdf } from '../lib/pdf'
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
  const [pages, setPages] = useState<PastedPage[]>([])
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  // จากปุ่ม “อัปที่จด” ในหน้าแรก (?kind=notes)
  const [params] = useSearchParams()
  const startKind: MaterialKind = params.get('kind') === 'notes' ? 'notes' : 'blank'
  const [tab, setTab] = useState<MaterialKind>(startKind)
  const [kind, setKind] = useState<MaterialKind>(startKind)
  const [pub, setPub] = useState<PublishValue>(PUBLISH_NOW)
  const [lessonDate, setLessonDate] = useState(() => todayBangkok(Date.now()))
  const [notify, setNotify] = useState(true)
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
  const split = items ? splitMaterials(items) : null
  const shown = split?.[tab] ?? []
  const topics = [...new Set((items ?? []).map((m) => m.topic).filter(Boolean))]

  function pick(f: File | null) {
    setFile(f)
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  // วางหน้าที่จด → ตั้งชื่อให้เอง (แก้ได้)
  function onPages(p: PastedPage[]) {
    setPages(p)
    if (p.length && !title) setTitle(`จดในห้อง ${lessonDateLabel(lessonDate)}`)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!file && !pages.length) return
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      // หน้าที่วางมา → รวมเป็น PDF ไฟล์เดียว
      const upload = pages.length
        ? new File([await combineToPdf(pages)], `จดในห้อง-${lessonDate}.pdf`, { type: 'application/pdf' })
        : file!
      if (upload.size > MAX_MATERIAL_BYTES) throw new Error('ไฟล์รวมใหญ่เกิน 25MB — ลองแบ่งเป็นหลายครั้ง')
      const ids = await uploadMaterial(upload, { title, topic, kind, lessonDate, notify, classIds, ...publishBody(pub) })
      setFlash(`อัปโหลด "${title}" แล้ว ${ids.length} ห้อง · ${MATERIAL_KIND_LABEL[kind]}`)
      setTab(kind)
      setFile(null)
      pages.forEach((p) => URL.revokeObjectURL(p.url))
      setPages([])
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
      <div role="tablist" className="flex gap-1 rounded-xl bg-stone-100 p-1 self-start">
        {(['blank', 'notes'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k)
              setKind(k)
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-white shadow-sm text-board' : 'text-stone-500'}`}
          >
            {k === 'blank' ? '📄 ' : '📒 '}
            {MATERIAL_KIND_LABEL[k]}
            {split && <span className="ml-1 text-xs opacity-70">({split[k].length})</span>}
          </button>
        ))}
      </div>
      {!items && !error && <Loading />}
      {items && shown.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">{tab === 'notes' ? 'ยังไม่มีเอกสารที่จดในห้อง' : 'ยังไม่มีเอกสารในห้องนี้'}</Card>}
      {items &&
        (tab === 'notes' ? groupByDate(shown) : groupByTopic(shown)).map(([t, list]) => (
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
                          {m.kind === 'notes' && m.topic ? `${m.topic} · ` : ''}
                          {m.fileName} · {fmtSize(m.size)}
                        </div>
                        <div className="mt-1">{m.published ? <Chip tone="green">นักเรียนเห็น</Chip> : m.publishAt ? <ScheduleChip published={false} publishAt={m.publishAt} /> : <Chip>ซ่อนอยู่</Chip>}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <CopyButton type="material" id={m.id} title={m.title} fromClass={id} onCopied={setFlash} />
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
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="font-semibold mb-1">ประเภท</legend>
            {(['blank', 'notes'] as const).map((k) => (
              <label key={k} className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 ${kind === k ? 'border-board bg-board-soft' : 'border-line'}`}>
                <input type="radio" name="material-kind" className="mt-1" checked={kind === k} onChange={() => setKind(k)} />
                <span>
                  <span className="font-semibold">{MATERIAL_KIND_LABEL[k]}</span>
                  <span className="block text-xs text-stone-500">{k === 'blank' ? 'ใบงาน/ใบความรู้ฉบับเปล่า ให้นักเรียนปริ้นหรือเขียนตาม' : 'สิ่งที่ครูเขียน/จดระหว่างสอน หรือรูปกระดาน — แยกตามวันเรียน'}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {kind === 'notes' && (
            <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3">
              <label className="text-sm font-semibold">
                วันที่สอน
                <input className={input} type="date" required value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                แจ้งเตือนนักเรียนว่ามีเอกสารที่จดในห้องใหม่
              </label>
              <PasteZone pages={pages} onPages={onPages} onFile={(f) => pick(f)} autoFocus={startKind === 'notes'} />
              {file && !pages.length && <p className="text-xs text-stone-600">ไฟล์ที่เลือก: {file.name}</p>}
              {file && pages.length > 0 && <p className="text-xs text-amber-700">มีทั้งไฟล์และหน้าที่วาง — ระบบจะใช้ชิ้นที่ลาก/วาง ({pages.length} ชิ้น)</p>}
            </div>
          )}
          <label className="text-sm font-semibold">
            {kind === 'notes' ? 'หรือเลือกไฟล์ (PDF, Word, PowerPoint หรือรูป ไม่เกิน 25MB)' : 'ไฟล์ (PDF, Word, PowerPoint หรือรูป ไม่เกิน 25MB)'}
            <input className={input} type="file" required={!pages.length && !file} accept={MATERIAL_ACCEPT} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
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
          <div className="border-t border-stone-100 pt-2">
            <PublishPicker value={pub} onChange={setPub} allowDraft={false} />
          </div>
          <Button type="submit" disabled={busy || (!file && !pages.length) || (!pages.length && !!fileError) || classIds.length === 0 || !publishValid(pub)}>
            {busy ? 'กำลังอัปโหลด…' : 'อัปโหลด'}
          </Button>
        </Card>
      </form>
    </TeacherLayout>
  )
}

type EditBody = { title: string; topic: string; kind: MaterialKind; lessonDate: string }

function EditMaterial({ material, onSave }: { material: TeacherMaterial; onSave: (body: EditBody) => Promise<void> }) {
  const [title, setTitle] = useState(material.title)
  const [topic, setTopic] = useState(material.topic)
  const [kind, setKind] = useState<MaterialKind>(material.kind)
  const [lessonDate, setLessonDate] = useState(material.lessonDate || todayBangkok(material.createdAt))
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ title, topic, kind, lessonDate })
      }}
    >
      <input aria-label="แก้ชื่อเอกสาร" className={input} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="แก้หัวข้อ" className={input} maxLength={100} placeholder="หัวข้อ / บท" value={topic} onChange={(e) => setTopic(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <select aria-label="แก้ประเภท" className={`${input} w-auto`} value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)}>
          <option value="blank">{MATERIAL_KIND_LABEL.blank}</option>
          <option value="notes">{MATERIAL_KIND_LABEL.notes}</option>
        </select>
        {kind === 'notes' && <input aria-label="แก้วันที่สอน" type="date" required className={`${input} w-auto`} value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} />}
      </div>
      <Button type="submit">บันทึกการแก้ไข</Button>
    </form>
  )
}
