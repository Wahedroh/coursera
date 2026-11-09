import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { settings } from '../db/schema'

/** ผู้ส่ง (บริการ push ใช้ติดต่อเมื่อมีปัญหา) */
export const VAPID_SUBJECT = 'https://classroom.wahedroh.workers.dev'
const KEY = 'vapid_keys'

export const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const utf8 = (s: string) => new TextEncoder().encode(s)

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey }

/** คู่กุญแจ VAPID ของระบบ — สร้างครั้งแรกที่ต้องใช้ แล้วเก็บในฐานข้อมูล (ไม่ต้องตั้ง secret เพิ่ม) */
export async function vapidKeys(db: Db): Promise<VapidKeys> {
  const read = async () => {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
    return row ? (JSON.parse(row.value) as VapidKeys) : null
  }
  const have = await read()
  if (have) return have
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const keys: VapidKeys = {
    publicKey: b64url((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    privateJwk: (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey,
  }
  // สร้างพร้อมกัน 2 คำขอ: ใช้ของคนที่บันทึกก่อน
  await db.insert(settings).values({ key: KEY, value: JSON.stringify(keys) }).onConflictDoNothing()
  return (await read())!
}

/** หัว Authorization แบบ VAPID (RFC 8292) สำหรับ endpoint นี้ — JWT ES256 อายุ 12 ชั่วโมง */
export async function vapidAuthorization(keys: VapidKeys, endpoint: string, t: number): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = b64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(utf8(JSON.stringify({ aud, exp: Math.floor(t / 1000) + 12 * 3600, sub: VAPID_SUBJECT })))
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`
}

/** บริการ push ของเบราว์เซอร์หลัก — ไม่รับ endpoint อื่น (กันใช้ระบบเรายิงคำขอไปที่อื่น) */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/]
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}
