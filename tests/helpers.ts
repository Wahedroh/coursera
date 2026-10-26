import { classes, schools, students } from '../src/server/db/schema'
import { newId, now, type Db } from '../src/server/db/client'

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export async function seedClass(db: Db, overrides: { schoolName?: string; name?: string; grade?: number | null } = {}) {
  const u = unique()
  const schoolId = newId()
  const classId = newId()
  const joinCode = u.toUpperCase().slice(-6).padStart(6, 'X')
  await db.insert(schools).values({ id: schoolId, name: overrides.schoolName ?? `โรงเรียน ${u}`, createdAt: now() })
  await db.insert(classes).values({
    id: classId,
    schoolId,
    grade: overrides.grade ?? 1,
    name: overrides.name ?? `โรงเรียน ${u} ชั้น 1`,
    joinCode,
    createdAt: now(),
  })
  return { schoolId, classId, joinCode }
}

export async function seedStudent(
  db: Db,
  classId: string,
  overrides: Partial<typeof students.$inferInsert> = {},
) {
  const id = overrides.id ?? newId()
  const zipgradeId = overrides.zipgradeId ?? String(100000 + counter++ + Math.floor(Math.random() * 1e6))
  await db.insert(students).values({
    id,
    zipgradeId,
    classId,
    title: 'เด็กหญิง',
    firstName: 'ทดสอบ',
    lastName: 'ระบบ',
    sortOrder: 0,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  })
  return { id, zipgradeId }
}

/** ล้างข้อมูลทุก binding แล้ว apply migrations ใหม่ (storage ของ plugin แยกต่อไฟล์ ไม่ใช่ต่อเทสต์) */
export async function resetDb() {
  const { reset, applyD1Migrations, env } = await import('cloudflare:test')
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
}

export function cookieFrom(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? ''
  const m = /(?:^|,\s*)sid=([^;]*)/.exec(raw)
  if (!m) throw new Error(`no sid cookie in: ${raw}`)
  return `sid=${m[1]}`
}

export async function postJson(path: string, body: unknown, init: { cookie?: string; headers?: Record<string, string> } = {}) {
  const { SELF } = await import('cloudflare:test')
  return SELF.fetch(`http://x${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    body: JSON.stringify(body),
  })
}

export async function getJson(path: string, cookie?: string) {
  const { SELF } = await import('cloudflare:test')
  return SELF.fetch(`http://x${path}`, { headers: cookie ? { cookie } : {} })
}

export async function loginTeacher(): Promise<string> {
  const res = await postJson('/api/teacher/login', { password: 'teacher-pass' })
  if (res.status !== 200) throw new Error(`teacher login failed: ${res.status}`)
  return cookieFrom(res)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const json = (r: Response) => r.json() as Promise<any>

export async function studentCookie(studentId: string, ua = 'ua'): Promise<string> {
  const { env } = await import('cloudflare:test')
  const { createSession } = await import('../src/server/auth/sessions')
  const { getDb } = await import('../src/server/db/client')
  const { token } = await createSession(getDb(env), { kind: 'student', studentId }, ua, env.SESSION_SECRET)
  return `sid=${token}`
}

/** JPEG ขนาดเล็กที่สุดที่ถูกต้อง (1×1) */
export const TINY_JPEG = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='),
  (c) => c.charCodeAt(0),
)

export async function uploadFile(query: string, body: BodyInit, contentType: string, cookie?: string) {
  const { SELF } = await import('cloudflare:test')
  return SELF.fetch(`http://x/api/files?${query}`, {
    method: 'POST',
    headers: { 'content-type': contentType, ...(cookie ? { cookie } : {}) },
    body,
  })
}

export async function putJson(path: string, body: unknown, cookie?: string) {
  const { SELF } = await import('cloudflare:test')
  return SELF.fetch(`http://x${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

export async function del(path: string, cookie?: string) {
  const { SELF } = await import('cloudflare:test')
  return SELF.fetch(`http://x${path}`, { method: 'DELETE', headers: cookie ? { cookie } : {} })
}

export const ASSIGNMENT = { title: 'ใบงาน 1', instructions: 'ทำข้อ 1-10', attachmentKeys: [], dueAt: null, maxScore: 10, submitMode: 'both' }

export async function seedAssignment(classId: string, over: Record<string, unknown> = {}): Promise<string> {
  const { env } = await import('cloudflare:test')
  const { getDb, newId, now } = await import('../src/server/db/client')
  const { assignments } = await import('../src/server/db/schema')
  const id = newId()
  await getDb(env)
    .insert(assignments)
    .values({ id, classId, title: 'ใบงาน', maxScore: 10, submitMode: 'both', createdAt: now(), updatedAt: now(), ...over } as never)
  return id
}
