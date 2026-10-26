import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type Me } from '../api'
import { Button, Card, Loading } from '../ui'

type StudentMe = Extract<Me, { kind: 'student' }>

export default function StudentHome() {
  const navigate = useNavigate()
  const [me, setMe] = useState<StudentMe | null>(null)

  useEffect(() => {
    api<Me>('/api/me')
      .then((m) => (m.kind === 'student' ? setMe(m) : navigate('/teacher', { replace: true })))
      .catch(() => navigate('/', { replace: true }))
  }, [navigate])

  async function logout() {
    await api('/api/logout', { body: {} }).catch(() => {})
    navigate('/', { replace: true })
  }

  if (!me) return <Loading />
  const s = me.student
  return (
    <main className="min-h-screen max-w-md mx-auto">
      <header className="bg-board text-white px-5 pt-6 pb-6 rounded-b-3xl">
        <h1 className="text-xl font-extrabold">สวัสดี {s.firstName} 👋</h1>
        <p className="text-sm opacity-85">
          {s.className} · รหัส {s.zipgradeId}
        </p>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <Card className="p-5 text-center">
          <h2 className="font-bold">งานของฉัน</h2>
          <p className="text-sm text-stone-500">เร็ว ๆ นี้ — ครูกำลังเตรียมระบบส่งงาน</p>
        </Card>
        <Button variant="ghost" onClick={logout}>
          ออกจากระบบ
        </Button>
      </section>
    </main>
  )
}
