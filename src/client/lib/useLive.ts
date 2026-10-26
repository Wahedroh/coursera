import { useEffect, useRef, useState } from 'react'

/**
 * state สดของไลฟ์: ดึง snapshot ทาง HTTP ทุกครั้งที่ (re)connect แล้วรับ state ที่ LiveRoom push มา
 * จึงไม่ต้องพึ่งลำดับข้อความ · หลุดแล้วต่อใหม่เอง (backoff สูงสุด 10 วินาที)
 */
export function useLive<S extends { serverNow: number }>(id: string, load: () => Promise<S>, onError?: (e: unknown) => void) {
  const [state, setState] = useState<S | null>(null)
  const [connected, setConnected] = useState(false)
  // เวลาเซิร์ฟเวอร์ − เวลาเครื่อง (ใช้นับถอยหลังควิซให้ตรงกันทุกจอ)
  const [offset, setOffset] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load
  const errRef = useRef(onError)
  errRef.current = onError

  useEffect(() => {
    let ws: WebSocket | null = null
    let stop = false
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const apply = (s: S) => {
      if (stop) return
      setOffset(s.serverNow - Date.now())
      setState(s)
    }
    const refresh = () => loadRef.current().then(apply).catch((e) => errRef.current?.(e))
    function open() {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live/${id}/ws`)
      ws.onopen = () => {
        retry = 0
        setConnected(true)
        refresh()
      }
      ws.onmessage = (e) => {
        if (e.data === 'pong') return
        try {
          const m = JSON.parse(String(e.data)) as { type: string; state: S }
          if (m.type === 'state') apply(m.state)
        } catch {
          // ข้อความเสีย ข้าม
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!stop) timer = setTimeout(open, Math.min(10_000, 1000 * 2 ** retry++))
      }
    }
    refresh()
    open()
    const ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop = true
      clearTimeout(timer)
      clearInterval(ping)
      document.removeEventListener('visibilitychange', onVisible)
      ws?.close()
    }
  }, [id])

  return { state, setState, connected, offset }
}

/** วินาทีที่เหลือจนถึง deadline (อัปเดตทุก 250ms) */
export function useCountdown(deadline: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [deadline])
  if (deadline === null) return null
  return Math.max(0, Math.ceil((deadline - (now + offset)) / 1000))
}
