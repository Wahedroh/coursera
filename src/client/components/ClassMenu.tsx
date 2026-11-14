import { Link } from 'react-router'
import type { OverviewKind } from '../../shared/overview'

/** เมนูของห้องเรียน — ใช้ทั้งหน้าห้องและหน้าแรกของครู */
export type MenuEntry = {
  label: string
  kind: OverviewKind
  path: (id: string) => string
  primary?: boolean
  /** หน้าที่ดูรวมทุกห้องได้อยู่แล้ว */
  all?: { label: string; to: string }
  /** ข้อความเมื่อห้องยังไม่มีรายการ */
  empty?: string
}
export const CLASS_MENU: MenuEntry[] = [
  { label: 'ตารางทวงงาน', kind: 'gradebook', empty: 'ยังไม่มีงานเทอมนี้', path: (id) => `/teacher/classes/${id}/gradebook`, primary: true },
  { label: '+ สร้างงาน', kind: 'new-assignment', all: { label: '+ สร้างงาน (เลือกได้หลายห้อง)', to: '/teacher/assignments/new' }, empty: 'ยังไม่มีงานเทอมนี้', path: (id) => `/teacher/assignments/new?classId=${id}` },
  { label: 'เช็กชื่อ', kind: 'attendance', empty: 'ยังไม่ได้เช็กชื่อเทอมนี้', path: (id) => `/teacher/classes/${id}/attendance` },
  { label: 'ผังห้อง & แต้ม', kind: 'seating', path: (id) => `/teacher/classes/${id}/seating` },
  { label: 'คะแนนสอบ', kind: 'scores', empty: 'ยังไม่มีรายการสอบเทอมนี้', path: (id) => `/teacher/classes/${id}/scores` },
  { label: 'เกรด', kind: 'grades', path: (id) => `/teacher/classes/${id}/grades` },
  { label: 'กราฟ', kind: 'insights', all: { label: '📊 เทียบทุกห้อง', to: '/teacher/insights' }, path: (id) => `/teacher/insights?class=${id}` },
  { label: 'ปฏิทิน', kind: 'calendar', all: { label: '📅 ปฏิทินรวมทุกห้อง', to: '/teacher/calendar' }, empty: 'ไม่มีวันสำคัญที่กำลังจะถึง', path: (id) => `/teacher/calendar?class=${id}` },
  { label: 'เกมการ์ด', kind: 'card-game', all: { label: '🃏 ชุดคำถาม & เริ่มเกม', to: '/teacher/card-game' }, empty: 'ยังไม่เคยเล่น', path: (id) => `/teacher/card-game?class=${id}` },
  { label: 'วิเคราะห์รายคน', kind: 'analysis', path: (id) => `/teacher/classes/${id}/analysis` },
  { label: 'ใบสรุปผล', kind: 'report-cards', path: (id) => `/teacher/classes/${id}/report-cards` },
  { label: 'คลิปย้อนหลัง', kind: 'videos', empty: 'ยังไม่มีคลิป', path: (id) => `/teacher/classes/${id}/videos` },
  { label: 'ประกาศ', kind: 'announcements', empty: 'ยังไม่มีประกาศ', path: (id) => `/teacher/classes/${id}/announcements` },
  { label: 'เอกสารเรียน', kind: 'materials', empty: 'ยังไม่มีเอกสาร', path: (id) => `/teacher/classes/${id}/materials` },
  { label: 'ค่าเอกสาร', kind: 'fees', empty: 'ยังไม่มีรายการค่าเอกสาร', path: (id) => `/teacher/classes/${id}/fees` },
]

/** เมนูหน้าแรกครู: แต่ละปุ่มเปิดภาพรวมทุกห้อง (แยกโรงเรียน/ชั้น) */
export function OverviewMenu() {
  return (
    <div className="flex flex-wrap gap-2">
      {CLASS_MENU.map((m) => (
        <Link key={m.label} to={`/teacher/menu/${m.kind}`} className={`rounded-2xl px-4 py-2 font-bold ${m.primary ? 'bg-board text-white' : 'border-2 border-line bg-white'}`}>
          {m.label}
        </Link>
      ))}
    </div>
  )
}

export default function ClassMenu({ classId }: { classId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CLASS_MENU.map((m) => (
        <Link key={m.label} to={m.path(classId)} className={`rounded-2xl px-4 py-2 font-bold ${m.primary ? 'bg-board text-white' : 'border-2 border-line bg-white'}`}>
          {m.label}
        </Link>
      ))}
    </div>
  )
}
