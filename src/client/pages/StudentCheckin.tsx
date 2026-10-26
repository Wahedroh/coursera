import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, ApiClientError, type Me } from '../api'
import { Card, Loading } from '../ui'

export default function StudentCheckin() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const [result, setResult] = useState<{ ok: boolean; text: string; exp?: boolean } | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const dayId = search.get('d') ?? ''
    const token = search.get('t') ?? ''
    api<Me>('/api/me')
      .then(async (me) => {
        if (me.kind !== 'student') return setResult({ ok: false, text: 'หน้านี้สำหรับนักเรียน' })
        const r = await api<{ className: string; date: string; status: string; earnedExp: boolean }>('/api/student/checkin', { body: { dayId, token } })
        const kept = r.status === 'late' ? ' · ครูบันทึกว่ามาสาย' : r.status === 'sick' ? ' · ครูบันทึกว่าป่วย' : r.status === 'leave' ? ' · ครูบันทึกว่าลา' : ''
        setResult({ ok: true, text: `${r.className} · ${r.date}${kept}`, exp: r.earnedExp })
      })
      .catch((e) => {
        if (e instanceof ApiClientError && e.status === 401) navigate(`/?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true })
        else setResult({ ok: false, text: e instanceof ApiClientError ? e.message : 'เช็กชื่อไม่สำเร็จ' })
      })
  }, [search, navigate])

  if (!result) return <Loading />
  return (
    <main className="min-h-screen max-w-md mx-auto p-6 flex flex-col gap-4 justify-center">
      <Card className={`p-6 text-center ${result.ok ? 'bg-board-soft border-green-200' : 'bg-red-50 border-red-200'}`}>
        <p className={`text-2xl font-extrabold ${result.ok ? 'text-board' : 'text-red-700'}`}>{result.ok ? 'เช็กชื่อแล้ว ✓' : 'เช็กชื่อไม่สำเร็จ'}</p>
        <p className="text-sm mt-2">{result.text}</p>
        {result.exp && <p className="text-sm text-board mt-1">+2 EXP</p>}
      </Card>
      <Link to="/me" className="text-center underline text-sm">
        ไปหน้างานของฉัน
      </Link>
    </main>
  )
}
