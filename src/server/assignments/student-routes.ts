import { Hono } from 'hono'
import { submissionInputSchema } from '../../shared/assignments'
import { requireStudent } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { getForStudent, listForStudent, upsertSubmission } from './service'

type StudentSession = Extract<SessionInfo, { kind: 'student' }>

export const studentAssignmentRoutes = new Hono<AppEnv>()
studentAssignmentRoutes.use('*', requireStudent)
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as StudentSession

studentAssignmentRoutes.get('/', async (c) => c.json(await listForStudent(getDb(c.env), me(c).studentId, me(c).classId)))

studentAssignmentRoutes.get('/:id', async (c) =>
  c.json(await getForStudent(getDb(c.env), c.req.param('id'), me(c).studentId, me(c).classId)),
)

studentAssignmentRoutes.put('/:id/submission', async (c) => {
  const input = await parseBody(c, submissionInputSchema)
  const s = me(c)
  return c.json(await upsertSubmission(getDb(c.env), { assignmentId: c.req.param('id'), studentId: s.studentId, classId: s.classId, input, now: now() }))
})
