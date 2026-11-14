import { useId } from 'react'
import { localToEpoch } from '../lib/format'
import type { PublishMode } from '../../shared/timetable'

export type PublishValue = { mode: PublishMode; at: string }
export const PUBLISH_NOW: PublishValue = { mode: 'now', at: '' }
/** ค่าที่ส่งไปเซิร์ฟเวอร์ */
export const publishBody = (v: PublishValue) => ({ publishMode: v.mode, publishAt: v.mode === 'at' ? localToEpoch(v.at) : null })
export const publishValid = (v: PublishValue) => v.mode !== 'at' || (!!v.at && (localToEpoch(v.at) ?? 0) > Date.now())

const OPTIONS: { mode: PublishMode; label: string; hint?: string }[] = [
  { mode: 'now', label: 'ทันที' },
  { mode: 'next-period', label: 'ตอนเริ่มคาบถัดไปของแต่ละห้อง', hint: 'จากตารางสอน · ห้องที่ไม่มีตารางสอนเผยแพร่ทันที' },
  { mode: 'at', label: 'ตั้งวัน–เวลาเอง' },
  { mode: 'draft', label: 'เก็บเป็นร่าง (ยังไม่เผยแพร่)', hint: 'ไปเผยแพร่ทีหลังที่หน้า “รอเผยแพร่”' },
]

/** เลือกเวลาเผยแพร่: ทันที · คาบถัดไป · ตั้งเวลา · ร่าง */
export default function PublishPicker({ value, onChange, allowDraft = true }: { value: PublishValue; onChange: (v: PublishValue) => void; allowDraft?: boolean }) {
  const uid = useId()
  return (
    <fieldset className="flex flex-col gap-1.5" data-testid="publish-picker">
      <legend className="text-sm font-semibold mb-1">เผยแพร่ให้นักเรียน</legend>
      {OPTIONS.filter((o) => allowDraft || o.mode !== 'draft').map((o) => (
        <label key={o.mode} className={`flex items-start gap-2 rounded-xl border-2 px-3 py-1.5 text-sm ${value.mode === o.mode ? 'border-board bg-board-soft' : 'border-line bg-white'}`}>
          <input type="radio" name={`${uid}-publish`} className="mt-1" checked={value.mode === o.mode} onChange={() => onChange({ ...value, mode: o.mode })} />
          <span className="flex-1">
            <span className="font-semibold">{o.label}</span>
            {o.hint && <span className="block text-xs text-stone-500">{o.hint}</span>}
            {o.mode === 'at' && value.mode === 'at' && (
              <input
                type="datetime-local"
                aria-label="วันเวลาที่จะเผยแพร่"
                className="mt-1 w-full border-2 border-line rounded-lg px-2 py-1 bg-white"
                value={value.at}
                onChange={(e) => onChange({ ...value, at: e.target.value })}
              />
            )}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

const fmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** ป้ายสถานะในรายการของครู */
export function ScheduleChip({ published, publishAt }: { published: boolean; publishAt: number | null }) {
  if (published) return null
  return publishAt ? (
    <span className="inline-block rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-bold">⏰ เผยแพร่ {fmt.format(publishAt)}</span>
  ) : null
}
