import { env, SELF } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { json, loginTeacher, resetDb, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function twoStudents() {
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const b = await seedStudent(db(), classId)
  return { a, b, ca: await studentCookie(a.id), cb: await studentCookie(b.id) }
}
const get = (key: string, cookie?: string) => SELF.fetch(`http://x/api/files/${key}`, { headers: cookie ? { cookie } : {} })

it('นักเรียนอัปโหลดรูปได้ key ขึ้นต้น sub/<id>/', async () => {
  const { a, ca } = await twoStudents()
  const res = await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', ca)
  expect(res.status).toBe(200)
  expect((await json(res)).key).toMatch(new RegExp(`^sub/${a.id}/[0-9A-Z]{26}\\.jpg$`))
})

it('ไฟล์ไม่ใช่รูปหรือเกิน 5MB ได้ 400 invalid_image', async () => {
  const { ca } = await twoStudents()
  const r1 = await uploadFile('kind=submission', 'hello', 'text/plain', ca)
  expect(r1.status).toBe(400)
  expect((await json(r1)).error.code).toBe('invalid_image')
  const r2 = await uploadFile('kind=submission', new Uint8Array(5 * 1024 * 1024 + 1), 'image/jpeg', ca)
  expect(r2.status).toBe(400)
})

it('นักเรียนอัปโหลด attachment ได้ 401', async () => {
  const { ca } = await twoStudents()
  expect((await uploadFile('kind=attachment', TINY_JPEG, 'image/jpeg', ca)).status).toBe(401)
})

it('นักเรียนอ่านรูปตัวเองได้ อ่านของเพื่อนได้ 404', async () => {
  const { ca, cb } = await twoStudents()
  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', ca))
  const own = await get(key, ca)
  expect(own.status).toBe(200)
  expect(own.headers.get('content-type')).toBe('image/jpeg')
  expect(new Uint8Array(await own.arrayBuffer())).toEqual(TINY_JPEG)
  expect((await get(key, cb)).status).toBe(404)
})

it('ครูอ่านได้ทุกไฟล์ และอัปโหลด attachment ได้', async () => {
  const { ca } = await twoStudents()
  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', ca))
  const teacher = await loginTeacher()
  expect((await get(key, teacher)).status).toBe(200)
  const att = await uploadFile('kind=attachment', TINY_JPEG, 'image/png', teacher)
  expect((await json(att)).key).toMatch(/^asg\/[0-9A-Z]{26}\.png$/)
})

it('ไม่ล็อกอินอ่านได้ 401 และไฟล์ไม่มีอยู่ได้ 404', async () => {
  const teacher = await loginTeacher()
  expect((await get('sub/x/y.jpg')).status).toBe(401)
  expect((await get('sub/x/none.jpg', teacher)).status).toBe(404)
})
