import { Hono } from 'hono'
import { gradingSchema } from '../../shared/grades'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { classGrades, gradeForStudent, saveGrading } from './service'

export const teacherGradeRoutes = new Hono<AppEnv>()
teacherGradeRoutes.use('*', requireTeacher)
teacherGradeRoutes.get('/classes/:id/grades', async (c) => c.json(await classGrades(getDb(c.env), c.req.param('id'))))
teacherGradeRoutes.put('/classes/:id/grading', async (c) => {
  await saveGrading(getDb(c.env), c.req.param('id'), await parseBody(c, gradingSchema))
  return c.json(await classGrades(getDb(c.env), c.req.param('id')))
})

export const studentGradeRoutes = new Hono<AppEnv>()
studentGradeRoutes.use('*', requireStudent)
studentGradeRoutes.get('/', async (c) => {
  const s = c.get('session') as Extract<SessionInfo, { kind: 'student' }>
  return c.json(await gradeForStudent(getDb(c.env), s.studentId, s.classId))
})
