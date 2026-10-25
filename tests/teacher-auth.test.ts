import { beforeEach, expect, it } from 'vitest'
import { cookieFrom, getJson, json, loginTeacher, postJson, resetDb } from './helpers'

beforeEach(resetDb)

it('ล็อกอินครูด้วยรหัสถูก ได้ cookie sid HttpOnly และ /api/me เป็น teacher', async () => {
  const res = await postJson('/api/teacher/login', { password: 'teacher-pass' })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
  const sc = res.headers.get('set-cookie')!
  expect(sc).toMatch(/sid=/)
  expect(sc).toMatch(/HttpOnly/i)
  expect(sc).toMatch(/SameSite=Lax/i)
  const me = await getJson('/api/me', cookieFrom(res))
  expect(me.status).toBe(200)
  expect(await me.json()).toEqual({ kind: 'teacher' })
})

it('รหัสผิดได้ 401 invalid_password', async () => {
  const res = await postJson('/api/teacher/login', { password: 'nope' })
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ error: { code: 'invalid_password', message: 'รหัสผ่านไม่ถูกต้อง' } })
})

it('ผิด 10 ครั้งแล้วครั้งที่ 11 ได้ 429 แม้รหัสถูก', async () => {
  for (let i = 0; i < 10; i++) expect((await postJson('/api/teacher/login', { password: 'x' })).status).toBe(401)
  const res = await postJson('/api/teacher/login', { password: 'teacher-pass' })
  expect(res.status).toBe(429)
  expect((await json(res)).error.code).toBe('too_many_attempts')
})

it('logout แล้ว /api/me ได้ 401', async () => {
  const cookie = await loginTeacher()
  expect((await postJson('/api/logout', {}, { cookie })).status).toBe(200)
  const me = await getJson('/api/me', cookie)
  expect(me.status).toBe(401)
  expect(await me.json()).toEqual({ error: { code: 'unauthorized', message: 'กรุณาเข้าสู่ระบบ' } })
})

it('cookie ปลอมได้ 401', async () => {
  expect((await getJson('/api/me', 'sid=fake')).status).toBe(401)
})

it('body ไม่ถูกต้องได้ 400', async () => {
  const res = await postJson('/api/teacher/login', { pw: 1 })
  expect(res.status).toBe(400)
  expect((await json(res)).error.code).toBe('invalid_request')
})
