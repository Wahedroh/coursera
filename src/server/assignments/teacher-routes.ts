import { Hono } from 'hono'
import { assignmentInputSchema, createAssignmentsSchema, gradeInputSchema, onTimeSchema, paperInputSchema, returnInputSchema } from '../../shared/assignments'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { publishSchema } from '../../shared/timetable'
import { resolvePublish } from '../timetable/service'
import { invalidateRelease } from '../timetable/release'
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
  setOnTime,
  updateAssignment,
} from './service'

export const teacherAssignmentRoutes = new Hono<AppEnv>()
teacherAssignmentRoutes.use('*', requireTeacher)

teacherAssignmentRoutes.post('/assignments', async (c) => {
  const { classIds, publishMode, publishAt, ...input } = await parseBody(c, createAssignmentsSchema.extend(publishSchema.shape))
  const db = getDb(c.env)
  const sched = await resolvePublish(db, classIds, { publishMode, publishAt }, now())
  const ids = await createAssignments(db, classIds, input, sched)
  const nowIds = classIds.filter((id) => sched.get(id)?.published)
  if (nowIds.length < classIds.length) invalidateRelease()
  if (nowIds.length) await pushInBackground(c, (d) => enqueueForClasses(d, nowIds, { title: '📝 งานใหม่', body: input.title, url: '/me?sheet=pending' }, now()))
  return c.json({ ids })
})

teacherAssignmentRoutes.get('/classes/:id/assignments', async (c) => c.json(await listForClass(getDb(c.env), c.req.param('id'))))

teacherAssignmentRoutes.get('/assignments/:id', async (c) => c.json(await getAssignment(getDb(c.env), c.req.param('id'))))

teacherAssignmentRoutes.put('/assignments/:id', async (c) => {
  await updateAssignment(getDb(c.env), c.req.param('id'), await parseBody(c, assignmentInputSchema))
  return c.json({ ok: true })
})

teacherAssignmentRoutes.delete('/assignments/:id', async (c) => {
  return c.json(await deleteAssignment(getDb(c.env), c.env.BUCKET, c.req.param('id'), c.req.query('force') === '1'))
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

/** ส่งสาย ↔ นับว่าตรงเวลา (ครูแก้ได้) */
teacherAssignmentRoutes.put('/submissions/:id/on-time', async (c) => {
  const { onTime } = await parseBody(c, onTimeSchema)
  return c.json(await setOnTime(getDb(c.env), c.req.param('id'), onTime, now()))
})

teacherAssignmentRoutes.delete('/submissions/:id/paper', async (c) => {
  await undoPaper(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
