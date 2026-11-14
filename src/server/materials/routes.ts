import { Hono } from 'hono'
import { MAX_MATERIAL_BYTES, materialMetaSchema, materialPublishSchema } from '../../shared/materials'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { hitRateLimit } from '../auth/rate-limit'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { apiError, parseBody } from '../http'
import { publishSchema } from '../../shared/timetable'
import { resolvePublish } from '../timetable/service'
import { invalidateRelease } from '../timetable/release'
import { enqueueForClasses } from '../push/service'
import { pushInBackground } from '../push/routes'
import { createMaterials, deleteMaterial, invalidMaterial, listMaterials, materialsForStudent, setMaterialPublished, updateMaterial } from './service'

export const teacherMaterialRoutes = new Hono<AppEnv>()
teacherMaterialRoutes.use('*', requireTeacher)

/** อัปโหลด: เนื้อไฟล์เป็น body ตรง ๆ ข้อมูลอื่นอยู่ใน query (classIds คั่นด้วย ,) */
teacherMaterialRoutes.post('/materials', async (c) => {
  if (Number(c.req.header('content-length') ?? 0) > MAX_MATERIAL_BYTES) throw invalidMaterial()
  const meta = materialMetaSchema.safeParse({ title: c.req.query('title') ?? '', topic: c.req.query('topic') ?? '', kind: c.req.query('kind') || undefined, lessonDate: c.req.query('lessonDate') ?? '' })
  if (!meta.success) throw apiError('invalid_request', 'กรุณาใส่ชื่อเอกสารให้ถูกต้อง', 400)
  const db = getDb(c.env)
  if (await hitRateLimit(db, 'upload:teacher', 600, 60 * 60 * 1000)) throw apiError('too_many_uploads', 'อัปโหลดบ่อยเกินไป กรุณารอสักครู่', 429)
  const classIds = (c.req.query('classIds') ?? '').split(',').filter(Boolean).slice(0, 50)
  const pub = publishSchema.safeParse({ publishMode: c.req.query('publishMode') || undefined, publishAt: c.req.query('publishAt') ? Number(c.req.query('publishAt')) : undefined })
  if (!pub.success) throw apiError('invalid_request', 'เวลาเผยแพร่ไม่ถูกต้อง', 400)
  const sched = await resolvePublish(db, classIds, pub.data, now())
  const ids = await createMaterials(db, c.env.BUCKET, classIds, meta.data, c.req.query('name') ?? '', await c.req.arrayBuffer(), now(), sched)
  const nowIds = classIds.filter((id) => sched.get(id)?.published)
  if (nowIds.length < classIds.length) invalidateRelease()
  if (meta.data.kind === 'notes' && c.req.query('notify') === '1' && nowIds.length) {
    await pushInBackground(c, (d) => enqueueForClasses(d, nowIds, { title: `📒 เอกสารที่จดในห้อง: ${meta.data.title}`, body: meta.data.topic, url: '/me/materials?tab=notes' }, now()))
  }
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
