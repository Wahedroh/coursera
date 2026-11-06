import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

beforeEach(resetDb)

it('ครูเห็นรายการไฟล์สำรอง (ใหม่สุดก่อน) และดาวน์โหลดได้ · นักเรียนเข้าไม่ได้', async () => {
  const cookie = await loginTeacher()
  await env.BACKUPS.put('db/2026-11-01-0200.sql.gz', new Uint8Array([0x1f, 0x8b, 1]))
  await new Promise((r) => setTimeout(r, 5))
  await env.BACKUPS.put('db/2026-11-08-0200.sql.gz', new Uint8Array([0x1f, 0x8b, 2, 3]))
  await env.BACKUPS.put('other/x.txt', 'ไม่ใช่ไฟล์สำรอง')
  const list = await json(await getJson('/api/teacher/backups', cookie))
  expect(list.map((b: { name: string }) => b.name)).toEqual(['2026-11-08-0200.sql.gz', '2026-11-01-0200.sql.gz'])
  expect(list[0].size).toBe(4)
  const file = await getJson('/api/teacher/backups/2026-11-08-0200.sql.gz', cookie)
  expect(file.status).toBe(200)
  expect(file.headers.get('content-disposition')).toContain('classroom-2026-11-08-0200.sql.gz')
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([0x1f, 0x8b, 2, 3]))
  expect((await getJson('/api/teacher/backups/nope.sql.gz', cookie)).status).toBe(404)
  expect((await getJson('/api/teacher/backups/..%2Fother%2Fx.txt', cookie)).status).toBe(404)
  const { classId } = await seedClass(getDb(env))
  const s = await studentCookie((await seedStudent(getDb(env), classId)).id)
  expect((await getJson('/api/teacher/backups', s)).status).toBe(401)
  expect((await getJson('/api/teacher/backups/2026-11-08-0200.sql.gz', s)).status).toBe(401)
})
