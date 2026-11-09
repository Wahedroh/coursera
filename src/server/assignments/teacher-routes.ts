import { Hono } from 'hono'
import { assignmentInputSchema, createAssignmentsSchema, gradeInputSchema, paperInputSchema, returnInputSchema } from '../../shared/assignments'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { enqueue, enqueueForClasses } from '../push/service'
import { pushInBackground } from '../push/routes'
import {
  createAssignments,
  deleteAssignment,
  getAssignment,
  getSubmission,
  gradeSubmission,
  gradebook,
  listForClass,
  recordPaper,
  undoPaper,
  returnSubmission,
  updateAssignment,
} from './service'

export const teacherAssignmentRoutes = new Hono<AppEnv>()
teacherAssignmentRoutes.use('*', requireTeacher)

teacherAssignmentRoutes.post('/assignments', async (c) => {
  const { classIds, ...input } = await parseBody(c, createAssignmentsSchema)
  const ids = await createAssignments(getDb(c.env), classIds, input)
  await pushInBackground(c, (db) => enqueueForClasses(db, classIds, { title: '📝 งานใหม่', body: input.title, url: '/me' }, now()))
  return c.json({ ids })
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
  const { submission, assignment } = await getSubmission(getDb(c.env), c.req.param('id'))
  await pushInBackground(c, (db) =>
    enqueue(db, [{ studentId: submission.studentId, title: '↩️ ครูส่งงานกลับให้แก้', body: comment ? `${assignment.title}: ${comment}` : assignment.title, url: `/me/assignments/${assignment.id}` }], now()),
  )
  return c.json({ ok: true })
})

teacherAssignmentRoutes.put('/assignments/:id/paper/:studentId', async (c) =>
  c.json(await recordPaper(getDb(c.env), c.req.param('id'), c.req.param('studentId'), await parseBody(c, paperInputSchema), now())),
)

teacherAssignmentRoutes.delete('/submissions/:id/paper', async (c) => {
  await undoPaper(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
