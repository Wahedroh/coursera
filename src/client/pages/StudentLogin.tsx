import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError, fullName, type Me } from '../api'
import { Button, Card, ErrorBox } from '../ui'

type Found = { title: string | null; firstName: string; lastName: string; className: string }
type Step = { name: 'id' } | { name: 'confirm'; student: Found } | { name: 'set1' } | { name: 'set2'; first: string } | { name: 'pin' }
type Lookup = { status: 'needs_pin'; student: Found } | { status: 'has_pin' }

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

function PinPad({ title, hint, onComplete, busy }: { title: string; hint: string; onComplete: (pin: string) => void; busy: boolean }) {
  const [pin, setPin] = useState('')
  const press = (d: string) => {
    if (busy || pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      setTimeout(() => setPin(''), 150)
      onComplete(next)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-stone-500">{hint}</p>
      </div>
      <div className="flex justify-center gap-3" aria-label={`พิมพ์แล้ว ${pin.length} จาก 4 หลัก`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-14 h-16 rounded-2xl border-2 bg-white flex items-center justify-center text-3xl font-extrabold ${i < pin.length ? 'border-board' : 'border-line'}`}
          >
            {i < pin.length ? '•' : ''}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} className="h-14 rounded-2xl bg-white border-[1.5px] border-line text-2xl font-bold active:bg-stone-100">
            {k}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')} className="h-14 rounded-2xl bg-white border-[1.5px] border-line text-2xl font-bold active:bg-stone-100">
          0
        </button>
        <button type="button" aria-label="ลบ" onClick={() => setPin(pin.slice(0, -1))} className="h-14 rounded-2xl bg-white border-[1.5px] border-line text-xl font-bold active:bg-stone-100">
          ⌫
        </button>
      </div>
    </div>
  )
}

export default function StudentLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ name: 'id' })
  const [zipgradeId, setZipgradeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Me>('/api/me')
      .then((me) => navigate(me.kind === 'student' ? '/me' : '/teacher', { replace: true }))
      .catch(() => {})
  }, [navigate])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  const lookup = () =>
    run(async () => {
      const r = await api<Lookup>('/api/student/lookup', { body: { zipgradeId } })
      setStep(r.status === 'needs_pin' ? { name: 'confirm', student: r.student } : { name: 'pin' })
    })

  const setPin = (pin: string) =>
    run(async () => {
      await api('/api/student/set-pin', { body: { zipgradeId, pin } })
      navigate('/me')
    })

  const login = (pin: string) =>
    run(async () => {
      await api('/api/student/login', { body: { zipgradeId, pin } })
      navigate('/me')
    })

  const back = () => {
    setStep({ name: 'id' })
    setError(null)
  }

  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-8 flex flex-col gap-5">
      <header className="text-center flex flex-col items-center gap-2 pt-4">
        <div className="text-5xl" aria-hidden>
          🦉
        </div>
        <h1 className="text-2xl font-extrabold">ผู้ช่วยครู</h1>
        <p className="text-stone-500 text-sm">ส่งงาน · ดูคะแนน · สะสม EXP</p>
      </header>

      {step.name !== 'id' && (
        <button type="button" onClick={back} className="self-start text-sm text-stone-500">
          ← เปลี่ยนรหัส
        </button>
      )}

      {step.name === 'id' && (
        <Card className="p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (zipgradeId.trim()) lookup()
            }}
            className="flex flex-col gap-3"
          >
            <label htmlFor="zid" className="text-sm font-semibold text-stone-500">
              รหัสนักเรียน (ZipGrade ID)
            </label>
            <input
              id="zid"
              inputMode="numeric"
              autoComplete="off"
              value={zipgradeId}
              onChange={(e) => setZipgradeId(e.target.value)}
              className="w-full border-2 border-line rounded-2xl px-4 py-3 text-xl font-bold tracking-widest bg-white focus:border-board outline-none"
            />
            <p className="text-xs text-stone-500">ดูรหัสได้จากกระดาษคำตอบ ZipGrade หรือถามครู</p>
            <Button type="submit" disabled={busy || !zipgradeId.trim()} className="text-lg">
              ถัดไป →
            </Button>
          </form>
        </Card>
      )}

      {step.name === 'confirm' && (
        <div className="flex flex-col gap-4">
          <Card className="p-4 bg-board-soft border-green-200">
            <p className="text-sm text-stone-500">นี่คือคุณใช่ไหม?</p>
            <p className="text-lg font-extrabold">{fullName(step.student)}</p>
            <p className="text-sm text-board">
              {step.student.className} · รหัส {zipgradeId.trim()}
            </p>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={back}>
              ไม่ใช่
            </Button>
            <Button onClick={() => setStep({ name: 'set1' })}>ใช่ ตั้ง PIN</Button>
          </div>
        </div>
      )}

      {step.name === 'set1' && (
        <PinPad key="set1" title="ตั้ง PIN 4 หลัก" hint="ใช้ PIN นี้ทุกครั้งที่เข้าสู่ระบบ อย่าบอกเพื่อนนะ" busy={busy} onComplete={(p) => setStep({ name: 'set2', first: p })} />
      )}
      {step.name === 'set2' && (
        <PinPad
          key="set2"
          title="พิมพ์ PIN อีกครั้ง"
          hint="เพื่อยืนยันว่าจำได้ถูกต้อง"
          busy={busy}
          onComplete={(p) => {
            if (p !== step.first) {
              setError('PIN ไม่ตรงกัน กรุณาตั้งใหม่')
              setStep({ name: 'set1' })
            } else setPin(p)
          }}
        />
      )}
      {step.name === 'pin' && <PinPad key="pin" title="ใส่ PIN" hint={`รหัส ${zipgradeId.trim()}`} busy={busy} onComplete={login} />}

      <ErrorBox message={error} />

      <p className="text-center text-xs text-stone-500 mt-auto">
        สำหรับครู:{' '}
        <Link to="/teacher/login" className="underline">
          เข้าสู่ระบบครู
        </Link>
      </p>
    </main>
  )
}
