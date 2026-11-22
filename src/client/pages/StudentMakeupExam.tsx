import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiClientError } from '../api'
import { EXAM_LETTERS, type StudentExamPaper } from '../../shared/makeupExam'
import { fileUrl } from '../lib/upload'
import { Button, Card, ErrorBox, Loading } from '../ui'

const DEVICE_KEY = 'exam-device'
let memDevice = ''
/** รหัสเครื่อง (สุ่มครั้งเดียว เก็บในเครื่อง) — สอบต่อได้เฉพาะเครื่องที่เริ่ม */
function deviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_KEY)
    if (!d) {
      d = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, d)
    }
    return d
  } catch {
    return (memDevice ||= crypto.randomUUID())
  }
}
const clock = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Phase = { k: 'loading' } | { k: 'code' } | { k: 'exam'; p: StudentExamPaper } | { k: 'review'; p: StudentExamPaper } | { k: 'done'; msg: string }

/** ห้องสอบย้อนหลังออนไลน์: รหัสเริ่มสอบ · ลายน้ำ · จับเวลา · ตรวจจับการออกจากหน้าจอ · ฝนคำตอบ */
export default function StudentMakeupExam() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>({ k: 'loading' })
  const [answers, setAnswers] = useState<number[]>([])
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const leftAt = useRef<number | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<number[] | null>(null)
  const inExam = phase.k === 'exam' || phase.k === 'review'
  const paper = inExam ? phase.p : null

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiClientError) {
        if (e.status === 401) return navigate('/', { replace: true })
        if (e.code === 'time_up' || (e.code === 'makeup_state' && e.message === 'ส่งคำตอบแล้ว')) return setPhase({ k: 'done', msg: e.message })
      }
      setError((e as Error).message)
    },
    [navigate],
  )
  const open = useCallback((p: StudentExamPaper) => {
    setAnswers(p.answers)
    setPhase({ k: 'exam', p })
  }, [])

  useEffect(() => {
    let live = true
    api<StudentExamPaper>(`/api/student/makeups/${id}/exam`, { headers: { 'x-exam-device': deviceId() } })
      .then((p) => live && open(p))
      .catch((e) => {
        if (!live) return
        if (e instanceof ApiClientError && e.code === 'makeup_state' && e.message !== 'ส่งคำตอบแล้ว') return setPhase({ k: 'code' })
        if (e instanceof ApiClientError && e.code === 'makeup_state') return setPhase({ k: 'done', msg: 'ส่งคำตอบแล้ว' })
        setPhase({ k: 'code' })
        fail(e)
      })
    return () => {
      live = false
    }
  }, [id, open, fail])

  // นาฬิกา
  useEffect(() => {
    if (!inExam) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [inExam])

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const a = pending.current
    if (!a) return
    pending.current = null
    setSaving('saving')
    try {
      await api(`/api/student/makeups/${id}/answers`, { method: 'PUT', body: { answers: a }, headers: { 'x-exam-device': deviceId() } })
      setSaving('saved')
    } catch (e) {
      pending.current ??= a
      setSaving('failed')
      fail(e)
    }
  }, [id, fail])

  function pick(i: number, k: number) {
    const next = answers.map((x, j) => (j === i ? (x === k ? -1 : k) : x))
    setAnswers(next)
    pending.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flush(), 500)
  }

  const submit = useCallback(async () => {
    setError(null)
    try {
      await flush()
      await api(`/api/student/makeups/${id}/submit`, { body: {}, headers: { 'x-exam-device': deviceId() } })
      setPhase({ k: 'done', msg: 'ส่งคำตอบแล้ว รอครูตรวจ' })
    } catch (e) {
      fail(e)
    }
  }, [id, flush, fail])

  // หมดเวลา → ส่งให้
  const ended = paper ? now >= paper.endsAt : false
  useEffect(() => {
    if (ended) void submit()
  }, [ended, submit])

  // ออกจากหน้าจอ (สลับแอป/แท็บ/ล็อกจอ) — ครบ 3 ครั้งระบบส่งคำตอบให้
  useEffect(() => {
    if (!inExam) return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (leftAt.current !== null) return
        leftAt.current = Date.now()
        void fetch(`/api/student/makeups/${id}/event`, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'content-type': 'application/json', 'x-exam-device': deviceId() }, body: JSON.stringify({ kind: 'leave' }) }).catch(() => {})
        return
      }
      const ms = leftAt.current === null ? 0 : Date.now() - leftAt.current
      leftAt.current = null
      api<{ leaves: number; submitted: boolean }>(`/api/student/makeups/${id}/event`, { body: { kind: 'return', ms }, headers: { 'x-exam-device': deviceId() } })
        .then(() => api<StudentExamPaper>(`/api/student/makeups/${id}/exam`, { headers: { 'x-exam-device': deviceId() } }))
        .then((p) => {
          setPhase((ph) => (ph.k === 'exam' || ph.k === 'review' ? { ...ph, p } : ph))
          setWarn(`⚠️ ออกจากหน้าสอบ ${p.leaves}/${p.leaveLimit} ครั้ง — ครบ ${p.leaveLimit} ครั้งระบบส่งคำตอบให้ทันที และครูเห็นทุกครั้ง`)
        })
        .catch(fail)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [inExam, id, fail])

  async function start() {
    setError(null)
    try {
      open(await api<StudentExamPaper>(`/api/student/makeups/${id}/start`, { body: { code, deviceId: deviceId() } }))
    } catch (e) {
      fail(e)
    }
  }

  if (phase.k === 'loading') return <Loading />
  if (phase.k === 'done')
    return (
      <main className="min-h-screen max-w-md mx-auto p-6 flex flex-col gap-4 text-center">
        <p className="text-5xl">✅</p>
        <h1 className="text-xl font-extrabold">{phase.msg}</h1>
        <p className="text-sm text-stone-500">ครูจะตรวจและให้คะแนน — ดูได้ที่หน้าคะแนนสอบ</p>
        <Link to="/me/scores" className="rounded-xl bg-board px-4 py-2 font-bold text-white">
          ไปหน้าคะแนนสอบ
        </Link>
      </main>
    )
  if (phase.k === 'code')
    return (
      <main className="min-h-screen max-w-md mx-auto pb-8">
        <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
          <Link to="/me/scores" className="text-sm opacity-85">
            ← คะแนนสอบ
          </Link>
          <h1 className="text-xl font-extrabold mt-2">📝 สอบย้อนหลัง</h1>
        </header>
        <section className="p-5 flex flex-col gap-3">
          <Card className="p-4 flex flex-col gap-2 text-sm">
            <b>กติกาก่อนเริ่ม</b>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>เริ่มแล้วจับเวลาทันที หมดเวลาระบบส่งคำตอบให้</li>
              <li>สอบได้เฉพาะเครื่องนี้ — เปิดจากเครื่องอื่นจะถูกบันทึก</li>
              <li>
                <b>ออกจากหน้าสอบ (สลับแอป/แท็บ/ล็อกจอ) ครบ 3 ครั้ง ระบบส่งคำตอบให้ทันที</b>
              </li>
              <li>ทุกหน้ามีชื่อของเราเป็นลายน้ำ ครูเห็นบันทึกการสอบทั้งหมด</li>
            </ul>
          </Card>
          <ErrorBox message={error} />
          <label className="text-sm font-semibold">
            รหัสเริ่มสอบ (ขอจากครู)
            <input
              aria-label="รหัสเริ่มสอบ"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              className="mt-1 w-full rounded-xl border-2 border-line bg-white px-3 py-3 text-center text-3xl font-extrabold tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <Button onClick={() => void start()} disabled={code.length !== 6}>
            เริ่มสอบ
          </Button>
        </section>
      </main>
    )

  const p = phase.p
  const left = p.endsAt - now
  const blank = answers.filter((a) => a < 0).length
  const letters = (n: number) => EXAM_LETTERS.slice(0, n)
  return (
    <main className="relative min-h-screen max-w-3xl mx-auto pb-24 select-none" onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      <Watermark text={`${p.studentName} · ${p.zipgradeId} · ${clock.format(now)}`} />
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-board px-4 py-2 text-white shadow">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{p.title}</p>
          <p className="text-xs opacity-85">
            {p.studentName} · ออกจากหน้าจอ {p.leaves}/{p.leaveLimit} · {saving === 'saving' ? 'กำลังบันทึก…' : saving === 'saved' ? 'บันทึกแล้ว ✓' : saving === 'failed' ? 'บันทึกไม่สำเร็จ ลองใหม่…' : ''}
          </p>
        </div>
        <span className={`rounded-xl px-3 py-1 text-xl font-extrabold tabular-nums ${left < 5 * 60_000 ? 'bg-red-600' : 'bg-white/20'}`} data-testid="exam-timer" aria-label="เวลาที่เหลือ">
          {mmss(left)}
        </span>
      </header>
      <section className="relative z-10 flex flex-col gap-3 p-4">
        {warn && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {warn}
          </p>
        )}
        <ErrorBox message={error} />
        {phase.k === 'review' ? (
          <Card className="p-4 flex flex-col gap-3">
            <h2 className="text-lg font-extrabold">ตรวจคำตอบก่อนส่ง</h2>
            <div className="grid grid-cols-5 gap-1.5 text-sm" aria-label="สรุปคำตอบ">
              {answers.map((a, i) => (
                <button key={i} type="button" onClick={() => setPhase({ k: 'exam', p })} className={`rounded-lg px-1.5 py-1 font-bold ${a < 0 ? 'bg-red-100 text-red-700' : 'bg-board-soft text-board'}`}>
                  {i + 1}. {a < 0 ? '–' : EXAM_LETTERS[a]}
                </button>
              ))}
            </div>
            {blank > 0 && <p className="text-sm font-bold text-red-700">ยังไม่ได้ตอบ {blank} ข้อ (กดเพื่อกลับไปแก้)</p>}
            <div className="flex gap-2">
              <Button onClick={() => void submit()}>ยืนยันส่งคำตอบ</Button>
              <Button variant="ghost" onClick={() => setPhase({ k: 'exam', p })}>
                กลับไปแก้
              </Button>
            </div>
            <p className="text-xs text-stone-500">ส่งแล้วแก้ไม่ได้ · ระบบฝนกระดาษคำตอบ ZipGrade ให้ครูอัตโนมัติ</p>
          </Card>
        ) : (
          <>
            {p.kind === 'typed' ? (
              p.questions.map((q, i) => (
                <div key={i} data-testid="exam-q">
                <Card className="p-4 flex flex-col gap-2">
                  <p className="font-semibold whitespace-pre-wrap">
                    {i + 1}. {q.q}
                  </p>
                  {q.image && <img src={fileUrl(q.image)} alt={`รูปข้อ ${i + 1}`} className="max-h-72 self-start rounded border border-line" draggable={false} />}
                  <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={`ข้อ ${i + 1}`}>
                    {q.choices.map((c, k) => (
                      <button key={k} type="button" role="radio" aria-checked={answers[i] === k} onClick={() => pick(i, k)} className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-left ${answers[i] === k ? 'border-board bg-board-soft' : 'border-line bg-white'}`}>
                        <b className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${answers[i] === k ? 'border-board bg-board text-white' : 'border-line'}`}>{EXAM_LETTERS[k]}</b>
                        <span>{c}</span>
                      </button>
                    ))}
                  </div>
                </Card>
                </div>
              ))
            ) : (
              <>
                {p.pageKeys.map((k, i) => (
                  <div key={k} className="relative">
                    <img src={fileUrl(k)} alt={`ข้อสอบหน้า ${i + 1}`} className="w-full rounded border border-line" draggable={false} />
                    <Watermark text={`${p.studentName} · ${p.zipgradeId}`} inline />
                  </div>
                ))}
                <Card className="p-4">
                  <h2 className="mb-2 font-bold">กระดาษคำตอบ</h2>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {answers.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5" role="radiogroup" aria-label={`ข้อ ${i + 1}`}>
                        <b className="w-7 text-right text-sm">{i + 1}</b>
                        {letters(p.choiceCount).map((l, k) => (
                          <button key={l} type="button" role="radio" aria-checked={a === k} aria-label={`ข้อ ${i + 1} ${l}`} onClick={() => pick(i, k)} className={`h-8 w-8 rounded-full border-2 text-xs font-bold ${a === k ? 'border-board bg-board text-white' : 'border-line bg-white'}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3">
              <div className="mx-auto flex max-w-3xl items-center gap-2">
                <span className="flex-1 text-sm">
                  ตอบแล้ว {answers.length - blank}/{answers.length}
                </span>
                <Button onClick={() => (void flush(), setPhase({ k: 'review', p }))}>ตรวจคำตอบก่อนส่ง →</Button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

/** ลายน้ำชื่อ-รหัส-เวลา ทับทั้งหน้า (จับภาพหน้าจอไปส่งต่อก็รู้ว่าเป็นของใคร) */
function Watermark({ text, inline }: { text: string; inline?: boolean }) {
  return (
    <div aria-hidden className={`pointer-events-none ${inline ? 'absolute' : 'fixed'} inset-0 z-30 overflow-hidden`} data-testid="watermark">
      <div className="absolute -inset-1/2 flex rotate-[-25deg] flex-wrap content-start gap-x-16 gap-y-20 opacity-[0.09]">
        {Array.from({ length: inline ? 40 : 80 }, (_, i) => (
          <span key={i} className="whitespace-nowrap text-lg font-extrabold text-stone-900">
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}
