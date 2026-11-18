import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { api } from '../api'
import Icon, { type IconName } from '../components/Icon'
import IconCredit from '../components/IconCredit'

const NAV: { to: string; label: string; icon: IconName; end: boolean }[] = [
  { to: '/teacher', label: 'หน้าแรก', icon: 'home', end: true },
  { to: '/teacher/timetable', label: 'ตารางสอน', icon: 'planner', end: false },
  { to: '/teacher/route', label: 'เส้นทาง & ปิดโรงเรียน', icon: 'compass', end: false },
  { to: '/teacher/workload', label: 'ภาระสอน & เดินทาง', icon: 'chart', end: false },
  { to: '/teacher/assignments/new', label: 'สร้างงาน', icon: 'task', end: false },
  { to: '/teacher/scheduled', label: 'รอเผยแพร่', icon: 'alarm', end: false },
  { to: '/teacher/library', label: 'คลังของครู', icon: 'books', end: false },
  { to: '/teacher/watchlist', label: 'ติดตามนักเรียน', icon: 'watch', end: false },
  { to: '/teacher/calendar', label: 'ปฏิทิน', icon: 'calendar', end: false },
  { to: '/teacher/card-game', label: 'เกมการ์ด QR', icon: 'cards', end: false },
  { to: '/teacher/insights', label: 'กราฟห้องเรียน', icon: 'trend', end: false },
  { to: '/teacher/export', label: 'ส่งออกข้อมูล', icon: 'download', end: false },
  { to: '/teacher/import', label: 'นำเข้ารายชื่อ', icon: 'import', end: false },
  { to: '/teacher/storage', label: 'พื้นที่ไฟล์', icon: 'folder', end: false },
]

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  async function logout() {
    await api('/api/logout', { body: {} }).catch(() => {})
    navigate('/teacher/login', { replace: true })
  }
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print bg-board text-green-50 md:w-56 md:min-h-screen px-4 py-3 md:py-6 flex flex-wrap md:flex-nowrap md:flex-col items-center md:items-stretch gap-x-1 gap-y-1 md:gap-2">
        <Link to="/teacher" className="font-extrabold text-white text-lg md:mb-4 md:px-2 mr-auto md:mr-0 whitespace-nowrap">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-white p-1 shrink-0">
              <img src="/logo.png" alt="" className="max-w-full max-h-full" />
            </span>
            ผู้ช่วยครู
          </span>
        </Link>
        <TeacherBell />
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `rounded-xl px-2.5 md:px-3 py-2 text-sm font-semibold whitespace-nowrap ${isActive ? 'bg-white/15 text-white' : 'text-green-100'}`}
          >
            <Icon n={n.icon} /> {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={logout} className="md:mt-auto text-xs text-green-100/80 px-2 md:px-3 py-2 text-left whitespace-nowrap">
          <Icon n="logout" /> ออกจากระบบ
        </button>
        <IconCredit className="hidden md:block px-3 text-green-100/60" />
      </aside>
      <main className="flex-1 p-4 md:p-7 flex flex-col gap-4 min-w-0">{children}</main>
    </div>
  )
}

/** กระดิ่งแจ้งเตือนของครู (จำนวนที่ยังไม่อ่าน) */
function TeacherBell() {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    const load = () =>
      api<{ unread: number }>('/api/teacher/notifications')
        .then((r) => setUnread(r.unread))
        .catch(() => {})
    load()
    const id = window.setInterval(load, 120_000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <NavLink
      to="/teacher/notifications"
      aria-label={unread ? `แจ้งเตือน ${unread} รายการใหม่` : 'แจ้งเตือน'}
      className={({ isActive }) => `relative rounded-xl px-2.5 md:px-3 py-2 text-sm font-semibold whitespace-nowrap ${isActive ? 'bg-white/15 text-white' : 'text-green-100'}`}
    >
      <Icon n="bell" /> แจ้งเตือน
      {unread > 0 && <span className="ml-1.5 inline-block rounded-full bg-red-500 text-white px-1.5 text-xs font-extrabold">{unread}</span>}
    </NavLink>
  )
}
