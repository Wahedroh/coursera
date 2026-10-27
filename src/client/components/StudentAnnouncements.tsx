import { useEffect, useState } from 'react'
import { api } from '../api'
import type { StudentAnnouncement } from '../../shared/announcements'
import { Card } from '../ui'

/** ประกาศของครูที่หน้าแรกนักเรียน: ยังไม่อ่านขึ้นเด่นพร้อมปุ่ม "รับทราบ" · อ่านแล้วย่อเหลือหัวข้อ แตะเพื่อเปิดอ่าน */
export default function StudentAnnouncements() {
  const [items, setItems] = useState<StudentAnnouncement[]>([])
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    api<StudentAnnouncement[]>('/api/student/announcements')
      .then(setItems)
      .catch(() => {})
  }, [])

  async function ack(id: string) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: true } : x)))
    await api(`/api/student/announcements/${id}/read`, { body: {} }).catch(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: false } : x))))
  }

  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2" aria-label="ประกาศจากครู">
      {items.map((a) =>
        a.read ? (
          <button key={a.id} type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="text-left">
            <Card className="px-3 py-2 text-sm">
              <span className="text-stone-500">📢 {a.pinned && '📌 '}</span>
              <b>{a.title}</b>
              {open === a.id && a.body && <p className="mt-1 whitespace-pre-line text-stone-600">{a.body}</p>}
            </Card>
          </button>
        ) : (
          <Card key={a.id} className="p-3 bg-sky-50 border-sky-200 flex flex-col gap-1">
            <p className="text-xs font-semibold text-sky-700">📢 ประกาศจากครู {a.pinned && '· 📌'}</p>
            <p className="font-bold">{a.title}</p>
            {a.body && <p className="text-sm whitespace-pre-line">{a.body}</p>}
            <button type="button" onClick={() => void ack(a.id)} className="self-end rounded-xl bg-sky-600 text-white px-4 py-1.5 text-sm font-bold">
              รับทราบ
            </button>
          </Card>
        ),
      )}
    </div>
  )
}
