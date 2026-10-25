import { and, eq, gt, isNull, ne } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { newId, now, type Db } from '../db/client'
import { sessions, students } from '../db/schema'
import type { SessionInfo } from '../env'
import { randomToken, sha256Hex } from './crypto'

const DAY = 24 * 60 * 60 * 1000
export const SESSION_TTL = { teacher: 30 * DAY, student: 90 * DAY } as const
const COOKIE = 'sid'

export async function createSession(
  db: Db,
  input: { kind: 'teacher' } | { kind: 'student'; studentId: string },
  userAgent: string,
): Promise<{ token: string; flaggedNewDevice: boolean }> {
  const t = now()
  let flaggedNewDevice = false
  if (input.kind === 'student') {
    const others = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.studentId, input.studentId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, t),
          ne(sessions.userAgent, userAgent),
        ),
      )
      .limit(1)
    flaggedNewDevice = others.length > 0
  }
  const token = randomToken()
  await db.insert(sessions).values({
    id: newId(),
    kind: input.kind,
    studentId: input.kind === 'student' ? input.studentId : null,
    tokenHash: await sha256Hex(token),
    userAgent,
    createdAt: t,
    lastSeenAt: t,
    expiresAt: t + SESSION_TTL[input.kind],
    flaggedNewDevice,
  })
  return { token, flaggedNewDevice }
}

export async function readSession(db: Db, token: string): Promise<SessionInfo | null> {
  const t = now()
  const [row] = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      studentId: sessions.studentId,
      lastSeenAt: sessions.lastSeenAt,
      classId: students.classId,
      active: students.active,
    })
    .from(sessions)
    .leftJoin(students, eq(sessions.studentId, students.id))
    .where(and(eq(sessions.tokenHash, await sha256Hex(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, t)))
  if (!row) return null
  if (row.kind === 'student' && (!row.studentId || !row.classId || !row.active)) return null
  if (t - row.lastSeenAt > 5 * 60 * 1000) await db.update(sessions).set({ lastSeenAt: t }).where(eq(sessions.id, row.id))
  return row.kind === 'teacher'
    ? { sessionId: row.id, kind: 'teacher' }
    : { sessionId: row.id, kind: 'student', studentId: row.studentId!, classId: row.classId! }
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: now() }).where(eq(sessions.id, sessionId))
}

export async function revokeStudentSessions(db: Db, studentId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now() })
    .where(and(eq(sessions.studentId, studentId), isNull(sessions.revokedAt)))
}

export function setSessionCookie(c: Context, token: string, kind: 'teacher' | 'student'): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL[kind] / 1000),
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/', secure: true })
}
