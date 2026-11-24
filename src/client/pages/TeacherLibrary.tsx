import { useEffect, useState } from 'react'
import { api } from '../api'
import { ClassPicker, CopyOptions } from '../components/CopyDialog'
import { COPY_TYPE_LABEL, COPY_TYPES, type CopyType, type LibraryItem, type LibraryPreview } from '../../shared/copy'
import { useFileViewer } from '../components/FileViewer'
import { fileUrl } from '../lib/upload'
import { Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'
import Icon from '../components/Icon'

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
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    setPicked([])
    // สลับแท็บเร็ว ๆ: คำตอบของแท็บก่อนที่มาช้าห้ามทับรายการของแท็บนี้ (จะคัดลอกผิดประเภท)
    let live = true
    api<LibraryItem[]>(`/api/teacher/library?type=${type}`)
      .then((x) => live && setItems(x))
      .catch((e) => live && setError(handle(e)))
    return () => {
      live = false
    }
  }, [type, handle])

  const shown = (items ?? []).filter((it) => !q.trim() || it.title.includes(q.trim()))
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold"><Icon n="books" /> คลังของครู</h1>
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
                <button type="button" onClick={(e) => (e.preventDefault(), setPreview(it.latestId))} className="shrink-0 rounded-lg border-2 border-line bg-white px-2.5 py-1 text-xs font-bold text-board" aria-label={`ดูรายละเอียด ${it.title}`}>
                  ดู
                </button>
              </label>
            ))}
          </div>
        </Card>
        <Card className="p-4 flex flex-col gap-3 lg:sticky lg:top-4">
          <b>เลือกแล้ว {picked.length} รายการ → ให้ห้อง</b>
          <ClassPicker value={classIds} onChange={setClassIds} />
          <Duplicates type={type} ids={picked} classIds={classIds} />
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
      {preview && (
        <Preview
          type={type}
          id={preview}
          picked={picked.includes(preview)}
          onPick={() => toggle(preview)}
          onClose={() => setPreview(null)}
        />
      )}
    </TeacherLayout>
  )
}

const when = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })

/** รายละเอียด: เนื้อหาของรายการ + ห้องที่มีอยู่แล้ว (เช็กก่อนคัดลอก) */
function Preview({ type, id, picked, onPick, onClose }: { type: CopyType; id: string; picked: boolean; onPick: () => void; onClose: () => void }) {
  const handle = useTeacherErrorHandler()
  const fv = useFileViewer()
  const [d, setD] = useState<LibraryPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api<LibraryPreview>(`/api/teacher/library/${type}/${id}`)
      .then((x) => live && setD(x))
      .catch((e) => live && setError(handle(e)))
    return () => {
      live = false
    }
  }, [type, id, handle])
  return (
    <div role="dialog" aria-modal="true" aria-label="รายละเอียดในคลัง" className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-paper shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center gap-2 bg-board px-3 py-2 text-white" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <button type="button" onClick={onClose} className="rounded-xl bg-white/15 px-3 py-2 font-bold">
            ← ย้อนกลับ
          </button>
          <b className="min-w-0 flex-1 truncate">{d?.title ?? 'รายละเอียด'}</b>
          <button type="button" onClick={onPick} aria-pressed={picked} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold ${picked ? 'bg-white text-board' : 'bg-white/15'}`}>
            {picked ? '✓ เลือกแล้ว' : '+ เลือกรายการนี้'}
          </button>
        </header>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="library-preview">
          <ErrorBox message={error} />
          {!d && !error && <Loading />}
          {d && (
            <>
              <div>
                <Chip>{COPY_TYPE_LABEL[d.type]}</Chip>
                <h2 className="mt-1 text-xl font-extrabold">{d.title}</h2>
              </div>
              {d.facts.length > 0 && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {d.facts.map((f) => (
                    <div key={f.label} className="rounded-xl bg-white border border-line px-3 py-2">
                      <dt className="text-xs text-stone-500">{f.label}</dt>
                      <dd className="font-semibold break-words">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {d.youtubeId && <img src={`https://i.ytimg.com/vi/${d.youtubeId}/mqdefault.jpg`} alt="ภาพคลิป" className="w-full max-w-sm aspect-video rounded-xl object-cover bg-stone-200" />}
              {d.text && <p className="whitespace-pre-wrap rounded-xl bg-white border border-line p-3 text-sm">{d.text}</p>}
              {d.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.images.map((k, i) => (
                    <button key={k} type="button" onClick={() => fv.open({ key: k, title: `${d.title} · รูป ${i + 1}` })} aria-label={`ดูรูปประกอบ ${i + 1}`}>
                      <img src={fileUrl(k)} alt={`รูปประกอบ ${i + 1}`} className="h-28 rounded-lg border border-line object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {d.file && (
                <button type="button" onClick={() => fv.open({ key: d.file!.key, title: d.title, fileName: d.file!.fileName })} className="self-start rounded-xl bg-board px-4 py-2 font-bold text-white">
                  📄 เปิดดูเอกสาร
                </button>
              )}
              {d.questions.length > 0 && (
                <ol className="flex flex-col gap-2 text-sm">
                  {d.questions.map((q, i) => (
                    <li key={i} className="rounded-xl bg-white border border-line p-3">
                      <b>
                        {i + 1}. {q.q}
                      </b>
                      <ul className="mt-1 grid gap-0.5">
                        {q.choices.map((c, k) => (
                          <li key={k} className={k === q.answer ? 'font-bold text-board' : 'text-stone-600'}>
                            {k === q.answer ? '✓ ' : '· '}
                            {c}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
              <section aria-label="มีอยู่แล้วในห้อง">
                <h3 className="font-bold">มีอยู่แล้วใน {d.usedIn.length} ห้อง</h3>
                <p className="text-xs text-stone-500">ห้องที่มีรายการชื่อนี้แล้ว — เลือกห้องอื่นเพื่อไม่ให้ซ้ำ</p>
                <ul className="mt-1 divide-y divide-stone-100 rounded-xl bg-white border border-line text-sm" data-testid="used-in">
                  {d.usedIn.map((u, i) => (
                    <li key={`${u.classId}-${i}`} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <b>{u.className}</b> <span className="text-xs text-stone-500">{u.schoolName}</span>
                      </span>
                      <span className="text-xs text-stone-500">{when.format(u.createdAt)}</span>
                      {u.published ? <Chip tone="green">เผยแพร่</Chip> : <Chip>ซ่อน</Chip>}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
      {fv.viewer}
    </div>
  )
}

/** เตือนก่อนคัดลอก: ห้องที่เลือกมีรายการชื่อเดียวกันอยู่แล้ว */
function Duplicates({ type, ids, classIds }: { type: CopyType; ids: string[]; classIds: string[] }) {
  const [dups, setDups] = useState<string[]>([])
  const key = `${type}|${ids.join(',')}|${classIds.join(',')}`
  useEffect(() => {
    if (!ids.length || !classIds.length) return setDups([])
    let live = true
    Promise.all(ids.map((id) => api<LibraryPreview>(`/api/teacher/library/${type}/${id}`).catch(() => null)))
      .then((xs) => {
        if (!live) return
        const out: string[] = []
        for (const x of xs) for (const u of x?.usedIn ?? []) if (classIds.includes(u.classId)) out.push(`“${x!.title}” มีแล้วใน ${u.className}`)
        setDups([...new Set(out)])
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!dups.length) return null
  return (
    <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
      <b>⚠️ ห้องที่เลือกมีรายการนี้อยู่แล้ว</b>
      <ul className="mt-1 list-disc pl-4">
        {dups.slice(0, 8).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {dups.length > 8 && <p>และอีก {dups.length - 8} รายการ</p>}
      <p className="mt-1">คัดลอกต่อได้ แต่จะมีรายการซ้ำในห้องนั้น</p>
    </div>
  )
}
