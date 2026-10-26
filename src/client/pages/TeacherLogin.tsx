import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { Button, Card, ErrorBox } from '../ui'

export default function TeacherLogin() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/teacher/login', { body: { password } })
      navigate('/teacher', { replace: true })
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <Card className="p-6 w-full max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <h1 className="text-xl font-extrabold">🦉 เข้าสู่ระบบครู</h1>
          <label htmlFor="pw" className="text-sm font-semibold text-stone-500">
            รหัสผ่านครู
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border-2 border-line rounded-2xl px-4 py-3 bg-white focus:border-board outline-none"
          />
          <ErrorBox message={error} />
          <Button type="submit" disabled={busy || !password}>
            เข้าสู่ระบบ
          </Button>
        </form>
      </Card>
    </main>
  )
}
