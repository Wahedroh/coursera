import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import type { AnnouncementInput, TeacherAnnouncement } from '../../shared/announcements'
import { formatDate } from '../lib/format'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'
const small = 'rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold'
const EMPTY: AnnouncementInput = { title: '', body: '', pinned: false, expiresOn: null }

export default function TeacherAnnouncements() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [items, setItems] = useState<TeacherAnnouncement[] | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [className, setClassName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [form, setForm] = useState<AnnouncementInput>(EMPTY)
  const [classIds, setClassIds] = useState<string[]>([id])
  const [editing, setEditing] = useState<string | null>(null)
  const [showUnread, setShowUnread] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<TeacherAnnouncement[]>(`/api/teacher/classes/${id}/announcements`).then(setItems).catch((e) => setError(handle(e)))
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

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { ids } = await api<{ ids: string[] }>('/api/teacher/announcements', { body: { ...form, classIds } })
      setFlash(`ประกาศ "${form.title}" แล้ว ${ids.length} ห้อง`)
      setForm(EMPTY)
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
      <h1 className="text-2xl font-extrabold">ประกาศ</h1>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      {!items && !error && <Loading />}
      {items?.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีประกาศในห้องนี้</Card>}
      {items && items.length > 0 && (
        <Card className="divide-y divide-stone-100">
          {items.map((a) => (
            <div key={a.id} className={`p-3 flex flex-col gap-2 ${a.expired ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-48">
                  <div className="font-bold">
                    {a.pinned && '📌 '}
                    {a.title}
                  </div>
                  {a.body && <p className="text-sm text-stone-600 whitespace-pre-line">{a.body}</p>}
                  <div className="mt-1 flex flex-wrap gap-1 items-center text-xs text-stone-500">
                    <Chip tone={a.readCount === a.total ? 'green' : 'amber'}>
                      อ่านแล้ว {a.readCount}/{a.total}
                    </Chip>
                    {a.expired ? <Chip>หมดอายุแล้ว</Chip> : a.expiresOn && <span>แสดงถึง {formatDate(a.expiresOn)}</span>}
                    <span>· ประกาศเมื่อ {new Date(a.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.unread.length > 0 && (
                    <button type="button" className={small} onClick={() => setShowUnread(showUnread === a.id ? null : a.id)}>
                      ใครยังไม่อ่าน
                    </button>
                  )}
                  <button type="button" className={small} onClick={() => setEditing(editing === a.id ? null : a.id)}>
                    แก้
                  </button>
                  <button type="button" className={small} onClick={() => act(`/api/teacher/announcements/${a.id}`, 'PUT', { title: a.title, body: a.body, pinned: !a.pinned, expiresOn: a.expiresOn })}>
                    {a.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                  </button>
                  <button type="button" className="rounded-lg border border-red-200 text-red-700 bg-white px-2 py-1 text-xs font-semibold" onClick={() => act(`/api/teacher/announcements/${a.id}`, 'DELETE', undefined, `ลบประกาศ "${a.title}"?`)}>
                    ลบ
                  </button>
                </div>
              </div>
              {showUnread === a.id && <p className="text-xs rounded-xl bg-amber-50 p-2">ยังไม่อ่าน {a.unread.length} คน: {a.unread.join(', ')}</p>}
              {editing === a.id && (
                <AnnouncementFields
                  initial={a}
                  submitLabel="บันทึกการแก้ไข"
                  onSubmit={async (v) => {
                    await act(`/api/teacher/announcements/${a.id}`, 'PUT', v)
                    setEditing(null)
                  }}
                />
              )}
            </div>
          ))}
        </Card>
      )}
      <form onSubmit={create} className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-bold">+ ประกาศใหม่</h2>
          <Fields value={form} onChange={setForm} />
          <p className="text-xs text-stone-500">ขึ้นที่หน้าแรกของนักเรียน นักเรียนกด "รับทราบ" แล้วครูเห็นจำนวนคนอ่าน · ประกาศที่ปักหมุดอยู่บนสุด</p>
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
          <Button type="submit" disabled={busy || classIds.length === 0 || !form.title.trim()}>
            ประกาศ
          </Button>
        </Card>
      </form>
    </TeacherLayout>
  )
}

function Fields({ value, onChange }: { value: AnnouncementInput; onChange: (v: AnnouncementInput) => void }) {
  return (
    <>
      <label className="text-sm font-semibold">
        หัวข้อ
        <input className={input} required maxLength={200} placeholder="เช่น พรุ่งนี้สอบบทที่ 2" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      </label>
      <label className="text-sm font-semibold">
        รายละเอียด (ไม่บังคับ)
        <textarea className={input} rows={3} maxLength={3000} value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-4 items-end">
        <label className="text-sm font-semibold">
          แสดงถึงวันที่ (ไม่บังคับ)
          <input type="date" className={input} value={value.expiresOn ?? ''} onChange={(e) => onChange({ ...value, expiresOn: e.target.value || null })} />
        </label>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={value.pinned} onChange={(e) => onChange({ ...value, pinned: e.target.checked })} /> 📌 ปักหมุดไว้บนสุด
        </label>
      </div>
    </>
  )
}

function AnnouncementFields({ initial, submitLabel, onSubmit }: { initial: AnnouncementInput; submitLabel: string; onSubmit: (v: AnnouncementInput) => Promise<void> }) {
  const [v, setV] = useState<AnnouncementInput>({ title: initial.title, body: initial.body, pinned: initial.pinned, expiresOn: initial.expiresOn })
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit(v)
      }}
    >
      <Fields value={v} onChange={setV} />
      <Button type="submit">{submitLabel}</Button>
    </form>
  )
}
