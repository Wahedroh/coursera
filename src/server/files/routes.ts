import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireSession } from '../auth/middleware'
import { getDb, newId } from '../db/client'
import { submissions } from '../db/schema'
import type { AppEnv } from '../env'
import { apiError } from '../http'
import { canRead, checkImage, EXT, MAX_IMAGE_BYTES, putImage } from './service'
import { hitRateLimit } from '../auth/rate-limit'

export const fileRoutes = new Hono<AppEnv>()

const unauthorized = () => apiError('unauthorized', 'กรุณาเข้าสู่ระบบ', 401)

fileRoutes.post('/', async (c) => {
  const s = requireSession(c)
  const kind = c.req.query('kind')
  // ใหญ่เกินไม่ต้องอ่านทั้งก้อน
  if (Number(c.req.header('content-length') ?? 0) > MAX_IMAGE_BYTES) throw apiError('invalid_image', 'รูปใหญ่เกินไป', 400)
  // จำกัดจำนวนอัปโหลด กันพื้นที่ R2 เต็ม (นักเรียน 60 รูป/ชม. ครู 600 รูป/ชม.)
  const who = s.kind === 'student' ? `upload:s:${s.studentId}` : 'upload:teacher'
  if (await hitRateLimit(getDb(c.env), who, s.kind === 'student' ? 60 : 600, 60 * 60 * 1000)) {
    throw apiError('too_many_uploads', 'อัปโหลดรูปบ่อยเกินไป กรุณารอสักครู่', 429)
  }
  const body = await c.req.arrayBuffer()
  const type = checkImage(body, c.req.header('content-type') ?? '')
  let key: string
  if (kind === 'submission') {
    if (s.kind !== 'student') throw unauthorized()
    key = `sub/${s.studentId}/${newId()}.${EXT[type]}`
  } else if (kind === 'attachment') {
    if (s.kind !== 'teacher') throw unauthorized()
    key = `asg/${newId()}.${EXT[type]}`
  } else if (kind === 'annotation') {
    if (s.kind !== 'teacher') throw unauthorized()
    const submissionId = c.req.query('submissionId') ?? ''
    const [sub] = await getDb(c.env).select({ id: submissions.id }).from(submissions).where(eq(submissions.id, submissionId))
    if (!sub) throw apiError('submission_not_found', 'ไม่พบงานที่ส่ง', 404)
    key = `ann/${sub.id}/${newId()}.${EXT[type]}`
  } else {
    throw apiError('invalid_request', 'ข้อมูลไม่ถูกต้อง', 400)
  }
  await putImage(c.env.BUCKET, key, body, type)
  return c.json({ key })
})

fileRoutes.get('/*', async (c) => {
  const s = requireSession(c)
  const notFound = () => apiError('not_found', 'ไม่พบไฟล์', 404)
  let key: string
  try {
    key = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ''))
  } catch {
    throw notFound()
  }
  if (!(await canRead(getDb(c.env), s, key))) throw notFound()
  const obj = await c.env.BUCKET.get(key)
  if (!obj) throw notFound()
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'",
    },
  })
})
