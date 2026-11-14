import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { purgeOrphans } from '../src/server/storage/service'
import type { StudentMaterial } from '../src/shared/materials'
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

async function uploadQs(cookie: string, extra: Record<string, string>) {
  const { SELF } = await import('cloudflare:test')
  const qs = new URLSearchParams({ name: 'x.pdf', title: 'จดบนกระดาน', topic: 'บทที่ 2', ...extra })
  return SELF.fetch(`http://x/api/teacher/materials?${qs}`, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: new Blob([PDF]) })
}

it('แยกเอกสารเปล่ากับเอกสารที่จดในห้อง · วันที่สอนต้องถูกรูปแบบ · แจ้งเตือนเมื่อขอ', async () => {
  const { cookie, a, b, sa, sb } = await setup()
  await upload(cookie, [a], 'ใบงาน.pdf', PDF, 'ใบงานเปล่า')
  expect((await uploadQs(cookie, { classIds: a, kind: 'notes', lessonDate: '2026-11-10', title: 'จด 10 พ.ย.' })).status).toBe(200)
  expect((await uploadQs(cookie, { classIds: `${a},${b}`, kind: 'notes', lessonDate: '2026-11-12', title: 'จด 12 พ.ย.', notify: '1' })).status).toBe(200)
  expect((await uploadQs(cookie, { classIds: a, kind: 'notes', lessonDate: '12/11/2026' })).status).toBe(400)
  expect((await uploadQs(cookie, { classIds: a, kind: 'other' })).status).toBe(400)
  // เอกสารเปล่าไม่เก็บวันที่สอน
  await uploadQs(cookie, { classIds: b, kind: 'blank', lessonDate: '2026-11-12', title: 'เปล่า b' })

  const mine = await json(await getJson('/api/student/materials', sa))
  expect(mine.map((m: { title: string; kind: string; lessonDate: string }) => [m.title, m.kind, m.lessonDate]).sort()).toEqual([
    ['จด 10 พ.ย.', 'notes', '2026-11-10'],
    ['จด 12 พ.ย.', 'notes', '2026-11-12'],
    ['ใบงานเปล่า', 'blank', ''],
  ])
  const { splitMaterials } = await import('../src/shared/materials')
  expect(splitMaterials(mine as StudentMaterial[]).notes.map((m) => m.title)).toEqual(['จด 12 พ.ย.', 'จด 10 พ.ย.'])
  const other = await json(await getJson('/api/student/materials', sb))
  expect(other.find((m: { title: string }) => m.title === 'เปล่า b')).toMatchObject({ kind: 'blank', lessonDate: '' })

  // แจ้งเตือนเฉพาะที่ขอ (12 พ.ย.) ทั้งสองห้อง
  const box = await json(await getJson('/api/student/push/notifications', sb))
  expect(box.items.map((n: { title: string; url: string }) => [n.title, n.url])).toEqual([['📒 เอกสารที่จดในห้อง: จด 12 พ.ย.', '/me/materials?tab=notes']])
  expect((await json(await getJson('/api/student/push/notifications', sa))).items).toHaveLength(1)

  // แก้เป็นเอกสารเปล่า → วันที่หายไป
  const id = mine.find((m: { title: string }) => m.title === 'จด 10 พ.ย.').id
  expect((await putJson(`/api/teacher/materials/${id}`, { title: 'จด 10 พ.ย.', topic: '', kind: 'blank', lessonDate: '2026-11-10' }, cookie)).status).toBe(200)
  const after = (await json(await getJson(`/api/teacher/classes/${a}/materials`, cookie))).find((m: { id: string }) => m.id === id)
  expect(after).toMatchObject({ kind: 'blank', lessonDate: '' })
})

it('พื้นที่เก็บไฟล์: แยกตามประเภท (เอกสารเปล่า/จดในห้อง/รูปงาน) และรวมเท่ากับที่ใช้ทั้งหมด', async () => {
  const { cookie, a } = await setup()
  await upload(cookie, [a], 'ใบงาน.pdf', PDF)
  const { SELF } = await import('cloudflare:test')
  const qs = new URLSearchParams({ classIds: a, name: 'จด.pdf', title: 'จด', topic: '', kind: 'notes', lessonDate: '2026-11-14' })
  await SELF.fetch(`http://x/api/teacher/materials?${qs}`, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: new Blob([DOCX.slice(0, 0), PDF, PDF]) })
  const r = await json(await getJson('/api/teacher/storage', cookie))
  const by = Object.fromEntries(r.breakdown.map((p: { id: string; bytes: number; files: number }) => [p.id, p]))
  expect(by['mat-blank']).toMatchObject({ files: 1, bytes: PDF.byteLength })
  expect(by['mat-notes']).toMatchObject({ files: 1, bytes: PDF.byteLength * 2 })
  expect(r.breakdown.reduce((n: number, p: { bytes: number }) => n + p.bytes, 0)).toBe(r.usage.bytes)
  expect(r.breakdown.reduce((n: number, p: { files: number }) => n + p.files, 0)).toBe(r.usage.files)
})
