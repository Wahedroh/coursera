import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { baht, type StudentFee } from '../../shared/fees'
import { Card, Chip, ErrorBox, Loading } from '../ui'

export default function StudentFees() {
  const navigate = useNavigate()
  const [items, setItems] = useState<StudentFee[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<StudentFee[]>('/api/student/fees')
      .then(setItems)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])

  const total = items?.reduce((n, f) => n + f.outstanding, 0) ?? 0
  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">ค่าเอกสารเรียน</h1>
        {items && (
          <p className="text-sm opacity-90" data-testid="fee-total">
            {total > 0 ? `ค้างจ่ายรวม ${baht(total)}` : 'ไม่มียอดค้าง 🎉'}
          </p>
        )}
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {!items && !error && <Loading />}
        {items?.length === 0 && <p className="text-sm text-stone-500 text-center py-6">ไม่มีค่าเอกสาร</p>}
        {items?.map((f) => (
          <Card key={f.id} className="p-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">{f.title}</h3>
              <p className="text-xs text-stone-500">
                ยอด {baht(f.amount)} · จ่ายแล้ว {baht(f.paid)}
              </p>
            </div>
            {f.outstanding > 0 ? <Chip tone="red">ค้าง {baht(f.outstanding)}</Chip> : <Chip tone="green">จ่ายครบ</Chip>}
          </Card>
        ))}
      </section>
    </main>
  )
}
