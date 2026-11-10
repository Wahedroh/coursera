import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { GameControls, useCardGame } from '../components/CardGameParts'
import { loadReader, scanImage, type CardScan } from '../lib/cardScanner'
import { ErrorBox, Loading } from '../ui'
import { useTeacherErrorHandler } from './useTeacherGuard'

/** มือถือครู: เปิดกล้องหลัง ส่องไปทั่วห้อง อ่านการ์ดทุกใบในภาพ แล้วส่งคำตอบขึ้นระบบเป็นชุด ๆ */
export default function TeacherCardScan() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [error, setError] = useState<string | null>(null)
  const onError = useCallback((e: unknown) => setError(handle(e)), [handle])
  const { state, reload } = useCardGame(id, onError, 2000)
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [unknown, setUnknown] = useState<string[]>([])
  // คำตอบที่สแกนได้ในเครื่องนี้ (ของข้อปัจจุบัน) และที่ยังไม่ได้ส่ง
  const seen = useRef(new Map<string, number>())
  const pending = useRef(new Map<string, number>())
  const qIndex = useRef(-1)
  const revealed = useRef(false)
  const [, bump] = useState(0)

  // ข้อเปลี่ยน → เริ่มนับใหม่
  useEffect(() => {
    if (!state) return
    revealed.current = state.revealed
    if (state.current !== qIndex.current) {
      qIndex.current = state.current
      seen.current.clear()
      pending.current.clear()
      bump((n) => n + 1)
    }
  }, [state])

  // เปิดกล้อง + โหลดตัวอ่าน QR
  useEffect(() => {
    let stream: MediaStream | null = null
    let stop = false
    ;(async () => {
      try {
        await loadReader()
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (stop) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current!
        v.srcObject = stream
        await v.play()
        setReady(true)
      } catch (e) {
        setCamError(e instanceof Error && e.name === 'NotAllowedError' ? 'ยังไม่ได้อนุญาตให้ใช้กล้อง — กดอนุญาตที่แถบที่อยู่ของเบราว์เซอร์ แล้วโหลดหน้าใหม่' : 'เปิดกล้องไม่ได้ ลองใช้ Chrome (Android) หรือ Safari (iPhone)')
      }
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // วนอ่านภาพจากกล้อง
  useEffect(() => {
    if (!ready) return
    let alive = true
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const draw = (found: CardScan[]) => {
      const v = video.current
      const o = overlay.current
      if (!v || !o) return
      o.width = v.clientWidth
      o.height = v.clientHeight
      const k = v.clientWidth / canvas.width
      const g = o.getContext('2d')!
      g.clearRect(0, 0, o.width, o.height)
      g.lineWidth = 4
      g.font = 'bold 15px sans-serif'
      for (const f of found) {
        const name = nameOf.current.get(f.zipgradeId.toUpperCase())
        g.strokeStyle = name ? '#4ade80' : '#f87171'
        g.beginPath()
        f.corners.forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k)))
        g.closePath()
        g.stroke()
        const x = Math.min(...f.corners.map((p) => p.x)) * k
        const y = Math.max(...f.corners.map((p) => p.y)) * k + 18
        const label = name ? `✓ ${name}` : 'ไม่ใช่ห้องนี้'
        g.fillStyle = name ? '#16a34a' : '#dc2626'
        g.fillRect(x - 2, y - 15, g.measureText(label).width + 8, 20)
        g.fillStyle = '#fff'
        g.fillText(label, x + 2, y)
      }
    }
    const loop = async () => {
      while (alive) {
        const v = video.current
        if (v && v.videoWidth) {
          canvas.width = v.videoWidth
          canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0)
          try {
            const found = await scanImage(ctx.getImageData(0, 0, canvas.width, canvas.height))
            if (!revealed.current) {
              for (const f of found) {
                if (!nameOf.current.has(f.zipgradeId.toUpperCase())) continue
                if (seen.current.get(f.zipgradeId) !== f.answer) {
                  seen.current.set(f.zipgradeId, f.answer)
                  pending.current.set(f.zipgradeId, f.answer)
                  bump((n) => n + 1)
                }
              }
            }
            draw(found)
          } catch {
            // ภาพเสีย/ตัวอ่านพลาด — อ่านเฟรมถัดไป
          }
        }
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    void loop()
    return () => {
      alive = false
    }
  }, [ready])

  // ส่งคำตอบที่สแกนได้ทุก ~0.8 วินาที
  useEffect(() => {
    const t = setInterval(async () => {
      if (!pending.current.size || qIndex.current < 0) return
      const scans = [...pending.current].map(([zipgradeId, answer]) => ({ zipgradeId, answer }))
      pending.current.clear()
      try {
        const r = await api<{ unknown: string[] }>(`/api/teacher/card-games/${id}/scans`, { body: { qIndex: qIndex.current, scans } })
        if (r.unknown.length) setUnknown(r.unknown)
        void reload()
      } catch (e) {
        for (const s of scans) pending.current.set(s.zipgradeId, s.answer)
        onError(e)
      }
    }, 800)
    return () => clearInterval(t)
  }, [id, reload, onError])

  const nameOf = useRef(new Map<string, string>())
  useEffect(() => {
    if (state) nameOf.current = new Map(state.roster.map((r) => [r.zipgradeId.toUpperCase(), `${r.name.split(' ')[0]} (${r.zipgradeId})`]))
  }, [state])

  if (!state) return error ? <ErrorBox message={error} /> : <Loading />
  const done = new Set([...Object.keys(state.answers), ...state.roster.filter((r) => seen.current.has(r.zipgradeId)).map((r) => r.id)])
  const missing = state.roster.filter((r) => !done.has(r.id))
  return (
    <main className="min-h-screen bg-black text-white flex flex-col max-w-xl mx-auto">
      <header className="bg-board px-4 py-3">
        <div className="flex justify-between items-baseline">
          <Link to={`/teacher/card-games/${id}`} className="text-xs opacity-80">
            ← จอเกม
          </Link>
          <span className="text-xs opacity-80">{state.class.name}</span>
        </div>
        {state.ended ? (
          <b>เกมจบแล้ว</b>
        ) : (
          <>
            <b className="text-lg" data-testid="scan-status">
              ข้อ {state.current + 1}/{state.questions.length} · สแกนแล้ว {done.size}/{state.roster.length}
            </b>
            <p className="text-xs opacity-85">{state.revealed ? 'เฉลยแล้ว — กด "ข้อถัดไป" เพื่อสแกนข้อต่อไป' : 'ส่องกล้องไปทั่วห้องช้า ๆ · ใครสแกนแล้วขึ้นกรอบเขียว'}</p>
          </>
        )}
      </header>
      <div className="relative bg-stone-900">
        <video ref={video} playsInline muted className="w-full h-auto block" />
        <canvas ref={overlay} className="absolute inset-0 pointer-events-none" />
        {!ready && !camError && <p className="absolute inset-0 flex items-center justify-center text-sm opacity-80 py-24">กำลังเปิดกล้อง…</p>}
      </div>
      <section className="bg-[#FDFBF3] text-stone-900 p-4 flex flex-col gap-3 flex-1">
        <ErrorBox message={camError ?? error} />
        {!state.ended && <GameControls state={state} reload={reload} onError={onError} compact />}
        {!state.ended && missing.length > 0 && (
          <p className="text-sm">
            <b>ยังไม่สแกน ({missing.length}):</b> {missing.map((r) => `${r.name.split(' ')[0]} (${r.zipgradeId})`).join(', ')}
          </p>
        )}
        {unknown.length > 0 && <p className="text-xs text-red-700">พบการ์ดที่ไม่ใช่ของห้องนี้: {unknown.join(', ')}</p>}
        <p className="text-xs text-stone-500">ระยะสแกนประมาณ 3–5 เมตร (การ์ดใหญ่ไกลขึ้น) · แสงสว่างช่วยให้อ่านเร็ว · นักเรียนเปลี่ยนคำตอบได้จนกว่าครูกดเฉลย</p>
      </section>
    </main>
  )
}
