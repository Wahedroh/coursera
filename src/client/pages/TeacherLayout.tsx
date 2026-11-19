import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
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

/** จำนวนแจ้งเตือนที่ยังไม่อ่าน + ใบลารออนุมัติ (โหลดซ้ำทุก 2 นาที) */
function useBadges() {
  const [b, setB] = useState({ unread: 0, leaves: 0 })
  useEffect(() => {
    const load = () => {
      api<{ unread: number }>('/api/teacher/notifications')
        .then((r) => setB((x) => ({ ...x, unread: r.unread })))
        .catch(() => {})
      api<{ pending: number }>('/api/teacher/leaves/count')
        .then((r) => setB((x) => ({ ...x, leaves: r.pending })))
        .catch(() => {})
    }
    load()
    const id = window.setInterval(load, 120_000)
    return () => window.clearInterval(id)
  }, [])
  return b
}

const side = ({ isActive }: { isActive: boolean }) => `relative rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap ${isActive ? 'bg-white/15 text-white' : 'text-green-100'}`
const Count = ({ n, tone }: { n: number; tone: 'red' | 'amber' }) =>
  n > 0 ? <span className={`ml-1.5 inline-block rounded-full px-1.5 text-xs font-extrabold ${tone === 'red' ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'}`}>{n}</span> : null

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const badges = useBadges()
  const [menu, setMenu] = useState(false)
  async function logout() {
    await api('/api/logout', { body: {} }).catch(() => {})
    navigate('/teacher/login', { replace: true })
  }
  const links = (
    <>
      <NavLink to="/teacher/notifications" aria-label={badges.unread ? `แจ้งเตือน ${badges.unread} รายการใหม่` : 'แจ้งเตือน'} className={side}>
        <Icon n="bell" /> แจ้งเตือน
        <Count n={badges.unread} tone="red" />
      </NavLink>
      <NavLink to="/teacher/leaves" aria-label={badges.leaves ? `ใบลา ${badges.leaves} รายการรออนุมัติ` : 'ใบลา'} className={side}>
        <Icon n="doc" /> ใบลา
        <Count n={badges.leaves} tone="amber" />
      </NavLink>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={side}>
          <Icon n={n.icon} /> {n.label}
        </NavLink>
      ))}
    </>
  )
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print bg-board text-green-50 md:w-56 md:min-h-screen px-4 py-3 md:py-6 flex md:flex-col items-center md:items-stretch gap-2">
        <Link to="/teacher" className="font-extrabold text-white text-lg md:mb-4 md:px-2 mr-auto md:mr-0 whitespace-nowrap">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-white p-1 shrink-0">
              <img src="/logo.png" alt="" className="max-w-full max-h-full" />
            </span>
            ผู้ช่วยครู
          </span>
        </Link>
        {/* มือถือ: เมนูอยู่ที่แถบล่าง · จอใหญ่: เมนูข้าง */}
        <nav aria-label="เมนูหลัก" className="hidden md:flex md:flex-col md:gap-2">
          {links}
        </nav>
        <button type="button" onClick={logout} className="hidden md:block md:mt-auto text-xs text-green-100/80 px-3 py-2 text-left whitespace-nowrap">
          <Icon n="logout" /> ออกจากระบบ
        </button>
        <IconCredit className="hidden md:block px-3 text-green-100/60" />
      </aside>
      <main className="flex-1 p-4 pb-28 md:p-7 flex flex-col gap-4 min-w-0">{children}</main>
      <BottomBar unread={badges.unread} leaves={badges.leaves} onMenu={() => setMenu(true)} />
      {menu && (
        <div className="no-print md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMenu(false)}>
          <div role="dialog" aria-label="เมนูทั้งหมด" className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-board p-4 pb-8 text-green-50" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/30" />
            <nav aria-label="เมนูครู (มือถือ)" className="grid grid-cols-2 gap-1" onClick={() => setMenu(false)}>
              {links}
            </nav>
            <button type="button" onClick={logout} className="mt-3 text-sm text-green-100/80 px-3 py-2">
              <Icon n="logout" /> ออกจากระบบ
            </button>
            <IconCredit className="px-3 text-green-100/60" />
          </div>
        </div>
      )}
    </div>
  )
}

/** แถบเมนูล่างบนมือถือ (แคปซูล): หน้าแรก · ห้องเรียน · แจ้งเตือน · เมนู */
function BottomBar({ unread, leaves, onMenu }: { unread: number; leaves: number; onMenu: () => void }) {
  const { pathname } = useLocation()
  const tab = (on: boolean) => `relative flex h-12 flex-col items-center justify-center rounded-3xl text-[11px] font-semibold transition-all ${on ? 'w-24 bg-board text-white' : 'w-16 text-stone-600'}`
  const inClass = pathname.startsWith('/teacher/classes') || pathname.startsWith('/teacher/menu')
  return (
    <nav aria-label="แถบเมนูล่าง" className="no-print md:hidden fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-[1.75rem] bg-white p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.15)]">
      <Link to="/teacher" className={tab(pathname === '/teacher')}>
        <Icon n="home" className="text-xl" />
        หน้าแรก
      </Link>
      <Link to="/teacher/menu/gradebook" className={tab(inClass)}>
        <Icon n="books" className="text-xl" />
        ห้องเรียน
      </Link>
      <Link to="/teacher/notifications" aria-label={unread ? `แจ้งเตือน ${unread} รายการใหม่` : 'แจ้งเตือน'} className={tab(pathname === '/teacher/notifications')}>
        <Icon n="bell" className="text-xl" />
        แจ้งเตือน
        {unread > 0 && <span className="absolute right-2 top-0.5 rounded-full bg-red-500 px-1.5 text-[10px] font-extrabold text-white">{unread}</span>}
      </Link>
      <button type="button" onClick={onMenu} className={tab(false)} aria-label={leaves ? `เมนูทั้งหมด (ใบลารอ ${leaves})` : 'เมนูทั้งหมด'}>
        <Icon n="settings" className="text-xl" />
        เมนู
        {leaves > 0 && <span className="absolute right-3 top-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-extrabold text-amber-950">{leaves}</span>}
      </button>
    </nav>
  )
}
