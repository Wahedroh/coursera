import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import type { NotificationInbox } from '../../shared/push'

function ago(t: number): string {
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (m < 1) return 'เมื่อสักครู่'
  if (m < 60) return `${m} นาทีที่แล้ว`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`
  return `${Math.round(h / 24)} วันที่แล้ว`
}

/** กระดิ่งแจ้งเตือนบนหน้าแรกนักเรียน: งานใหม่ · ประกาศ · ครูส่งงานกลับ · งานใกล้ครบกำหนด (14 วันล่าสุด) */
export default function NotificationBell() {
  const [box, setBox] = useState<NotificationInbox | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    api<NotificationInbox>('/api/student/push/notifications')
      .then(setBox)
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && box?.unread) {
      api('/api/student/push/notifications/read', { body: {} }).catch(() => {})
      // ยังแสดงจุดใหม่ในรายการรอบนี้ แต่ตัวเลขบนกระดิ่งหายไป
      setBox({ ...box, unread: 0 })
    }
    if (!next) load()
  }

  const unread = box?.unread ?? 0
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : 'การแจ้งเตือน'}
        aria-expanded={open}
        className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-xl"
        data-testid="notice-bell"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-extrabold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={toggle}>
          <section
            role="dialog"
            aria-label="การแจ้งเตือน"
            className="absolute top-0 inset-x-0 mx-auto max-w-md bg-white rounded-b-3xl shadow-xl text-stone-900 max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            data-testid="notice-panel"
          >
            <header className="flex justify-between items-center px-5 pt-4 pb-2">
              <h2 className="font-extrabold text-lg">🔔 การแจ้งเตือน</h2>
              <button type="button" onClick={toggle} className="text-sm text-stone-500 px-2 py-1">
                ปิด
              </button>
            </header>
            <div className="overflow-y-auto px-3 pb-4">
              {!box?.items.length && <p className="text-sm text-stone-500 text-center py-8">ยังไม่มีการแจ้งเตือนใน 14 วันที่ผ่านมา</p>}
              {box?.items.map((n) => (
                <Link key={n.id} to={n.url} onClick={() => setOpen(false)} className={`flex gap-3 rounded-2xl px-3 py-2.5 ${n.read ? '' : 'bg-amber-50'}`}>
                  <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-red-500'}`} aria-hidden />
                  <span className="min-w-0">
                    <b className="block text-sm">{n.title}</b>
                    {n.body && <span className="block text-sm text-stone-600 line-clamp-2">{n.body}</span>}
                    <span className="block text-xs text-stone-400 mt-0.5">{ago(n.createdAt)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
