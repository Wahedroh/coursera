import { api } from '../api'

/** เหตุการณ์ "ติดตั้งแอป" ของ Chrome/Android — เก็บไว้ใช้ตอนกดปุ่ม */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPrompt
    listeners.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((f) => f())
  })
}
export const onInstallChange = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}
export const canPromptInstall = () => deferred !== null
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  return outcome === 'accepted'
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function registration() {
  return navigator.serviceWorker.ready
}

/** การสมัครรับแจ้งเตือนของเครื่องนี้ (ถ้ามี) */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  return (await registration()).pushManager.getSubscription()
}

export async function enablePush(): Promise<'on' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { publicKey } = await api<{ publicKey: string }>('/api/student/push/key')
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource })
  }
  await api('/api/student/push/subscribe', { body: { endpoint: sub.endpoint } })
  return 'on'
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/api/student/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}

/** เครื่องที่เปิดแจ้งเตือนไว้แล้ว: ผูกกับนักเรียนที่ล็อกอินอยู่ตอนนี้ (กรณีใช้เครื่องร่วมกัน) */
export async function resyncPush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const sub = await currentSubscription()
  if (!sub) return false
  await api('/api/student/push/subscribe', { body: { endpoint: sub.endpoint } }).catch(() => {})
  return true
}
