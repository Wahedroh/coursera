import { Hono } from 'hono'
import { COPY_TYPES, copySchema, type CopyType } from '../../shared/copy'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { enqueueForClasses } from '../push/service'
import { pushInBackground } from '../push/routes'
import { invalidateRelease } from '../timetable/release'
import { copyItems, library } from './service'

export const teacherCopyRoutes = new Hono<AppEnv>()
teacherCopyRoutes.use('*', requireTeacher)

teacherCopyRoutes.post('/copy', async (c) => {
  const input = await parseBody(c, copySchema)
  const t = now()
  const { created } = await copyItems(getDb(c.env), input, t)
  if (created.some((x) => !x.published)) invalidateRelease()
  const live = created.filter((x) => x.published)
  if (live.length && (input.type === 'assignment' || input.type === 'announcement')) {
    await pushInBackground(c, async (db) => {
      for (const x of live)
        await enqueueForClasses(
          db,
          [x.classId],
          input.type === 'assignment' ? { title: '📝 งานใหม่', body: x.title, url: '/me?sheet=pending' } : { title: `📢 ${x.title}`, body: x.body ?? '', url: '/me' },
          t,
        )
    })
  }
  return c.json({ count: created.length, scheduled: created.filter((x) => !x.published).length })
})

teacherCopyRoutes.get('/library', async (c) => {
  const type = c.req.query('type') ?? ''
  if (!(COPY_TYPES as readonly string[]).includes(type)) throw apiError('invalid_request', 'ประเภทไม่ถูกต้อง', 400)
  return c.json(await library(getDb(c.env), type as CopyType))
})
