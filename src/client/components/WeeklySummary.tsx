import { useEffect, useState } from 'react'
import { api } from '../api'
import { summaryWeek, weekOf, weeklySummaryText, type WorkloadRange } from '../../shared/workload'
import { Button, Card } from '../ui'
import Icon from './Icon'

const NAME_KEY = 'weeklySummaryName'
const todayStr = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const label = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const fmt = (d: string) => label.format(Date.parse(`${d}T00:00:00Z`))
const load = (k: string) => {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}

/** สรุปรายสัปดาห์ (เสาร์–ศุกร์) แบบที่ครูส่งทุกสัปดาห์ · แก้ข้อความได้ก่อนคัดลอก */
export default function WeeklySummary() {
  const [week, setWeek] = useState(() => summaryWeek(todayStr()))
  const [name, setName] = useState(() => load(NAME_KEY))
  const [range, setRange] = useState<WorkloadRange | null>(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setRange(null)
    api<WorkloadRange>(`/api/teacher/workload?from=${week.from}&to=${week.to}`)
      .then((r) => live && setRange(r))
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [week])
  // ข้อความใหม่ทุกครั้งที่เปลี่ยนสัปดาห์/ชื่อ (แก้ในกล่องได้ก่อนคัดลอก)
  useEffect(() => {
    if (range) setText(weeklySummaryText(range.days, name))
    setCopied(false)
  }, [range, name])

  function changeName(v: string) {
    setName(v)
    try {
      localStorage.setItem(NAME_KEY, v)
    } catch {
      // ไม่จำก็ได้
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError('คัดลอกไม่ได้ — กดค้างในกล่องข้อความแล้วเลือก "คัดลอก" แทน')
    }
  }
  const move = (n: number) => setWeek(weekOf(shift(week.from, n * 7)))

  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <b className="mr-auto">
          <Icon n="clipboard" /> สรุปรายสัปดาห์ (ส.–ศ.)
        </b>
        <button type="button" onClick={() => move(-1)} aria-label="สัปดาห์ก่อน" className="rounded-lg border-2 border-line bg-white px-2">
          ◀
        </button>
        <span className="text-sm font-semibold" data-testid="summary-week">
          {fmt(week.from)} – {fmt(week.to)}
        </span>
        <button type="button" onClick={() => move(1)} aria-label="สัปดาห์ถัดไป" className="rounded-lg border-2 border-line bg-white px-2">
          ▶
        </button>
      </div>
      <label className="text-xs font-semibold text-stone-600">
        ชื่อครู (บรรทัดแรก)
        <input className="block w-full rounded-lg border-2 border-line bg-white px-2 py-1 text-sm" value={name} maxLength={60} onChange={(e) => changeName(e.target.value)} placeholder="เช่น อับดุลวาเหตุ" />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <textarea aria-label="ข้อความสรุปรายสัปดาห์" className="min-h-48 rounded-xl border-2 border-line bg-stone-50 p-3 text-sm leading-relaxed" value={range ? text : 'กำลังโหลด…'} onChange={(e) => (setText(e.target.value), setCopied(false))} rows={12} />
      <div className="flex items-center gap-2">
        <Button onClick={() => void copy()} disabled={!range || !text.trim()}>
          {copied ? '✓ คัดลอกแล้ว' : 'คัดลอกสรุปรายสัปดาห์'}
        </Button>
        <span className="text-xs text-stone-500">คิดจากตารางสอน · วันที่ปิดไม่นับ · สอนชดเชยแยกบรรทัด · แก้ข้อความได้ก่อนคัดลอก</span>
      </div>
    </Card>
  )
}
