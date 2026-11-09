import { useEffect, useState } from 'react'
import { canPromptInstall, disablePush, enablePush, isIos, isStandalone, onInstallChange, promptInstall, pushSupported, resyncPush } from '../lib/pwa'
import { Card } from '../ui'

const HIDE_KEY = 'appSetup:hidden'

/** ติดตั้งเป็นแอปบนหน้าจอหลัก + เปิดการแจ้งเตือน (งานใหม่ งานใกล้ครบกำหนด ประกาศ ครูส่งงานกลับ) */
export default function AppSetupCard() {
  const [push, setPush] = useState<'unknown' | 'on' | 'off' | 'denied' | 'unsupported'>('unknown')
  const [installable, setInstallable] = useState(canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => onInstallChange(() => setInstallable(canPromptInstall())), [])
  useEffect(() => {
    if (!pushSupported()) return setPush('unsupported')
    if (Notification.permission === 'denied') return setPush('denied')
    resyncPush()
      .then((on) => setPush(on ? 'on' : 'off'))
      .catch(() => setPush('off'))
  }, [])

  const standalone = isStandalone()
  const ios = isIos()
  // iPhone/iPad รับแจ้งเตือนได้เฉพาะเมื่อเปิดจากไอคอนบนหน้าจอหลัก
  const needInstallFirst = ios && !standalone
  if (push === 'unknown') return null
  if (push === 'on' && (standalone || !installable)) {
    return (
      <p className="text-xs text-stone-500 text-center" data-testid="app-setup">
        🔔 เปิดการแจ้งเตือนแล้ว ·{' '}
        <button
          type="button"
          className="underline"
          onClick={async () => {
            await disablePush()
            setPush('off')
          }}
        >
          ปิด
        </button>
      </p>
    )
  }
  if (hidden) return null

  async function turnOn() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await enablePush()
      setPush(r === 'on' ? 'on' : r)
      if (r === 'denied') setMsg('เบราว์เซอร์ปิดการแจ้งเตือนไว้ — เปิดได้ที่การตั้งค่าเว็บไซต์ของเบราว์เซอร์')
    } catch {
      setMsg('เปิดการแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded-xl px-3 py-2 text-sm font-bold'
  return (
    <div data-testid="app-setup">
      <Card className="p-4 flex flex-col gap-2 bg-board-soft border-green-200">
        <div className="flex justify-between items-start gap-2">
          <b>📲 ใช้เป็นแอปในมือถือ</b>
          <button
            type="button"
            className="text-xs text-stone-500"
            onClick={() => {
              setHidden(true)
              try {
                localStorage.setItem(HIDE_KEY, '1')
              } catch {}
            }}
          >
            ไว้ทีหลัง
          </button>
        </div>
        <p className="text-sm text-stone-700">ได้แจ้งเตือนเมื่อมีงานใหม่ งานใกล้ครบกำหนด ประกาศ หรือครูส่งงานกลับให้แก้</p>
        <div className="flex flex-wrap gap-2">
          {!standalone && installable && (
            <button type="button" className={`${btn} bg-board text-white`} onClick={() => void promptInstall()}>
              📲 ติดตั้งแอป
            </button>
          )}
          {push === 'off' && !needInstallFirst && (
            <button type="button" disabled={busy} className={`${btn} bg-amber-400 text-amber-950`} onClick={() => void turnOn()}>
              🔔 เปิดการแจ้งเตือน
            </button>
          )}
        </div>
        {needInstallFirst && (
          <p className="text-xs text-stone-600">
            iPhone/iPad: กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น) → <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วเปิดจากไอคอน “ผู้ช่วยครู” จึงจะเปิดการแจ้งเตือนได้
          </p>
        )}
        {!ios && !standalone && !installable && <p className="text-xs text-stone-600">ติดตั้งได้จากเมนูของเบราว์เซอร์ (⋮) → “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”</p>}
        {push === 'unsupported' && !needInstallFirst && <p className="text-xs text-stone-600">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน ลองเปิดด้วย Chrome หรือ Safari</p>}
        {push === 'denied' && <p className="text-xs text-stone-600">การแจ้งเตือนถูกปิดไว้ที่การตั้งค่าเบราว์เซอร์</p>}
        {msg && <p className="text-xs text-red-700">{msg}</p>}
      </Card>
    </div>
  )
}
