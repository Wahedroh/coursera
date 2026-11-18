import { Hono } from 'hono'
import { remedialDecisionSchema, remedialInputSchema, remedialSubmitSchema } from '../../shared/remedial'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { atRisk, createRemedials, decideRemedial, deleteRemedial, getStudentRemedial, studentRemedials, submitRemedial } from './service'

export const teacherRemedialRoutes = new Hono<AppEnv>()
teacherRemedialRoutes.use('*', requireTeacher)
teacherRemedialRoutes.get('/classes/:id/at-risk', async (c) => c.json(await atRisk(getDb(c.env), c.req.param('id'), now())))
teacherRemedialRoutes.post('/remedials', async (c) => c.json(await createRemedials(getDb(c.env), await parseBody(c, remedialInputSchema), now()), 201))
teacherRemedialRoutes.put('/remedials/:id/decision', async (c) => {
  await decideRemedial(getDb(c.env), c.req.param('id'), await parseBody(c, remedialDecisionSchema), now())
  return c.json({ ok: true })
})
teacherRemedialRoutes.delete('/remedials/:id', async (c) => {
  await deleteRemedial(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

type StudentSession = Extract<SessionInfo, { kind: 'student' }>
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as StudentSession
export const studentRemedialRoutes = new Hono<AppEnv>()
studentRemedialRoutes.use('*', requireStudent)
studentRemedialRoutes.get('/', async (c) => c.json(await studentRemedials(getDb(c.env), me(c).studentId)))
studentRemedialRoutes.get('/:id', async (c) => c.json(await getStudentRemedial(getDb(c.env), me(c).studentId, c.req.param('id'))))
studentRemedialRoutes.put('/:id/submission', async (c) => c.json(await submitRemedial(getDb(c.env), me(c).studentId, c.req.param('id'), await parseBody(c, remedialSubmitSchema), now())))
