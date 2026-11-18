import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, ApiClientError } from '../api'
import { LETTERS, type StudentCardGame as Game } from '../../shared/cardgame'
import { fileUrl } from '../lib/upload'
import { ErrorBox, Loading } from '../ui'
import Icon from '../components/Icon'

const COLORS = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-green-600']

/** นักเรียนตอบเกมการ์ดในเครื่องตัวเอง: ข้อเปลี่ยนตามจอครู · เปลี่ยนคำตอบได้จนกว่าหมดเวลา/เฉลย · เห็นเฉลยหลังครูกด */
export default function StudentCardGame() {
  const { id = '' } = useParams()
  const [g, setG] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const key = useRef('')

  const load = useCallback(
    () =>
      api<Game>(`/api/student/card-games/${id}`)
        .then((x) => {
          setG(x)
          setError(null)
          // ตั้งนาฬิกาใหม่เฉพาะเมื่อเปลี่ยนข้อ/สถานะ (ไม่ให้เวลากระโดดทุกครั้งที่ดึง)
          const k = `${x.current}:${x.revealed}:${x.ended}`
          if (k !== key.current) {
            key.current = k
            setDeadline(x.remainingMs === null ? null : Date.now() + x.remainingMs)
          }
        })
        .catch((e) => setError(e instanceof ApiClientError ? e.message : 'เชื่อมต่อไม่ได้ กำลังลองใหม่…')),
    [id],
  )
  useEffect(() => {
    void load()
    // ดึงสถานะทุก 2.5 วินาที เฉพาะตอนเปิดหน้านี้อยู่ · จบเกมแล้วหยุด
    const t = setInterval(() => document.visibilityState === 'visible' && key.current.split(':')[2] !== 'true' && void load(), 2500)
    document.addEventListener('visibilitychange', load)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', load)
    }
  }, [load])
  useEffect(() => {
    if (deadline === null) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [deadline])

  if (!g) return error ? <ErrorBox message={error} /> : <Loading />
  const left = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
  const open = !g.revealed && !g.ended && left !== 0

  async function choose(k: number) {
    if (!g || !open) return
    setSending(k)
    setG({ ...g, mine: k })
    try {
      await api(`/api/student/card-games/${id}/answer`, { method: 'PUT', body: { qIndex: g.current, answer: k } })
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'ส่งไม่สำเร็จ ลองกดอีกครั้ง')
      void load()
    } finally {
      setSending(null)
    }
  }

  return (
    <main className="min-h-screen max-w-md mx-auto flex flex-col">
      <header className="bg-board text-white px-4 pt-4 pb-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <Link to="/me" className="text-xs opacity-80">
            ← หน้าแรก
          </Link>
          <p className="text-xs opacity-85 truncate"><Icon n="cards" /> {g.quizTitle}</p>
          <b className="text-lg" data-testid="device-q-no">
            {g.ended ? 'จบเกมแล้ว' : `ข้อ ${g.current + 1} / ${g.total}`}
          </b>
        </div>
        {!g.ended && (g.revealed ? <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">เฉลยแล้ว</span> : left !== null && <span className={`rounded-full w-12 h-12 flex items-center justify-center text-xl font-extrabold tabular-nums ${left <= 5 ? 'bg-red-500 animate-pulse' : 'bg-amber-400 text-amber-950'}`}>{left || <Icon n="alarm" />}</span>)}
      </header>
      <section className="p-4 flex flex-col gap-3 flex-1">
        <ErrorBox message={error} />
        {g.ended && g.summary ? (
          <div className="rounded-3xl bg-white border-2 border-line p-6 text-center flex flex-col gap-2" data-testid="device-summary">
            <span className="text-5xl">{g.summary.answered ? '🎉' : <Icon n="cards" />}</span>
            <b className="text-2xl">
              ถูก {g.summary.correct} / {g.total} ข้อ
            </b>
            <span className="text-sm text-stone-600">ตอบ {g.summary.answered} ข้อ</span>
            {g.summary.exp > 0 && <span className="mx-auto rounded-full bg-amber-400 px-4 py-1 font-extrabold text-amber-950">+{g.summary.exp} EXP</span>}
            <Link to="/me" className="mt-2 underline text-board font-bold">
              กลับหน้าแรก
            </Link>
          </div>
        ) : (
          <>
            {g.revealed && (
              <div className={`rounded-2xl p-4 text-center text-white font-extrabold text-xl ${g.mine === null ? 'bg-stone-500' : g.mine === g.correct ? 'bg-green-600' : 'bg-red-500'}`} data-testid="device-result">
                {g.mine === null ? 'ข้อนี้ไม่ได้ตอบ' : g.mine === g.correct ? '✅ ถูกต้อง!' : '❌ ยังไม่ถูก'}
                <span className="block text-sm font-semibold">
                  คำตอบคือ {LETTERS[g.correct!]}
                  {g.question.choices[g.correct!] ? ` · ${g.question.choices[g.correct!]}` : ''}
                </span>
              </div>
            )}
            {(g.question.q || g.question.image) && (
              <div className="rounded-2xl bg-white border-2 border-line p-3 font-semibold">
                {g.question.q}
                {g.question.image && <img src={fileUrl(g.question.image)} alt={`รูปโจทย์ข้อ ${g.current + 1}`} className={`max-h-[40vh] mx-auto rounded-xl ${g.question.q ? 'mt-2' : ''}`} />}
              </div>
            )}
            <div className="flex flex-col gap-2.5" data-testid="device-choices">
              {g.question.choices.map((c, k) => {
                const picked = g.mine === k
                const right = g.revealed && g.correct === k
                const dim = (g.mine !== null || g.revealed) && !picked && !right
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!open || sending !== null}
                    onClick={() => void choose(k)}
                    aria-pressed={picked}
                    aria-label={`ตอบ ${LETTERS[k]}${c ? ` ${c}` : ''}`}
                    className={`flex items-center gap-3 rounded-2xl p-4 text-left text-lg font-extrabold text-white transition ${COLORS[k]} ${dim ? 'opacity-40' : ''} ${picked ? 'ring-4 ring-ink ring-offset-2' : ''} disabled:cursor-default`}
                  >
                    <span className="w-10 h-10 rounded-xl bg-white/90 text-stone-900 flex items-center justify-center text-xl shrink-0">{LETTERS[k]}</span>
                    <span className="flex-1">{c || <span className="opacity-80 font-semibold">ตัวเลือก {LETTERS[k]}</span>}</span>
                    {right && '✓'}
                  </button>
                )
              })}
            </div>
            <p className="text-center text-sm font-bold text-board" data-testid="device-status">
              {g.revealed ? 'รอครูไปข้อถัดไป…' : g.mine !== null ? `ส่งแล้ว ✓ เลือก ${LETTERS[g.mine]}${open ? ' · เปลี่ยนได้จนกว่าจะหมดเวลา/ครูเฉลย' : ''}` : open ? 'แตะเพื่อเลือกคำตอบ' : 'หมดเวลา'}
            </p>
          </>
        )}
      </section>
    </main>
  )
}
