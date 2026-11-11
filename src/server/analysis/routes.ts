import { Hono } from 'hono'
import { z } from 'zod'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { reportReleaseSchema } from '../../shared/report'
import { termWindow } from '../terms/service'
import { classAnalysis, saveNote } from './service'
import { classReportCards, getRelease, reportStatus, setRelease, studentReportCard } from './report'

export const teacherAnalysisRoutes = new Hono<AppEnv>()
teacherAnalysisRoutes.use('*', requireTeacher)
teacherAnalysisRoutes.get('/classes/:id/analysis', async (c) => c.json(await classAnalysis(getDb(c.env), c.req.param('id'), now(), c.req.query('term') || undefined)))
teacherAnalysisRoutes.put('/students/:id/note', async (c) => {
  const { note, termId } = await parseBody(c, z.object({ note: z.string().max(1000), termId: z.string().optional() }))
  await saveNote(getDb(c.env), c.req.param('id'), note.trim(), now(), termId)
  return c.json({ ok: true })
})
teacherAnalysisRoutes.get('/classes/:id/report-cards', async (c) => c.json(await classReportCards(getDb(c.env), c.req.param('id'), now(), c.req.query('term') || undefined)))
teacherAnalysisRoutes.get('/classes/:id/report-release', async (c) => {
  const db = getDb(c.env)
  const w = await termWindow(db, c.req.query('term') || undefined)
  return c.json(await getRelease(db, c.req.param('id'), w.term.id))
})
teacherAnalysisRoutes.put('/classes/:id/report-release', async (c) => {
  const db = getDb(c.env)
  const body = await parseBody(c, reportReleaseSchema.extend({ termId: z.string().optional() }))
  const w = await termWindow(db, body.termId)
  return c.json(await setRelease(db, c.req.param('id'), w.term.id, body, now()))
})

export const studentReportRoutes = new Hono<AppEnv>()
studentReportRoutes.use('*', requireStudent)
studentReportRoutes.get('/status', async (c) => {
  const s = c.get('session') as Extract<SessionInfo, { kind: 'student' }>
  return c.json(await reportStatus(getDb(c.env), s.classId))
})
studentReportRoutes.get('/', async (c) => {
  const s = c.get('session') as Extract<SessionInfo, { kind: 'student' }>
  return c.json(await studentReportCard(getDb(c.env), s.studentId, s.classId, now()))
})
