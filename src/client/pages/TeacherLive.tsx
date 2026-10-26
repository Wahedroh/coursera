import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import LiveResults from '../components/LiveResults'
import { KIND_LABEL, LIVE_KINDS, OPTION_COLORS, OPTION_SYMBOLS, type LiveKind, type TeacherLiveState } from '../../shared/live'
import { useCountdown, useLive } from '../lib/useLive'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { STATUS_CHIP } from './TeacherLiveList'
import { useTeacherErrorHandler } from './useTeacherGuard'

const input = 'w-full border-2 border-line rounded-xl px-3 py-2 bg-white'
const btn = 'rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold disabled:opacity-40'

export default function TeacherLive() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => api<TeacherLiveState>(`/api/teacher/live/${id}`), [id])
  const { state, setState, connected, offset } = useLive(id, load, (e) => setError(handle(e)))
  const left = useCountdown(state?.current?.activity.deadline ?? null, offset)

  async function act(path: string, body: unknown = {}, method = 'POST') {
    try {
      setState(await api<TeacherLiveState>(path, { method, body }))
      setError(null)
    } catch (e) {
      setError(handle(e))
    }
  }
  const ctl = (p: string, body: unknown = {}) => act(`/api/teacher/live/${id}${p}`, body)

  if (!state) return <TeacherLayout>{error ? <ErrorBox message={error} /> : <Loading />}</TeacherLayout>
  const { session, activities, current } = state
  const live = session.status === 'live'
  const idx = current?.activity.index ?? -1

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${session.classId}/live`} className="text-sm text-stone-500">
        ← ไลฟ์ · {session.className}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{session.title}</h1>
          <div className="flex gap-2 items-center mt-1">
            <Chip tone={STATUS_CHIP[session.status].tone}>{STATUS_CHIP[session.status].label}</Chip>
            {!connected && <span className="text-xs text-amber-700">กำลังเชื่อมต่อ…</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/live/${id}/screen`} target="_blank" rel="noreferrer" className={btn}>
            🖥 เปิดจอโปรเจกเตอร์
          </a>
          {session.status === 'draft' && (
            <Button onClick={() => ctl('/start')} disabled={activities.length === 0}>
              ▶ เริ่มไลฟ์
            </Button>
          )}
          {live && (
            <Button variant="danger" onClick={() => window.confirm('จบไลฟ์? นักเรียนจะตอบต่อไม่ได้') && ctl('/end')}>
              จบไลฟ์
            </Button>
          )}
        </div>
      </div>
      <ErrorBox message={error} />

      {live && current && (
        <Card className="p-4 flex flex-col gap-3 border-board">
          <div className="flex flex-wrap justify-between gap-2 items-center">
            <span className="text-sm text-stone-500">
              กิจกรรม {idx + 1}/{activities.length} · {KIND_LABEL[current.activity.kind]}
              {left !== null && current.activity.accepting && <b className="ml-2 text-red-600">เหลือ {left} วิ</b>}
            </span>
            <span className="font-bold" data-testid="response-count">
              ตอบแล้ว {current.responseCount}/{current.total}
            </span>
          </div>
          <h2 className="text-xl font-extrabold">{current.activity.prompt}</h2>
          <LiveResults results={current.results} options={current.activity.options} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={idx <= 0} onClick={() => ctl('/goto', { index: idx - 1 })}>
              ◀ ก่อนหน้า
            </button>
            <button type="button" className={btn} disabled={idx >= activities.length - 1} onClick={() => ctl('/goto', { index: idx + 1 })}>
              ถัดไป ▶
            </button>
            <button type="button" className={btn} onClick={() => ctl('/accepting', { open: !current.activity.accepting })}>
              {current.activity.accepting ? '⏹ ปิดรับคำตอบ' : '↺ เปิดรับคำตอบ'}
            </button>
            <button
              type="button"
              aria-pressed={current.activity.showResults}
              className={`rounded-2xl px-4 py-2 font-bold ${current.activity.showResults ? 'bg-board text-white' : 'border-2 border-line bg-white'}`}
              onClick={() => ctl('/show-results', { show: !current.activity.showResults })}
            >
              {current.activity.showResults ? '🙈 ซ่อนผล' : '📊 แสดงผลบนจอ'}
            </button>
          </div>
        </Card>
      )}

      <Card className="divide-y divide-stone-100">
        {activities.length === 0 && <p className="p-4 text-sm text-stone-500">ยังไม่มีกิจกรรม เพิ่มด้านล่าง</p>}
        {activities.map((a, i) => (
          <div key={a.id} className={`flex flex-wrap items-center gap-2 p-3 ${i === idx ? 'bg-board-soft' : ''}`}>
            <span className="w-6 text-stone-400">{i + 1}</span>
            <Chip tone={a.kind === 'quiz' ? 'purple' : a.kind === 'poll' ? 'blue' : 'gray'}>{KIND_LABEL[a.kind]}</Chip>
            <span className="flex-1 min-w-40">
              {a.prompt}
              {(a.kind === 'poll' || a.kind === 'quiz') && (
                <span className="block text-xs text-stone-500">
                  {a.options.map((o, k) => `${OPTION_SYMBOLS[k]} ${o}${a.kind === 'quiz' && a.correct === k ? ' ✓' : ''}`).join('  ')}
                  {a.kind === 'quiz' && ` · ${a.seconds} วิ`}
                </span>
              )}
            </span>
            <span className="text-xs text-stone-500">{a.responseCount} คำตอบ</span>
            {live && i !== idx && (
              <button type="button" className="rounded-lg bg-board text-white px-2 py-1 text-xs font-bold" onClick={() => ctl('/goto', { index: i })}>
                เปิดข้อนี้
              </button>
            )}
            <span className="flex gap-1">
              <button type="button" aria-label="เลื่อนขึ้น" className="rounded-lg border border-line px-2 py-1 text-xs" disabled={i === 0} onClick={() => act(`/api/teacher/live/activities/${a.id}/move`, { dir: -1 })}>
                ↑
              </button>
              <button type="button" aria-label="เลื่อนลง" className="rounded-lg border border-line px-2 py-1 text-xs" disabled={i === activities.length - 1} onClick={() => act(`/api/teacher/live/activities/${a.id}/move`, { dir: 1 })}>
                ↓
              </button>
              {a.responseCount === 0 && (
                <button type="button" aria-label="ลบกิจกรรม" className="rounded-lg border border-red-200 text-red-700 px-2 py-1 text-xs" onClick={() => window.confirm('ลบกิจกรรมนี้?') && act(`/api/teacher/live/activities/${a.id}`, undefined, 'DELETE')}>
                  ลบ
                </button>
              )}
            </span>
          </div>
        ))}
      </Card>

      {session.status !== 'ended' && <AddActivity onAdd={(body) => ctl('/activities', body)} />}
    </TeacherLayout>
  )
}

function AddActivity({ onAdd }: { onAdd: (body: unknown) => Promise<void> }) {
  const [kind, setKind] = useState<LiveKind>('poll')
  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [correct, setCorrect] = useState(0)
  const [seconds, setSeconds] = useState(20)
  const hasOptions = kind === 'poll' || kind === 'quiz'
  const maxOptions = kind === 'quiz' ? 4 : 6

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const opts = options.map((o) => o.trim()).filter(Boolean)
    const body = hasOptions ? { kind, prompt, options: opts, ...(kind === 'quiz' ? { correct: Math.min(correct, opts.length - 1), seconds } : {}) } : { kind, prompt }
    await onAdd(body)
    setPrompt('')
    setOptions(['', ''])
    setCorrect(0)
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="font-bold">+ เพิ่มกิจกรรม</h2>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="ชนิดกิจกรรม">
          {LIVE_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); if (k === 'quiz') setOptions((os) => os.slice(0, 4)) }} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${kind === k ? 'bg-board text-white' : 'bg-stone-100 text-stone-600'}`}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="text-sm font-semibold">
          {kind === 'quiz' ? 'คำถาม' : kind === 'wordcloud' ? 'คำถาม (ตอบเป็นคำสั้น ๆ)' : kind === 'checkin' ? 'คำถามเช็กอิน' : 'คำถามโพล'}
          <input className={input} required maxLength={300} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        {hasOptions && (
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-center font-bold" style={{ color: OPTION_COLORS[i] }}>
                  {OPTION_SYMBOLS[i]}
                </span>
                <input aria-label={`ตัวเลือก ${i + 1}`} className={input} maxLength={80} required={i < 2} value={o} onChange={(e) => setOptions(options.map((x, k) => (k === i ? e.target.value : x)))} />
                {kind === 'quiz' && (
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`ตัวเลือก ${i + 1} ถูก`} />
                    ถูก
                  </label>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              {options.length < maxOptions && (
                <button type="button" className="text-sm text-board font-semibold" onClick={() => setOptions([...options, ''])}>
                  + ตัวเลือก
                </button>
              )}
              {options.length > 2 && (
                <button type="button" className="text-sm text-stone-500" onClick={() => setOptions(options.slice(0, -1))}>
                  − ลบตัวเลือกสุดท้าย
                </button>
              )}
            </div>
          </div>
        )}
        {kind === 'quiz' && (
          <label className="text-sm font-semibold">
            เวลา (วินาที)
            <input type="number" min={5} max={120} className={`${input} max-w-32`} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
          </label>
        )}
        <Button type="submit">เพิ่มกิจกรรม</Button>
      </form>
    </Card>
  )
}
