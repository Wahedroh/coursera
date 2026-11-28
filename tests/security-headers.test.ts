import { SELF } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('API ส่งส่วนหัวความปลอดภัย (HSTS · nosniff · ห้ามฝังใน iframe · referrer · COOP/CORP)', async () => {
  const r = await SELF.fetch('http://x/api/health')
  expect(r.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
  expect(r.headers.get('x-content-type-options')).toBe('nosniff')
  expect(r.headers.get('x-frame-options')).toBe('DENY')
  expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  expect(r.headers.get('cross-origin-opener-policy')).toBe('same-origin')
  expect(r.headers.get('cross-origin-resource-policy')).toBe('same-origin')
})
