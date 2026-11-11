import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { Card } from '../ui'

/** แจ้งนักเรียนเมื่อครูเปิดให้พิมพ์ใบสรุปผลปลายเทอม */
export default function ReportReadyCard() {
  const [s, setS] = useState<{ available: boolean; term: string | null } | null>(null)
  useEffect(() => {
    api<{ available: boolean; term: string | null }>('/api/student/report-card/status')
      .then(setS)
      .catch(() => {})
  }, [])
  if (!s?.available) return null
  return (
    <Link to="/me/report" className="block" data-testid="report-ready">
      <Card className="p-4 flex items-center gap-3 bg-board-soft border-green-200">
        <span className="text-2xl" aria-hidden>
          📄
        </span>
        <span className="flex-1">
          <b className="block">ใบสรุปผลเทอม {s.term} พร้อมแล้ว</b>
          <span className="text-sm text-stone-600">แตะเพื่อดูและดาวน์โหลด PDF</span>
        </span>
        <span className="font-bold text-board">⬇️</span>
      </Card>
    </Link>
  )
}
