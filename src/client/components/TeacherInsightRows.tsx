import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import type { TeacherInsights } from '../../shared/teacherInsights'
import Icon, { type IconName } from './Icon'

const baht = (n: number) => `฿${Math.round(n).toLocaleString('th-TH')}`

/** หน้าแรกครู: แถวข้อสังเกต (เรื่องที่ควรจัดการ + ตัวเลข · แตะไปหน้านั้น) — แสดงเฉพาะเรื่องที่มี */
export default function TeacherInsightRows() {
  const [d, setD] = useState<TeacherInsights | null>(null)
  useEffect(() => {
    api<TeacherInsights>('/api/teacher/home-insights')
      .then(setD)
      .catch(() => {})
  }, [])
  if (!d) return null
  const risk = [d.atRisk.attendance && `มส ${d.atRisk.attendance}`, d.atRisk.incomplete && `ร ${d.atRisk.incomplete}`, d.atRisk.zero && `0: ${d.atRisk.zero}`].filter(Boolean).join(' · ')
  const rows: { icon: IconName; label: string; value: string; to: string; tone: 'red' | 'amber' | 'green' }[] = []
  if (d.atRisk.attendance) rows.push({ icon: 'warning', label: `เสี่ยงติด มส ${d.atRisk.attendance} คน`, value: 'ดูรายชื่อ', to: '/teacher/menu/at-risk', tone: 'red' })
  else if (risk) rows.push({ icon: 'warning', label: `ติด 0 · ร · มส`, value: risk, to: '/teacher/menu/at-risk', tone: 'amber' })
  if (d.remedialToReview) rows.push({ icon: 'edit', label: 'งานซ่อมรอตรวจ', value: `${d.remedialToReview} ชิ้น`, to: '/teacher/menu/at-risk', tone: 'amber' })
  if (d.leavesPending) rows.push({ icon: 'doc', label: 'ใบลารออนุมัติ', value: `${d.leavesPending} ใบ`, to: '/teacher/leaves', tone: 'amber' })
  if (d.fees.students) rows.push({ icon: 'receipt', label: `ค่าเอกสารค้าง ${d.fees.students} คน`, value: baht(d.fees.baht), to: '/teacher/menu/fees', tone: 'green' })
  if (!rows.length) return null
  const color = { red: 'text-red-700', amber: 'text-amber-700', green: 'text-board' }
  return (
    <section aria-label="ข้อสังเกต" className="flex flex-col rounded-2xl border-2 border-line bg-white px-3 py-1" data-testid="insight-rows">
      {rows.map((r) => (
        <Link key={r.label} to={r.to} className="flex items-center gap-2 border-b border-stone-100 py-2.5 last:border-0">
          <Icon n={r.icon} className="text-lg" />
          <span className="font-semibold">{r.label}</span>
          <b className={`ml-auto whitespace-nowrap ${color[r.tone]}`}>{r.value} ›</b>
        </Link>
      ))}
    </section>
  )
}
