import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../api'
import type { LiveSessionSummary, LiveStatus } from '../../shared/live'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

export const STATUS_CHIP: Record<LiveStatus, { label: string; tone: 'gray' | 'red' | 'green' }> = {
  draft: { label: 'เตรียมไว้', tone: 'gray' },
  live: { label: '🔴 กำลังไลฟ์', tone: 'red' },
  ended: { label: 'จบแล้ว', tone: 'green' },
}

export default function TeacherLiveList() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const handle = useTeacherErrorHandler()
  const [items, setItems] = useState<LiveSessionSummary[] | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<LiveSessionSummary[]>(`/api/teacher/classes/${id}/live`).then(setItems).catch((e) => setError(handle(e)))
  }, [id, handle])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    try {
      const { id: liveId } = await api<{ id: string }>(`/api/teacher/classes/${id}/live`, { body: { title } })
      navigate(`/teacher/live/${liveId}`)
    } catch (err) {
      setError(handle(err))
    }
  }

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← หน้าห้อง
      </Link>
      <h1 className="text-2xl font-extrabold">ไลฟ์หน้าห้อง</h1>
      <ErrorBox message={error} />
      <Card className="p-4">
        <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
          <input
            aria-label="ชื่อไลฟ์"
            className="flex-1 border-2 border-line rounded-xl px-3 py-2 bg-white"
            required
            maxLength={200}
            placeholder="เช่น ทบทวนบทที่ 3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit">+ สร้างไลฟ์</Button>
        </form>
      </Card>
      {!items && !error && <Loading />}
      {items?.length === 0 && <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีไลฟ์ในห้องนี้</Card>}
      {items && items.length > 0 && (
        <Card className="divide-y divide-stone-100">
          {items.map((l) => (
            <Link key={l.id} to={`/teacher/live/${l.id}`} className="flex items-center justify-between gap-2 p-3 hover:bg-stone-50">
              <span>
                <span className="font-bold">{l.title}</span>
                <span className="block text-xs text-stone-500">{l.activityCount} กิจกรรม</span>
              </span>
              <Chip tone={STATUS_CHIP[l.status].tone}>{STATUS_CHIP[l.status].label}</Chip>
            </Link>
          ))}
        </Card>
      )}
    </TeacherLayout>
  )
}
