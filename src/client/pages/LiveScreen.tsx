import qrcode from 'qrcode-generator'
import { useCallback, useState } from 'react'
import { useParams } from 'react-router'
import { api } from '../api'
import LiveResults from '../components/LiveResults'
import { OPTION_COLORS, OPTION_SYMBOLS, type TeacherLiveState } from '../../shared/live'
import { useCountdown, useLive } from '../lib/useLive'
import { ErrorBox } from '../ui'
import { useTeacherErrorHandler } from './useTeacherGuard'

function qrSvg(text: string): string {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true })
}

/** จอโปรเจกเตอร์: แสดงกิจกรรมปัจจุบัน + QR เข้าไลฟ์ (ไม่มีปุ่มควบคุม ครูคุมจากอีกหน้าจอ) */
export default function LiveScreen() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => api<TeacherLiveState>(`/api/teacher/live/${id}`), [id])
  const { state, connected, offset } = useLive(id, load, (e) => setError(handle(e)))
  const left = useCountdown(state?.current?.activity.deadline ?? null, offset)
  const joinUrl = `${location.origin}/live/${id}`

  if (!state) return <main className="min-h-screen bg-[#16352A] text-white p-8">{error ? <ErrorBox message={error} /> : 'กำลังโหลด…'}</main>
  const { session, current } = state
  const qr = (size: string) => <div className={`bg-white rounded-2xl p-2 ${size}`} dangerouslySetInnerHTML={{ __html: qrSvg(joinUrl) }} />

  return (
    <main className="min-h-screen bg-[#16352A] text-white p-6 md:p-10 flex flex-col gap-6">
      <header className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">{session.title}</h1>
          <p className="opacity-75">
            {session.className} · {!connected && 'กำลังเชื่อมต่อ… · '}
            {session.status === 'ended' ? 'จบไลฟ์แล้ว ขอบคุณทุกคน' : 'ล็อกอินแล้วกดแบนเนอร์ "มีไลฟ์" หรือสแกน QR'}
          </p>
        </div>
        {current && session.status === 'live' && qr('w-28 shrink-0')}
      </header>

      {session.status !== 'live' || !current ? (
        <section className="flex-1 flex flex-col items-center justify-center gap-4">
          {session.status === 'ended' ? (
            <p className="text-5xl font-extrabold">🎉 จบไลฟ์</p>
          ) : (
            <>
              {qr('w-80 max-w-full')}
              <p className="text-2xl">
                รหัสห้อง <b className="tracking-[0.3em]">{session.joinCode}</b>
              </p>
              <p className="opacity-75">{session.status === 'draft' ? 'รอครูเริ่มไลฟ์…' : 'รอกิจกรรมแรก…'}</p>
            </>
          )}
        </section>
      ) : (
        <section className="flex-1 flex flex-col gap-6">
          <div className="flex justify-between items-start gap-4">
            <h2 className="text-4xl md:text-5xl font-extrabold leading-tight" data-testid="screen-prompt">
              {current.activity.prompt}
            </h2>
            <div className="text-right shrink-0">
              {left !== null && current.activity.accepting && <div className="text-6xl font-extrabold text-amber-300 tabular-nums">{left}</div>}
              <div className="text-2xl" data-testid="screen-count">
                ตอบแล้ว <b>{current.responseCount}</b>/{current.total}
              </div>
              {!current.activity.accepting && <div className="text-amber-300">ปิดรับคำตอบแล้ว</div>}
            </div>
          </div>
          {current.activity.showResults ? (
            <div className="bg-white text-ink rounded-3xl p-6 flex-1">
              <LiveResults results={current.results} options={current.activity.options} big />
            </div>
          ) : (
            current.activity.options && (
              <div className="grid grid-cols-2 gap-4">
                {current.activity.options.map((o, i) => (
                  <div key={i} className="rounded-3xl p-6 text-3xl font-bold flex items-center gap-3" style={{ background: OPTION_COLORS[i] }}>
                    <span>{OPTION_SYMBOLS[i]}</span>
                    {o}
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      )}
    </main>
  )
}
