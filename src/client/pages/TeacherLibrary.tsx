import { useEffect, useState } from 'react'
import { api } from '../api'
import { ClassPicker, CopyOptions } from '../components/CopyDialog'
import { COPY_TYPE_LABEL, COPY_TYPES, type CopyType, type LibraryItem } from '../../shared/copy'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const date = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })

/** คลังของครู: ของที่เคยสร้าง (ทุกเทอม) เลือกแล้วคัดลอกไปหลายห้องได้ในครั้งเดียว */
export default function TeacherLibrary() {
  const handle = useTeacherErrorHandler()
  const [type, setType] = useState<CopyType>('assignment')
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [classIds, setClassIds] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    setPicked([])
    api<LibraryItem[]>(`/api/teacher/library?type=${type}`)
      .then(setItems)
      .catch((e) => setError(handle(e)))
  }, [type, handle])

  const shown = (items ?? []).filter((it) => !q.trim() || it.title.includes(q.trim()))
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">📚 คลังของครู</h1>
      <p className="text-sm text-stone-500 -mt-2">ของที่เคยสร้างทุกเทอม · เลือกแล้วคัดลอกไปห้องอื่นหรือเทอมใหม่ (ได้แต่ตัวงาน ไม่รวมงานที่ส่ง/คะแนน)</p>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      <div role="tablist" className="flex gap-1 rounded-xl bg-stone-100 p-1 self-start flex-wrap">
        {COPY_TYPES.map((k) => (
          <button key={k} role="tab" aria-selected={type === k} type="button" onClick={() => setType(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${type === k ? 'bg-white shadow-sm text-board' : 'text-stone-500'}`}>
            {COPY_TYPE_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
        <Card className="p-3 flex flex-col gap-2">
          <input className="border-2 border-line rounded-xl px-3 py-1.5" placeholder="ค้นหาชื่อ" aria-label="ค้นหาในคลัง" value={q} onChange={(e) => setQ(e.target.value)} />
          {!items && <Loading />}
          {items?.length === 0 && <p className="text-sm text-stone-500 text-center py-6">ยังไม่มี{COPY_TYPE_LABEL[type]}</p>}
          <div className="flex flex-col divide-y divide-stone-100" data-testid="library-list">
            {shown.map((it) => (
              <label key={it.latestId} className="flex items-center gap-2 py-2 text-sm">
                <input type="checkbox" checked={picked.includes(it.latestId)} onChange={() => toggle(it.latestId)} aria-label={`เลือก ${it.title}`} />
                <span className="flex-1 min-w-0">
                  <b className="block truncate">{it.title}</b>
                  <span className="text-xs text-stone-500">
                    {[it.detail, `ใช้ล่าสุด ${date.format(it.lastUsed)}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="text-xs text-stone-500 shrink-0">เคยใช้ {it.classCount} ห้อง</span>
              </label>
            ))}
          </div>
        </Card>
        <Card className="p-4 flex flex-col gap-3 lg:sticky lg:top-4">
          <b>เลือกแล้ว {picked.length} รายการ → ให้ห้อง</b>
          <ClassPicker value={classIds} onChange={setClassIds} />
          <CopyOptions
            type={type}
            ids={picked}
            classIds={classIds}
            onDone={(msg) => {
              setFlash(msg)
              setPicked([])
            }}
          />
        </Card>
      </div>
    </TeacherLayout>
  )
}
