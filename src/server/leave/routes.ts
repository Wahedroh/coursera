import { Hono } from 'hono'
import { leaveDecisionSchema, leaveInputSchema } from '../../shared/leave'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { cancelLeave, createLeave, decideLeave, listStudentLeaves, pendingLeaveCount, teacherLeaves } from './service'

type StudentSession = Extract<SessionInfo, { kind: 'student' }>

export const studentLeaveRoutes = new Hono<AppEnv>()
studentLeaveRoutes.use('*', requireStudent)
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as StudentSession

studentLeaveRoutes.get('/', async (c) => c.json(await listStudentLeaves(getDb(c.env), me(c).studentId)))
studentLeaveRoutes.post('/', async (c) => {
  const input = await parseBody(c, leaveInputSchema)
  const s = me(c)
  return c.json(await createLeave(getDb(c.env), { studentId: s.studentId, classId: s.classId, input, t: now() }), 201)
})
studentLeaveRoutes.delete('/:id', async (c) => {
  await cancelLeave(getDb(c.env), me(c).studentId, c.req.param('id'))
  return c.json({ ok: true })
})

export const teacherLeaveRoutes = new Hono<AppEnv>()
teacherLeaveRoutes.use('*', requireTeacher)
teacherLeaveRoutes.get('/leaves', async (c) => c.json(await teacherLeaves(getDb(c.env))))
teacherLeaveRoutes.get('/leaves/count', async (c) => c.json({ pending: await pendingLeaveCount(getDb(c.env)) }))
teacherLeaveRoutes.put('/leaves/:id', async (c) => {
  const { approve, note } = await parseBody(c, leaveDecisionSchema)
  return c.json(await decideLeave(getDb(c.env), c.req.param('id'), approve, note, now()))
})
