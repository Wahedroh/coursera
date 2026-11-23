import { useEffect, useRef, useState } from 'react'
import { FACE_GAP_MS, recheckAt, ROOM_SHOTS, type ProctorKind, type StudentExamPaper } from '../../shared/makeupExam'
import { openCamera, snapshot, stopCamera, type Facing } from '../lib/camera'
import { Button } from '../ui'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * คุมสอบด้วยกล้อง (สอบย้อนหลังออนไลน์)
 * 1) ก่อนทำข้อสอบ: กล้องหลังสแกนโต๊ะ/รอบตัว 3 ภาพ (ข้อสอบถูกบังจนกว่าจะเสร็จ)
 * 2) ระหว่างสอบ: กล้องหน้าถ่ายสุ่มทุก 20–60 วินาที (มีภาพเล็กมุมจอให้รู้ว่ากล้องเปิด)
 * 3) สุ่มสแกนโต๊ะซ้ำ 1 ครั้งช่วง 30–70% ของเวลา
 * กล้องดับระหว่างอยู่หน้าสอบ = นับเป็นออกจากหน้าจอ
 */
export default function ProctorCam({
  paper,
  now,
  deviceId,
  onCameraOff,
  onShot,
}: {
  paper: StudentExamPaper
  now: number
  deviceId: string
  /** กล้องดับทั้งที่ยังอยู่หน้าสอบ (นับเป็นออกจากหน้าจอ) */
  onCameraOff: () => void
  /** ถ่ายสแกนโต๊ะ/สแกนซ้ำเสร็จ → ให้หน้าสอบอัปเดตสถานะ */
  onShot: (kind: 'room' | 'recheck') => void
}) {
  const recheckDue = paper.roomDone && !paper.recheckDone && now >= recheckAt(paper.id, paper.startedAt, paper.durationMin)
  const mode: ProctorKind = !paper.roomDone ? 'room' : recheckDue ? 'recheck' : 'face'
  const facing: Facing = mode === 'face' ? 'user' : 'environment'
  const video = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const offCb = useRef(onCameraOff)
  offCb.current = onCameraOff

  // เปิดกล้องตามโหมด · กลับมาหน้าสอบ (หลังสลับแอป) เปิดใหม่ · กล้องดับเอง = แจ้งออกจากหน้าจอ
  useEffect(() => {
    let live = true
    let s: MediaStream | null = null
    const onVis = () => document.visibilityState === 'visible' && setRetry((n) => n + 1)
    document.addEventListener('visibilitychange', onVis)
    if (document.visibilityState === 'visible')
      openCamera(facing)
        .then((x) => {
          if (!live) return stopCamera(x)
          s = x
          setError(null)
          setStream(x)
          x.getVideoTracks()[0]?.addEventListener('ended', () => {
            if (!live || document.visibilityState !== 'visible') return
            offCb.current()
            setStream(null)
            setError('กล้องปิดไป (นับเป็นออกจากหน้าจอ 1 ครั้ง) — กดเปิดกล้องอีกครั้งเพื่อทำข้อสอบต่อ')
          })
        })
        .catch((e) => live && (setStream(null), setError((e as Error).message)))
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVis)
      stopCamera(s)
    }
  }, [facing, retry])

  useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])

  async function upload(kind: ProctorKind): Promise<boolean> {
    const v = video.current
    const blob = v && (await snapshot(v))
    if (!blob) return false
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(`/api/student/makeups/${paper.id}/photo?kind=${kind}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'image/jpeg', 'x-exam-device': deviceId }, body: blob })
        if (r.ok) return true
        if (r.status < 500) return false
      } catch {
        /* เน็ตหลุด ลองอีกครั้ง */
      }
      await sleep(1500)
    }
    return false
  }

  // กล้องหน้า: ถ่ายสุ่มทุก 20–60 วินาที (ภาพแรกหลังเปิด 3 วินาที)
  useEffect(() => {
    if (mode !== 'face' || !stream) return
    let timer: ReturnType<typeof setTimeout>
    let live = true
    const next = (ms: number) => {
      timer = setTimeout(async () => {
        if (!live) return
        if (document.visibilityState === 'visible') await upload('face')
        next(FACE_GAP_MS[0] + Math.random() * (FACE_GAP_MS[1] - FACE_GAP_MS[0]))
      }, ms)
    }
    next(3000)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stream])

  async function scan(kind: 'room' | 'recheck') {
    const shots = kind === 'room' ? ROOM_SHOTS : 2
    let ok = 0
    for (let i = 0; i < shots; i++) {
      for (let c = 2; c > 0; c--) {
        setBusy(`หมุนกล้องช้า ๆ · ภาพ ${i + 1}/${shots} ใน ${c}…`)
        await sleep(1000)
      }
      setBusy(`กำลังส่งภาพ ${i + 1}/${shots}…`)
      if (await upload(kind)) ok++
    }
    setBusy(null)
    if (!ok) return setError('ส่งภาพไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่')
    onShot(kind)
  }

  // สุ่มสแกนซ้ำ: เริ่มถ่ายเองเมื่อกล้องหลังพร้อม
  const started = useRef(false)
  useEffect(() => {
    if (mode !== 'recheck' || !stream || started.current) return
    started.current = true
    void scan('recheck')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stream])

  const big = mode !== 'face' || !!error
  return (
    <div
      data-testid="proctor"
      data-mode={mode}
      className={big ? 'fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-stone-900/95 p-5 text-center text-white' : 'fixed bottom-20 left-3 z-40'}
    >
      {big && (
        <>
          <p className="text-lg font-extrabold">{error ? '📷 ต้องเปิดกล้องเพื่อทำข้อสอบต่อ' : mode === 'room' ? '📷 สแกนโต๊ะและรอบตัวก่อนเริ่มทำข้อสอบ' : '📷 ครูขอดูโต๊ะอีกครั้ง'}</p>
          {!error && <p className="text-sm opacity-85">ใช้กล้องหลัง หมุนให้เห็นโต๊ะ พื้นรอบตัว และด้านข้าง (ไม่มีหนังสือ โน้ต หรือคนช่วย) · เวลาสอบเดินอยู่</p>}
        </>
      )}
      <video ref={video} autoPlay muted playsInline aria-label="ภาพจากกล้อง" className={big ? 'max-h-[50vh] w-full max-w-sm rounded-2xl bg-black object-cover' : 'h-24 w-[72px] rounded-xl border-2 border-white bg-black object-cover shadow-lg'} />
      {!big && <span className="absolute -top-2 left-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">● REC</span>}
      {big && error && (
        <>
          <p role="alert" className="max-w-sm rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </p>
          <Button onClick={() => (setError(null), setRetry((n) => n + 1))}>เปิดกล้องอีกครั้ง</Button>
        </>
      )}
      {big && !error && mode === 'room' && (busy ? <p className="text-xl font-extrabold">{busy}</p> : <Button onClick={() => void scan('room')} disabled={!stream}>{stream ? 'เริ่มสแกน (3 ภาพ)' : 'กำลังเปิดกล้อง…'}</Button>)}
      {big && !error && mode === 'recheck' && <p className="text-xl font-extrabold">{busy ?? 'กำลังเปิดกล้องหลัง…'}</p>}
    </div>
  )
}
