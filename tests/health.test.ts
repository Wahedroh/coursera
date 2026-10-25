import { SELF } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('GET /api/health ตอบ ok', async () => {
  const r = await SELF.fetch('http://x/api/health')
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ ok: true })
})

it('API ที่ไม่มีอยู่ตอบ 404 รูปแบบ error กลาง', async () => {
  const r = await SELF.fetch('http://x/api/nope')
  expect(r.status).toBe(404)
  expect(await r.json()).toEqual({ error: { code: 'not_found', message: 'ไม่พบหน้าที่ต้องการ' } })
})
