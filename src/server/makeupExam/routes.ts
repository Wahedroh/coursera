import { Hono } from 'hono'
import { examSetInputSchema, makeupAnswersSchema, makeupApproveSchema, makeupEventSchema, makeupGradeSchema, makeupGrantSchema, makeupRejectSchema, makeupRequestSchema, makeupStartSchema } from '../../shared/makeupExam'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { hitRateLimit } from '../auth/rate-limit'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { apiError, parseBody } from '../http'
import {
  approveMakeup,
  createExamSet,
  deleteExamSet,
  getExamSet,
  grantMakeup,
  gradeMakeupExam,
  listExamSets,
  makeupEvent,
  pendingMakeupCount,
  rejectMakeup,
  requestMakeup,
  resumeMakeup,
  saveMakeupAnswers,
  saveProctorPhoto,
  startMakeup,
  studentMakeups,
  submitMakeup,
  teacherMakeupDetail,
  teacherMakeups,
  updateExamSet,
} from './service'

export const teacherMakeupRoutes = new Hono<AppEnv>()
teacherMakeupRoutes.use('*', requireTeacher)
teacherMakeupRoutes.get('/exam-sets', async (c) => c.json(await listExamSets(getDb(c.env))))
teacherMakeupRoutes.post('/exam-sets', async (c) => c.json({ id: await createExamSet(getDb(c.env), await parseBody(c, examSetInputSchema), now()) }, 201))
teacherMakeupRoutes.get('/exam-sets/:id', async (c) => c.json(await getExamSet(getDb(c.env), c.req.param('id'))))
teacherMakeupRoutes.put('/exam-sets/:id', async (c) => {
  await updateExamSet(getDb(c.env), c.req.param('id'), await parseBody(c, examSetInputSchema), now())
  return c.json({ ok: true })
})
teacherMakeupRoutes.delete('/exam-sets/:id', async (c) => {
  await deleteExamSet(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
teacherMakeupRoutes.get('/makeup-exams', async (c) => c.json(await teacherMakeups(getDb(c.env), now())))
teacherMakeupRoutes.get('/makeup-exams/count', async (c) => c.json({ pending: await pendingMakeupCount(getDb(c.env)) }))
teacherMakeupRoutes.post('/makeup-exams', async (c) => c.json(await grantMakeup(getDb(c.env), await parseBody(c, makeupGrantSchema), now()), 201))
teacherMakeupRoutes.get('/makeup-exams/:id', async (c) => c.json(await teacherMakeupDetail(getDb(c.env), c.req.param('id'), now())))
teacherMakeupRoutes.put('/makeup-exams/:id/approve', async (c) => c.json(await approveMakeup(getDb(c.env), c.req.param('id'), await parseBody(c, makeupApproveSchema), now())))
teacherMakeupRoutes.put('/makeup-exams/:id/reject', async (c) => {
  await rejectMakeup(getDb(c.env), c.req.param('id'), (await parseBody(c, makeupRejectSchema)).note, now())
  return c.json({ ok: true })
})
teacherMakeupRoutes.put('/makeup-exams/:id/grade', async (c) => {
  const { score, note } = await parseBody(c, makeupGradeSchema)
  await gradeMakeupExam(getDb(c.env), c.req.param('id'), score, note, now())
  return c.json({ ok: true })
})

type StudentSession = Extract<SessionInfo, { kind: 'student' }>
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as StudentSession
/** เครื่องที่ใช้สอบ (สุ่มเก็บในเครื่องนักเรียน) */
const device = (c: { req: { header(n: string): string | undefined } }) => {
  const d = c.req.header('x-exam-device') ?? ''
  if (d.length < 8 || d.length > 80) throw apiError('no_device', 'ไม่พบรหัสเครื่อง กรุณาเปิดหน้าสอบใหม่', 400)
  return d
}
export const studentMakeupRoutes = new Hono<AppEnv>()
studentMakeupRoutes.use('*', requireStudent)
studentMakeupRoutes.get('/', async (c) => c.json(await studentMakeups(getDb(c.env), me(c).studentId, me(c).classId)))
studentMakeupRoutes.post('/', async (c) => {
  const input = await parseBody(c, makeupRequestSchema)
  return c.json({ id: await requestMakeup(getDb(c.env), { studentId: me(c).studentId, classId: me(c).classId, ...input, t: now() }) }, 201)
})
studentMakeupRoutes.post('/:id/start', async (c) => {
  const { code, deviceId } = await parseBody(c, makeupStartSchema)
  const db = getDb(c.env)
  // เดารหัสไม่ได้: 5 ครั้ง / 10 นาที ต่อคน
  if (await hitRateLimit(db, `mkcode:${me(c).studentId}`, 5, 10 * 60_000)) throw apiError('too_many_attempts', 'ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วขอรหัสจากครูอีกครั้ง', 429)
  return c.json(await startMakeup(db, c.req.param('id'), me(c).studentId, code, deviceId, now()))
})
studentMakeupRoutes.get('/:id/exam', async (c) => c.json(await resumeMakeup(getDb(c.env), c.req.param('id'), me(c).studentId, device(c), now())))
studentMakeupRoutes.put('/:id/answers', async (c) => {
  const { answers } = await parseBody(c, makeupAnswersSchema)
  await saveMakeupAnswers(getDb(c.env), c.req.param('id'), me(c).studentId, device(c), answers, now())
  return c.json({ ok: true })
})
studentMakeupRoutes.post('/:id/event', async (c) => {
  const { kind, ms } = await parseBody(c, makeupEventSchema)
  return c.json(await makeupEvent(getDb(c.env), c.req.param('id'), me(c).studentId, device(c), kind, ms, now()))
})
studentMakeupRoutes.post('/:id/photo', async (c) => {
  const kind = c.req.query('kind')
  if (kind !== 'room' && kind !== 'face' && kind !== 'recheck') throw apiError('invalid_request', 'ข้อมูลไม่ถูกต้อง', 400)
  if (Number(c.req.header('content-length') ?? 0) > 400 * 1024) throw apiError('invalid_image', 'รูปใหญ่เกินไป', 400)
  const body = await c.req.arrayBuffer()
  return c.json(await saveProctorPhoto(getDb(c.env), c.env.BUCKET, c.req.param('id'), me(c).studentId, device(c), kind, body, c.req.header('content-type') ?? '', now()), 201)
})
studentMakeupRoutes.post('/:id/submit', async (c) => {
  await submitMakeup(getDb(c.env), c.req.param('id'), me(c).studentId, device(c), now())
  return c.json({ ok: true })
})
