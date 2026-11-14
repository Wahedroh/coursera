import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { localToEpoch, epochToLocal } from '../lib/format'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Item = { type: 'assignment' | 'video' | 'material' | 'announcement'; id: string; classId: string; title: string; publishAt: number | null; createdAt: number }
type School = { schoolName: string; classes: { id: string; name: string }[] }
const TYPE: Record<Item['type'], string> = { assignment: '📝 งาน', video: '🎬 คลิป', material: '📄 เอกสาร', announcement: '📢 ประกาศ' }
const fmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** รายการที่ตั้งเวลาเผยแพร่ไว้/ร่าง ทุกห้อง · เผยแพร่ตอนนี้หรือเลื่อนเวลาได้ */
export default function TeacherScheduled() {
  const handle = useTeacherErrorHandler()
  const [items, setItems] = useState<Item[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [at, setAt] = useState('')

  const load = useCallback(() => {
    api<Item[]>('/api/teacher/scheduled')
      .then(setItems)
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])
  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then((s) => setNames(new Map(s.flatMap((x) => x.classes.map((c) => [c.id, c.name] as const)))))
      .catch(() => {})
  }, [])

  async function update(it: Item, publishAt: number | null) {
    setError(null)
    try {
      await api(`/api/teacher/scheduled/${it.type}/${it.id}`, { method: 'PUT', body: { publishAt } })
      setFlash(publishAt === null ? `เผยแพร่ "${it.title}" แล้ว` : `เลื่อน "${it.title}" เป็น ${fmt.format(publishAt)}`)
      setEditing(null)
      load()
    } catch (e) {
      setError(handle(e))
    }
  }

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">รอเผยแพร่</h1>
      <p className="text-sm text-stone-500 -mt-2">งาน · คลิป · เอกสาร · ประกาศ ที่ตั้งเวลาไว้หรือเก็บเป็นร่าง · นักเรียนยังไม่เห็นจนกว่าจะถึงเวลา</p>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      {!items && !error && <Loading />}
      {items?.length === 0 && (
        <Card className="p-6 text-center text-sm text-stone-500">
          ไม่มีรายการที่รอเผยแพร่ · ตั้งเวลาได้ตอนสร้างงาน/คลิป/เอกสาร/ประกาศ หรือคัดลอกจาก <Link to="/teacher/library" className="underline text-board">คลังของครู</Link>
        </Card>
      )}
      <div className="flex flex-col gap-2" data-testid="scheduled-list">
        {items?.map((it) => (
          <Card key={`${it.type}${it.id}`} className="p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48">
              <div className="text-xs text-stone-500">
                {TYPE[it.type]} · {names.get(it.classId) ?? ''}
              </div>
              <b>{it.title}</b>
            </div>
            {it.publishAt ? (
              <span className="rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-bold">⏰ {fmt.format(it.publishAt)}</span>
            ) : (
              <span className="rounded-full bg-stone-100 text-stone-600 px-2.5 py-0.5 text-xs font-bold">ร่าง</span>
            )}
            <div className="flex gap-1.5">
              <button type="button" className="rounded-lg bg-board text-white px-2.5 py-1 text-xs font-bold" onClick={() => void update(it, null)}>
                เผยแพร่ตอนนี้
              </button>
              <button
                type="button"
                className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-bold"
                onClick={() => {
                  setEditing(`${it.type}${it.id}`)
                  setAt(epochToLocal(it.publishAt ?? Date.now() + 86400_000))
                }}
              >
                {it.publishAt ? 'เลื่อนเวลา' : 'ตั้งเวลา'}
              </button>
            </div>
            {editing === `${it.type}${it.id}` && (
              <div className="w-full flex flex-wrap gap-2 items-center">
                <input type="datetime-local" aria-label="เวลาเผยแพร่ใหม่" className="border-2 border-line rounded-lg px-2 py-1" value={at} onChange={(e) => setAt(e.target.value)} />
                <button type="button" disabled={(localToEpoch(at) ?? 0) <= Date.now()} className="rounded-lg bg-board text-white px-3 py-1 text-xs font-bold disabled:opacity-40" onClick={() => void update(it, localToEpoch(at))}>
                  บันทึกเวลา
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </TeacherLayout>
  )
}
