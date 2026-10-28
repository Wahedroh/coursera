import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { api } from '../api'

const NAV = [
  { to: '/teacher', label: 'หน้าแรก', end: true },
  { to: '/teacher/assignments/new', label: 'สร้างงาน', end: false },
  { to: '/teacher/watchlist', label: 'ติดตามนักเรียน', end: false },
  { to: '/teacher/export', label: 'ส่งออกข้อมูล', end: false },
  { to: '/teacher/import', label: 'นำเข้ารายชื่อ', end: false },
  { to: '/teacher/storage', label: 'พื้นที่ไฟล์', end: false },
]

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  async function logout() {
    await api('/api/logout', { body: {} }).catch(() => {})
    navigate('/teacher/login', { replace: true })
  }
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-board text-green-50 md:w-56 md:min-h-screen px-4 py-3 md:py-6 flex flex-wrap md:flex-nowrap md:flex-col items-center md:items-stretch gap-x-1 gap-y-1 md:gap-2">
        <Link to="/teacher" className="font-extrabold text-white text-lg md:mb-4 md:px-2 mr-auto md:mr-0 whitespace-nowrap">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-white p-1 shrink-0">
              <img src="/logo.png" alt="" className="max-w-full max-h-full" />
            </span>
            ผู้ช่วยครู
          </span>
        </Link>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `rounded-xl px-2.5 md:px-3 py-2 text-sm font-semibold whitespace-nowrap ${isActive ? 'bg-white/15 text-white' : 'text-green-100'}`}
          >
            {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={logout} className="md:mt-auto text-xs text-green-100/80 px-2 md:px-3 py-2 text-left whitespace-nowrap">
          ออกจากระบบ
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-7 flex flex-col gap-4 min-w-0">{children}</main>
    </div>
  )
}
