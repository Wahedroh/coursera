import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { parseZipgradeCsv } from '../../shared/roster/parse'
import { MAX_CSV_CHARS, rosterApplySchema, rosterPreviewSchema } from '../../shared/schemas'
import { requireTeacher } from '../auth/middleware'
import { revokeStudentSessions } from '../auth/sessions'
import { getDb, now, type Db } from '../db/client'
import { classes, sessions, students } from '../db/schema'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { applyImport, listClasses, listStudents, previewImport } from './service'

export const rosterRoutes = new Hono<AppEnv>()
rosterRoutes.use('*', requireTeacher)

function parseCsvOrThrow(csv: string, strict: boolean) {
  if (csv.length > MAX_CSV_CHARS) throw apiError('too_large', 'ไฟล์ใหญ่เกินไป (ไม่เกิน 1MB)', 413)
  const parsed = parseZipgradeCsv(csv)
  if (strict && parsed.rows.length === 0 && parsed.errors.some((e) => e.line === 1)) {
    throw apiError('invalid_csv', parsed.errors[0].message, 400)
  }
  return parsed
}

rosterRoutes.post('/roster/preview', async (c) => {
  const { csv } = await parseBody(c, rosterPreviewSchema)
  const { rows, errors } = parseCsvOrThrow(csv, false)
  return c.json({ preview: await previewImport(getDb(c.env), rows), errors })
})

rosterRoutes.post('/roster/apply', async (c) => {
  const { csv, deactivateMissing } = await parseBody(c, rosterApplySchema)
  const { rows } = parseCsvOrThrow(csv, true)
  return c.json(await applyImport(getDb(c.env), rows, { deactivateMissing }))
})

rosterRoutes.get('/classes', async (c) => c.json(await listClasses(getDb(c.env))))

rosterRoutes.get('/classes/:classId/students', async (c) => {
  const db = getDb(c.env)
  const [cls] = await db
    .select({ id: classes.id, name: classes.name, joinCode: classes.joinCode })
    .from(classes)
    .where(eq(classes.id, c.req.param('classId')))
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  return c.json({ class: cls, students: await listStudents(db, cls.id) })
})

async function requireStudentRow(db: Db, id: string) {
  const [s] = await db.select({ id: students.id }).from(students).where(eq(students.id, id))
  if (!s) throw apiError('student_not_found', 'ไม่พบนักเรียน', 404)
  return s
}

rosterRoutes.post('/students/:id/reset-pin', async (c) => {
  const db = getDb(c.env)
  const s = await requireStudentRow(db, c.req.param('id'))
  await db.update(students).set({ pinHash: null, failedAttempts: 0, lockedUntil: null, updatedAt: now() }).where(eq(students.id, s.id))
  await revokeStudentSessions(db, s.id)
  return c.json({ ok: true })
})

rosterRoutes.post('/students/:id/unlock', async (c) => {
  const db = getDb(c.env)
  const s = await requireStudentRow(db, c.req.param('id'))
  await db.update(students).set({ failedAttempts: 0, lockedUntil: null, updatedAt: now() }).where(eq(students.id, s.id))
  return c.json({ ok: true })
})

rosterRoutes.post('/students/:id/logout-all', async (c) => {
  const db = getDb(c.env)
  const s = await requireStudentRow(db, c.req.param('id'))
  await revokeStudentSessions(db, s.id)
  return c.json({ ok: true })
})

rosterRoutes.post('/sessions/:id/ack', async (c) => {
  await getDb(c.env).update(sessions).set({ flaggedNewDevice: false }).where(eq(sessions.id, c.req.param('id')))
  return c.json({ ok: true })
})
