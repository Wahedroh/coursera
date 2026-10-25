import { Hono } from 'hono'
import { sessionMiddleware } from './auth/middleware'
import { teacherAuthRoutes } from './auth/teacher-routes'
import type { AppEnv } from './env'
import { apiError, onError } from './http'

const app = new Hono<AppEnv>()
app.onError(onError)

app.use('/api/*', sessionMiddleware)
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api', teacherAuthRoutes)

app.all('/api/*', () => {
  throw apiError('not_found', 'ไม่พบหน้าที่ต้องการ', 404)
})

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
