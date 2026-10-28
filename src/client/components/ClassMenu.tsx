import { Link } from 'react-router'

/** เมนูของห้องเรียน — ใช้ทั้งหน้าห้องและหน้าแรกของครู */
export const CLASS_MENU: { label: string; path: (id: string) => string; primary?: boolean }[] = [
  { label: 'ตารางทวงงาน', path: (id) => `/teacher/classes/${id}/gradebook`, primary: true },
  { label: '+ สร้างงาน', path: (id) => `/teacher/assignments/new?classId=${id}` },
  { label: 'เช็กชื่อ', path: (id) => `/teacher/classes/${id}/attendance` },
  { label: 'ผังห้อง & แต้ม', path: (id) => `/teacher/classes/${id}/seating` },
  { label: 'คะแนนสอบ', path: (id) => `/teacher/classes/${id}/scores` },
  { label: 'เกรด', path: (id) => `/teacher/classes/${id}/grades` },
  { label: 'คลิปย้อนหลัง', path: (id) => `/teacher/classes/${id}/videos` },
  { label: 'ประกาศ', path: (id) => `/teacher/classes/${id}/announcements` },
  { label: 'เอกสารเรียน', path: (id) => `/teacher/classes/${id}/materials` },
  { label: 'ค่าเอกสาร', path: (id) => `/teacher/classes/${id}/fees` },
]

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
