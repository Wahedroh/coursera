import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { CATEGORY_LABEL, type StudentScore } from '../../shared/scores'
import { formatDate } from '../lib/format'
import { Card, Chip, ErrorBox, Loading } from '../ui'

export default function StudentScores() {
  const navigate = useNavigate()
  const [items, setItems] = useState<StudentScore[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<StudentScore[]>('/api/student/scores')
      .then(setItems)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">คะแนนสอบ</h1>
        <p className="text-sm opacity-85">เห็นเฉพาะคะแนนของตัวเอง</p>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {!items && !error && <Loading />}
        {items?.length === 0 && <p className="text-sm text-stone-500 text-center py-6">ยังไม่มีคะแนนที่ครูเผยแพร่</p>}
        {items?.map((s) => (
          <Card key={s.id} className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex gap-2 items-center">
                <Chip tone={s.category === 'quiz' ? 'gray' : 'blue'}>{CATEGORY_LABEL[s.category]}</Chip>
                <span className="text-xs text-stone-500">{formatDate(s.takenOn)}</span>
              </div>
              <h3 className="font-bold mt-1">{s.title}</h3>
              {s.note && <p className="text-sm text-stone-500">“{s.note}”</p>}
            </div>
            <div className="text-right shrink-0" data-testid="my-score">
              {s.absent ? (
                <Chip tone="red">ขาดสอบ</Chip>
              ) : s.score === null ? (
                <span className="text-sm text-stone-400">ยังไม่มีคะแนน</span>
              ) : (
                <span className="text-2xl font-extrabold text-board">
                  {s.score}
                  <span className="text-sm font-semibold text-stone-500">/{s.maxScore}</span>
                </span>
              )}
            </div>
          </Card>
        ))}
      </section>
    </main>
  )
}
