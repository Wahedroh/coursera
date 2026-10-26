import { useCallback, useEffect, useRef, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<any> | null = null
function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => {
      apiPromise = null
      reject(new Error('youtube_api_failed'))
    }
    document.head.appendChild(s)
    const timer = setTimeout(() => {
      apiPromise = null
      reject(new Error('youtube_api_timeout'))
    }, 15_000)
    const ready = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer)
      ready?.()
    }
  })
  return apiPromise
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
const RATES = [0.75, 1, 1.25, 1.5, 2]

/**
 * ตัวเล่น YouTube ที่ให้ดูในเว็บนี้เท่านั้น:
 * ไม่มีปุ่มของ YouTube (controls=0) + ชั้นโปร่งใสทับทั้งคลิป → คลิกชื่อคลิป/โลโก้/แชร์/"ดูบน YouTube" ไม่ได้
 * ตอนหยุด/จบมีฉากบังคลิปแนะนำ · ปุ่มควบคุมเป็นของเราเอง · เต็มจอทั้งกรอบของเรา (ไม่ใช่ของ YouTube)
 */
export default function ProtectedYouTube({ videoId, title }: { videoId: string; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const titleRef = useRef(title)
  titleRef.current = title
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<'unstarted' | 'playing' | 'paused' | 'ended' | 'buffering'>('unstarted')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [pseudoFull, setPseudoFull] = useState(false)
  // iPhone บางรุ่นไม่ยอมเล่นถ้าแตะไม่โดนตัวคลิปเอง → เปิดช่องกลางคลิปให้แตะได้ชั่วคราว
  const [needTap, setNeedTap] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    setReady(false)
    setState('unstarted')
    setError(null)
    setTime(0)
    setDuration(0)
    setMuted(false)
    setRate(1)
    setNeedTap(false)
    const fail = () => !cancelled && setError('โหลดตัวเล่นคลิปไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วกด "ลองใหม่"')
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return
        const target = document.createElement('div')
        mountRef.current.replaceChildren(target)
        readyTimer = setTimeout(fail, 15_000)
        playerRef.current = new YT.Player(target, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: location.origin },
          events: {
            onReady: (e: any) => {
              clearTimeout(readyTimer)
              if (cancelled) return
              const iframe: HTMLIFrameElement = e.target.getIframe()
              iframe.setAttribute('tabindex', '-1')
              iframe.setAttribute('title', titleRef.current)
              setDuration(e.target.getDuration() || 0)
              setReady(true)
            },
            onStateChange: (e: any) => {
              const map: Record<number, typeof state> = { [-1]: 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'unstarted' }
              const next = map[e.data] ?? 'paused'
              if (next === 'playing') setNeedTap(false)
              setState(next)
              setDuration(e.target.getDuration() || 0)
            },
            onError: (e: any) =>
              setError(e.data === 101 || e.data === 150 ? 'เจ้าของคลิปไม่อนุญาตให้ฝังคลิปนี้ (ครูต้องเปิด "อนุญาตการฝัง" ใน YouTube)' : 'เล่นคลิปนี้ไม่ได้ กรุณาแจ้งครู'),
          },
        })
      })
      .catch(fail)
    return () => {
      cancelled = true
      clearTimeout(readyTimer)
      try {
        playerRef.current?.destroy()
      } catch {
        // ตัวเล่นยังสร้างไม่เสร็จ
      }
      playerRef.current = null
    }
  }, [videoId, attempt])

  useEffect(() => {
    if (state !== 'playing') return
    const t = setInterval(() => setTime(playerRef.current?.getCurrentTime?.() ?? 0), 500)
    return () => clearInterval(t)
  }, [state])

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const toggle = useCallback(() => {
    const p = playerRef.current
    if (!p || !ready) return
    if (state === 'playing' || state === 'buffering') p.pauseVideo()
    else {
      if (state === 'ended') p.seekTo(0, true)
      p.playVideo()
      if (state === 'unstarted')
        setTimeout(() => {
          const s = p.getPlayerState?.()
          if (s === -1 || s === 5) setNeedTap(true)
        }, 1500)
    }
  }, [ready, state])

  // เต็มจอแบบ CSS (iPhone): กด Esc ออก และล็อกไม่ให้หน้าหลังเลื่อน
  useEffect(() => {
    if (!pseudoFull) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPseudoFull(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [pseudoFull])

  function seek(v: number) {
    setTime(v)
    playerRef.current?.seekTo(v, true)
  }
  function skip(d: number) {
    seek(Math.min(duration, Math.max(0, (playerRef.current?.getCurrentTime?.() ?? time) + d)))
  }
  function toggleMute() {
    const p = playerRef.current
    if (!p) return
    if (muted) p.unMute()
    else p.mute()
    setMuted(!muted)
  }
  function changeRate(r: number) {
    playerRef.current?.setPlaybackRate(r)
    setRate(r)
  }
  async function toggleFull() {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) return void (await document.exitFullscreen().catch(() => {}))
    if (pseudoFull) return setPseudoFull(false)
    // iPhone ไม่รองรับเต็มจอแบบ element → ขยายเต็มหน้าจอด้วย CSS แทน
    if (el.requestFullscreen) await el.requestFullscreen().catch(() => setPseudoFull(true))
    else setPseudoFull(true)
  }

  const playing = state === 'playing' || state === 'buffering'
  const btn = 'rounded-lg px-2 py-1 font-bold hover:bg-white/15'

  return (
    <div
      ref={wrapRef}
      onContextMenu={(e) => e.preventDefault()}
      className={`bg-black text-white select-none flex flex-col ${pseudoFull ? 'fixed inset-0 z-50' : 'rounded-2xl overflow-hidden'} ${full ? 'h-full justify-center' : ''}`}
      data-testid="protected-player"
    >
      <div className={`relative w-full ${full || pseudoFull ? 'flex-1' : 'aspect-video'}`}>
        {/* inert: กันทั้งคลิกและการกด Tab เข้าไปถึงลิงก์ในคลิป (ยกเว้นช่วงต้องแตะเพื่อเริ่มบน iPhone) */}
        <div
          ref={mountRef}
          inert={!needTap}
          aria-hidden={!needTap}
          className={`absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full ${needTap ? '' : 'pointer-events-none'}`}
        />
        {needTap && (
          <>
            {/* บังขอบบน/ล่าง (ชื่อคลิป/โลโก้) ให้แตะได้เฉพาะกลางคลิป */}
            <div className="absolute inset-x-0 top-0 h-1/4 z-10 bg-black/90 flex items-center justify-center text-sm">แตะกลางคลิปอีกครั้งเพื่อเริ่มเล่น</div>
            <div className="absolute inset-x-0 bottom-0 h-1/4 z-10 bg-black/90" />
            <div className="absolute inset-y-0 left-0 w-1/4 z-10" />
            <div className="absolute inset-y-0 right-0 w-1/4 z-10" />
          </>
        )}
        {/* ชั้นโปร่งใสทับทั้งคลิป: ไม่มีคลิกไหนถึง YouTube */}
        {!needTap && (
        <div
          role="button"
          tabIndex={0}
          aria-label={playing ? 'หยุดคลิป' : 'เล่นคลิป'}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              toggle()
            }
          }}
          className={`absolute inset-0 z-10 flex items-center justify-center cursor-pointer transition-colors ${
            error ? 'bg-black' : state === 'unstarted' || state === 'ended' ? 'bg-black/90' : playing ? 'bg-transparent' : 'bg-black/80'
          }`}
        >
          {error ? (
            <span className="flex flex-col items-center gap-3 px-6 text-center text-sm">
              {error}
              <button
                type="button"
                className="rounded-xl bg-white text-black px-4 py-1.5 font-bold"
                onClick={(e) => {
                  e.stopPropagation()
                  setAttempt((n) => n + 1)
                }}
              >
                ลองใหม่
              </button>
            </span>
          ) : !ready ? (
            <span className="text-sm opacity-70">กำลังโหลดคลิป…</span>
          ) : (
            !playing && (
              <span className="flex flex-col items-center gap-2">
                <span className="w-16 h-16 rounded-full bg-white/90 text-black text-3xl flex items-center justify-center pl-1">{state === 'ended' ? '↺' : '▶'}</span>
                {state === 'ended' && <span className="text-sm">ดูอีกครั้ง</span>}
              </span>
            )
          )}
        </div>
        )}
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 text-sm bg-black">
        <button type="button" className={btn} onClick={toggle} disabled={!ready} aria-label={playing ? 'หยุด' : 'เล่น'}>
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" className={btn} onClick={() => skip(-10)} disabled={!ready} aria-label="ย้อน 10 วินาที">
          ⟲10
        </button>
        <button type="button" className={btn} onClick={() => skip(10)} disabled={!ready} aria-label="ข้าม 10 วินาที">
          10⟳
        </button>
        <span className="tabular-nums text-xs whitespace-nowrap">
          {fmt(time)} / {fmt(duration)}
        </span>
        <input
          type="range"
          aria-label="เลื่อนเวลา"
          min={0}
          max={Math.max(1, duration)}
          step={1}
          value={Math.min(time, duration)}
          disabled={!ready}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 min-w-12 accent-amber-400"
        />
        <button type="button" className={btn} onClick={toggleMute} disabled={!ready} aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <select aria-label="ความเร็ว" disabled={!ready} value={rate} onChange={(e) => changeRate(Number(e.target.value))} className="bg-black text-white text-xs rounded border border-white/30 px-1 py-0.5">
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}x
            </option>
          ))}
        </select>
        <button type="button" className={btn} onClick={toggleFull} aria-label={full || pseudoFull ? 'ออกจากเต็มจอ' : 'เต็มจอ'}>
          {full || pseudoFull ? '⤡' : '⛶'}
        </button>
      </div>
    </div>
  )
}
