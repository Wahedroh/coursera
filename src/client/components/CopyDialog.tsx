import { useEffect, useId, useState } from 'react'
import { api } from '../api'
import { COPY_TYPE_LABEL, type CopyType } from '../../shared/copy'
import PublishPicker, { PUBLISH_NOW, publishBody, publishValid, type PublishValue } from './PublishPicker'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const MAX = 40

/** เลือกห้องแยกโรงเรียน/ชั้น (ใช้ร่วมกับคลังของครู) */
export function ClassPicker({ value, onChange, exclude }: { value: string[]; onChange: (v: string[]) => void; exclude?: string }) {
  const [schools, setSchools] = useState<School[]>([])
  useEffect(() => {
    api<School[]>('/api/teacher/classes').then(setSchools).catch(() => {})
  }, [])
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div className="flex flex-col gap-1" data-testid="class-picker">
      {schools.map((s) => (
        <div key={s.schoolId} className="flex flex-wrap gap-x-4 gap-y-0.5 items-center text-sm">
          <span className="w-full text-xs font-semibold text-stone-500 mt-1">{s.schoolName}</span>
          {s.classes
            .filter((c) => c.id !== exclude)
            .map((c) => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={value.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`คัดลอกไป ${c.name}`} />
                {c.grade !== null ? `ชั้น ${c.grade}` : c.name}
              </label>
            ))}
        </div>
      ))}
    </div>
  )
}

/** ตัวเลือกกำหนดส่ง + เผยแพร่ + ปุ่มคัดลอก (ใช้ทั้งปุ่มคัดลอกรายชิ้นและคลังของครู) */
export function CopyOptions({ type, ids, classIds, onDone }: { type: CopyType; ids: string[]; classIds: string[]; onDone: (msg: string) => void }) {
  const uid = useId()
  const [due, setDue] = useState<'same' | 'next-period' | 'none'>('same')
  const [pub, setPub] = useState<PublishValue>(PUBLISH_NOW)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const total = ids.length * classIds.length
  async function go() {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<{ count: number; scheduled: number }>('/api/teacher/copy', { body: { type, ids, classIds, due, ...publishBody(pub) } })
      onDone(`คัดลอก${COPY_TYPE_LABEL[type]}แล้ว ${r.count} ชิ้น${r.scheduled ? ` (รอเผยแพร่ ${r.scheduled})` : ''}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'คัดลอกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {type === 'assignment' && (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-semibold mb-1">กำหนดส่งของห้องปลายทาง</legend>
          {(
            [
              ['same', 'เท่าเดิม'],
              ['next-period', 'คาบถัดไปของแต่ละห้อง (จากตารางสอน)'],
              ['none', 'ไม่มีกำหนดส่ง'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name={`${uid}-due`} checked={due === k} onChange={() => setDue(k)} /> {l}
            </label>
          ))}
        </fieldset>
      )}
      {type !== 'score-item' && <PublishPicker value={pub} onChange={setPub} />}
      {type === 'score-item' && <p className="text-xs text-stone-500">รายการสอบที่คัดลอกยังไม่เผยแพร่คะแนน · ไม่มีคะแนนติดไป</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}
      {total > MAX && <p className="text-sm text-amber-700">ครั้งละไม่เกิน {MAX} ชิ้น (รายการ × ห้อง) — ตอนนี้ {total}</p>}
      <button type="button" disabled={busy || total === 0 || total > MAX || !publishValid(pub)} onClick={() => void go()} className="rounded-xl bg-board text-white px-4 py-2 font-bold disabled:opacity-40">
        {busy ? 'กำลังคัดลอก…' : ids.length > 1 ? `คัดลอก ${ids.length} รายการ × ${classIds.length} ห้อง` : `คัดลอกไป ${classIds.length} ห้อง`}
      </button>
    </div>
  )
}

/** ปุ่ม “⧉ คัดลอกไปห้องอื่น” + กล่องเลือกห้อง */
export default function CopyButton({ type, id, title, fromClass, onCopied }: { type: CopyType; id: string; title: string; fromClass?: string; onCopied?: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  const [classIds, setClassIds] = useState<string[]>([])
  return (
    <>
      <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" onClick={() => setOpen(true)}>
        ⧉ คัดลอก
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`คัดลอก ${title}`} className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-2">
              <b>⧉ คัดลอก “{title}” ไปห้องอื่น</b>
              <button type="button" aria-label="ปิด" className="text-stone-500" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <ClassPicker value={classIds} onChange={setClassIds} exclude={fromClass} />
            <CopyOptions
              type={type}
              ids={[id]}
              classIds={classIds}
              onDone={(msg) => {
                setOpen(false)
                setClassIds([])
                onCopied?.(msg)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
