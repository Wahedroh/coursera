import { Hono } from 'hono'
import { sessionMiddleware } from './auth/middleware'
import { studentAuthRoutes } from './auth/student-routes'
import { teacherAuthRoutes } from './auth/teacher-routes'
import { studentAssignmentRoutes } from './assignments/student-routes'
import { teacherAssignmentRoutes } from './assignments/teacher-routes'
import { studentCheckinRoutes } from './attendance/student-routes'
import { teacherAttendanceRoutes } from './attendance/teacher-routes'
import type { AppEnv } from './env'
import { studentPointsRoutes } from './points/student-routes'
import { teacherPointsRoutes } from './points/teacher-routes'
import { fileRoutes } from './files/routes'
import { rosterRoutes } from './roster/routes'
import { studentScoreRoutes } from './scores/student-routes'
import { studentGradeRoutes, teacherGradeRoutes } from './grades/routes'
import { teacherStorageRoutes } from './storage/routes'
import { studentMaterialRoutes, teacherMaterialRoutes } from './materials/routes'
import { studentVideoRoutes } from './videos/student-routes'
import { teacherVideoRoutes } from './videos/teacher-routes'
import { studentFeeRoutes } from './fees/student-routes'
import { teacherFeeRoutes } from './fees/teacher-routes'
import { teacherScoreRoutes } from './scores/teacher-routes'
import { apiError, onError } from './http'

const app = new Hono<AppEnv>()
app.onError(onError)

app.use('/api/*', sessionMiddleware)
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api', teacherAuthRoutes)
app.route('/api/teacher', rosterRoutes)
app.route('/api/teacher', teacherAssignmentRoutes)
app.route('/api/teacher', teacherAttendanceRoutes)
app.route('/api/teacher', teacherPointsRoutes)
app.route('/api/teacher', teacherScoreRoutes)
app.route('/api/teacher', teacherVideoRoutes)
app.route('/api/teacher', teacherMaterialRoutes)
app.route('/api/teacher', teacherFeeRoutes)
app.route('/api/teacher', teacherStorageRoutes)
app.route('/api/teacher', teacherGradeRoutes)
app.route('/api/student/assignments', studentAssignmentRoutes)
app.route('/api/student/checkin', studentCheckinRoutes)
app.route('/api/student/scores', studentScoreRoutes)
app.route('/api/student/grade', studentGradeRoutes)
app.route('/api/student/videos', studentVideoRoutes)
app.route('/api/student/materials', studentMaterialRoutes)
app.route('/api/student/fees', studentFeeRoutes)
app.route('/api/student', studentPointsRoutes)
app.route('/api/student', studentAuthRoutes)
app.route('/api/files', fileRoutes)

app.all('/api/*', () => {
  throw apiError('not_found', 'ไม่พบหน้าที่ต้องการ', 404)
})

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
