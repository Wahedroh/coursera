import { Hono } from 'hono'
import { MAX_MATERIAL_BYTES, materialMetaSchema, materialPublishSchema } from '../../shared/materials'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { hitRateLimit } from '../auth/rate-limit'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { apiError, parseBody } from '../http'
import { createMaterials, deleteMaterial, invalidMaterial, listMaterials, materialsForStudent, setMaterialPublished, updateMaterial } from './service'

export const teacherMaterialRoutes = new Hono<AppEnv>()
teacherMaterialRoutes.use('*', requireTeacher)

/** อัปโหลด: เนื้อไฟล์เป็น body ตรง ๆ ข้อมูลอื่นอยู่ใน query (classIds คั่นด้วย ,) */
teacherMaterialRoutes.post('/materials', async (c) => {
  if (Number(c.req.header('content-length') ?? 0) > MAX_MATERIAL_BYTES) throw invalidMaterial()
  const meta = materialMetaSchema.safeParse({ title: c.req.query('title') ?? '', topic: c.req.query('topic') ?? '' })
  if (!meta.success) throw apiError('invalid_request', 'กรุณาใส่ชื่อเอกสาร', 400)
  const db = getDb(c.env)
  if (await hitRateLimit(db, 'upload:teacher', 600, 60 * 60 * 1000)) throw apiError('too_many_uploads', 'อัปโหลดบ่อยเกินไป กรุณารอสักครู่', 429)
  const classIds = (c.req.query('classIds') ?? '').split(',').filter(Boolean).slice(0, 50)
  const ids = await createMaterials(db, c.env.BUCKET, classIds, meta.data, c.req.query('name') ?? '', await c.req.arrayBuffer(), now())
  return c.json({ ids })
})
teacherMaterialRoutes.get('/classes/:id/materials', async (c) => c.json(await listMaterials(getDb(c.env), c.req.param('id'))))
teacherMaterialRoutes.put('/materials/:id', async (c) => {
  await updateMaterial(getDb(c.env), c.req.param('id'), await parseBody(c, materialMetaSchema))
  return c.json({ ok: true })
})
teacherMaterialRoutes.put('/materials/:id/published', async (c) => {
  const { published } = await parseBody(c, materialPublishSchema)
  await setMaterialPublished(getDb(c.env), c.req.param('id'), published)
  return c.json({ ok: true })
})
teacherMaterialRoutes.delete('/materials/:id', async (c) => {
  await deleteMaterial(getDb(c.env), c.env.BUCKET, c.req.param('id'))
  return c.json({ ok: true })
})

export const studentMaterialRoutes = new Hono<AppEnv>()
studentMaterialRoutes.use('*', requireStudent)
studentMaterialRoutes.get('/', async (c) => {
  const s = c.get('session') as Extract<SessionInfo, { kind: 'student' }>
  return c.json(await materialsForStudent(getDb(c.env), s.classId))
})
