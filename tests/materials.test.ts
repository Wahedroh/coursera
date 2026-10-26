import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { purgeOrphans } from '../src/server/storage/service'
import { del, getJson, json, loginTeacher, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])
const PPT = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])

async function upload(cookie: string, classIds: string[], name: string, body: Uint8Array<ArrayBuffer>, title = 'ใบความรู้ บทที่ 1', topic = 'บทที่ 1') {
  const { SELF } = await import('cloudflare:test')
  const qs = new URLSearchParams({ classIds: classIds.join(','), name, title, topic })
  return SELF.fetch(`http://x/api/teacher/materials?${qs}`, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: new Blob([body]) })
}

async function setup() {
  const cookie = await loginTeacher()
  const a = (await seedClass(db())).classId
  const b = (await seedClass(db())).classId
  const sa = await studentCookie((await seedStudent(db(), a)).id)
  const sb = await studentCookie((await seedStudent(db(), b)).id)
  return { cookie, a, b, sa, sb }
}

it('ครูอัปโหลด PDF Word PowerPoint ได้ และปฏิเสธไฟล์ปลอม/นามสกุลอื่น', async () => {
  const { cookie, a } = await setup()
  expect((await upload(cookie, [a], 'บทที่1.pdf', PDF)).status).toBe(200)
  expect((await upload(cookie, [a], 'งาน.docx', DOCX)).status).toBe(200)
  expect((await upload(cookie, [a], 'สไลด์.ppt', PPT)).status).toBe(200)
  expect((await upload(cookie, [a], 'ปลอม.pdf', DOCX)).status).toBe(400)
  expect((await upload(cookie, [a], 'virus.exe', PDF)).status).toBe(400)
  expect((await upload(cookie, [a], 'a.pdf', PDF, '')).status).toBe(400)
  expect((await upload(cookie, ['nope'], 'a.pdf', PDF)).status).toBe(404)
  const list = await json(await getJson(`/api/teacher/classes/${a}/materials`, cookie))
  expect(list).toHaveLength(3)
  expect(list[0]).toEqual(expect.objectContaining({ topic: 'บทที่ 1', published: true }))
})

it('นักเรียนเห็นและเปิดได้เฉพาะเอกสารที่แสดงในห้องตัวเอง', async () => {
  const { cookie, a, sa, sb } = await setup()
  const { ids } = await json(await upload(cookie, [a], 'งาน กลุ่ม.docx', DOCX))
  const [m] = await json(await getJson('/api/student/materials', sa))
  expect(m).toEqual(expect.objectContaining({ id: ids[0], fileName: 'งาน กลุ่ม.docx', size: DOCX.byteLength }))
  const file = await getJson(`/api/files/${m.fileKey}`, sa)
  expect(file.status).toBe(200)
  expect(file.headers.get('content-disposition')).toContain('attachment')
  expect(file.headers.get('content-disposition')).toContain(encodeURIComponent('งาน กลุ่ม.docx'))
  expect(await json(await getJson('/api/student/materials', sb))).toEqual([])
  expect((await getJson(`/api/files/${m.fileKey}`, sb)).status).toBe(404)
  await putJson(`/api/teacher/materials/${ids[0]}/published`, { published: false }, cookie)
  expect(await json(await getJson('/api/student/materials', sa))).toEqual([])
  expect((await getJson(`/api/files/${m.fileKey}`, sa)).status).toBe(404)
})

it('PDF เปิดดูในเบราว์เซอร์ได้; แก้ชื่อได้; นักเรียนอัปโหลดไม่ได้', async () => {
  const { cookie, a, sa } = await setup()
  const { ids } = await json(await upload(cookie, [a], 'x.pdf', PDF))
  const [m] = await json(await getJson(`/api/teacher/classes/${a}/materials`, cookie))
  expect((await getJson(`/api/files/${m.fileKey}`, cookie)).headers.get('content-disposition')).toMatch(/^inline/)
  expect((await putJson(`/api/teacher/materials/${ids[0]}`, { title: 'ใหม่', topic: 'บท 2' }, cookie)).status).toBe(200)
  expect((await json(await getJson(`/api/teacher/classes/${a}/materials`, cookie)))[0].title).toBe('ใหม่')
  expect((await upload(sa, [a], 'x.pdf', PDF)).status).toBe(401)
})

it('ไฟล์เดียวหลายห้อง: ลบห้องหนึ่งไฟล์ยังอยู่ ลบครบแล้วคืนพื้นที่ และไม่ถูกลบเป็นไฟล์ค้าง', async () => {
  const { cookie, a, b, sb } = await setup()
  const { ids } = await json(await upload(cookie, [a, b], 'x.pdf', PDF))
  const [m] = await json(await getJson(`/api/teacher/classes/${a}/materials`, cookie))
  expect((await purgeOrphans(db(), env.BUCKET, Date.now() + 3 * 86400_000)).files).toBe(0)
  expect((await json(await getJson('/api/teacher/storage', cookie))).usage.bytes).toBe(PDF.byteLength)
  expect((await del(`/api/teacher/materials/${ids[0]}`, cookie)).status).toBe(200)
  expect((await getJson(`/api/files/${m.fileKey}`, sb)).status).toBe(200)
  await del(`/api/teacher/materials/${ids[1]}`, cookie)
  expect(await env.BUCKET.get(m.fileKey)).toBeNull()
  expect((await json(await getJson('/api/teacher/storage', cookie))).usage.bytes).toBe(0)
})
