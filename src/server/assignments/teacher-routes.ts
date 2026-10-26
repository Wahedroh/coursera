import { Hono } from 'hono'
import { assignmentInputSchema, createAssignmentsSchema, gradeInputSchema, returnInputSchema } from '../../shared/assignments'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import {
  createAssignments,
  deleteAssignment,
  getAssignment,
  getSubmission,
  gradeSubmission,
  gradebook,
  listForClass,
  returnSubmission,
  updateAssignment,
} from './service'

export const teacherAssignmentRoutes = new Hono<AppEnv>()
teacherAssignmentRoutes.use('*', requireTeacher)

teacherAssignmentRoutes.post('/assignments', async (c) => {
  const { classIds, ...input } = await parseBody(c, createAssignmentsSchema)
  return c.json({ ids: await createAssignments(getDb(c.env), classIds, input) })
})

teacherAssignmentRoutes.get('/classes/:id/assignments', async (c) => c.json(await listForClass(getDb(c.env), c.req.param('id'))))

teacherAssignmentRoutes.get('/assignments/:id', async (c) => c.json(await getAssignment(getDb(c.env), c.req.param('id'))))

teacherAssignmentRoutes.put('/assignments/:id', async (c) => {
  await updateAssignment(getDb(c.env), c.req.param('id'), await parseBody(c, assignmentInputSchema))
  return c.json({ ok: true })
})

teacherAssignmentRoutes.delete('/assignments/:id', async (c) => {
  await deleteAssignment(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

teacherAssignmentRoutes.get('/classes/:id/gradebook', async (c) => c.json(await gradebook(getDb(c.env), c.req.param('id'))))

teacherAssignmentRoutes.get('/submissions/:id', async (c) => c.json(await getSubmission(getDb(c.env), c.req.param('id'))))

teacherAssignmentRoutes.post('/submissions/:id/grade', async (c) => {
  await gradeSubmission(getDb(c.env), c.req.param('id'), await parseBody(c, gradeInputSchema), now())
  return c.json({ ok: true })
})

teacherAssignmentRoutes.post('/submissions/:id/return', async (c) => {
  const { comment } = await parseBody(c, returnInputSchema)
  await returnSubmission(getDb(c.env), c.req.param('id'), comment, now())
  return c.json({ ok: true })
})
