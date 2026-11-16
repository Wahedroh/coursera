import { beforeEach, expect, it } from 'vitest'
import { cloudflareUsage, resetCloudflareCache } from '../src/server/storage/cloudflare'
import { getJson, json, loginTeacher, resetDb } from './helpers'

beforeEach(async () => {
  resetCloudflareCache()
  await resetDb()
})
const env = { CF_ACCOUNT_ID: 'acc', CF_ANALYTICS_TOKEN: 'tok' }
const T = Date.parse('2030-01-07T05:00:00Z')

it('ยังไม่ตั้ง token → configured: false (หน้าเว็บบอกวิธีตั้ง)', async () => {
  expect(await cloudflareUsage({}, T)).toEqual({ configured: false })
  expect(await json(await getJson('/api/teacher/storage/cloudflare', await loginTeacher()))).toEqual({ configured: false })
})

it('รวมยอด KV แยกประเภท · Workers แยกแอป · D1 · พื้นที่ KV ทุก namespace · แคช 5 นาที', async () => {
  const calls: RequestInit[] = []
  const fake = (async (_url: string, init: RequestInit) => {
    calls.push(init)
    return Response.json({
      data: {
        viewer: {
          accounts: [
            {
              kv: [
                { dimensions: { actionType: 'read' }, sum: { requests: 360 } },
                { dimensions: { actionType: 'write' }, sum: { requests: 500 } },
                { dimensions: { actionType: 'list' }, sum: { requests: 76 } },
              ],
              kvs: [
                { dimensions: { namespaceId: 'a' }, max: { byteCount: 1000, keyCount: 10 } },
                { dimensions: { namespaceId: 'b' }, max: { byteCount: 24, keyCount: 2 } },
              ],
              w: [
                { dimensions: { scriptName: 'classroom' }, sum: { requests: 21018 } },
                { dimensions: { scriptName: 'prayer-push' }, sum: { requests: 178 } },
                { dimensions: { scriptName: 'classroom' }, sum: { requests: 2 } },
              ],
              d1: [{ sum: { rowsRead: 924854, rowsWritten: 5473 } }],
            },
          ],
        },
      },
      errors: null,
    })
  }) as unknown as typeof fetch
  const u = await cloudflareUsage(env, T, fake)
  expect(u).toMatchObject({
    configured: true,
    date: '2030-01-07',
    kv: { read: 360, write: 500, delete: 0, list: 76, storageBytes: 1024, keys: 12 },
    workers: { requests: 21198, byScript: [{ name: 'classroom', requests: 21020 }, { name: 'prayer-push', requests: 178 }] },
    d1: { rowsRead: 924854, rowsWritten: 5473 },
  })
  expect((calls[0].headers as Record<string, string>).authorization).toBe('Bearer tok')
  expect(JSON.parse(calls[0].body as string).variables).toMatchObject({ a: 'acc', d: '2030-01-07', s: '2030-01-07T00:00:00Z' })
  await cloudflareUsage(env, T + 60_000, fake)
  expect(calls).toHaveLength(1)
})

it('token ไม่มีสิทธิ์/เชื่อมต่อไม่ได้ → บอกข้อผิดพลาด ไม่ล่ม', async () => {
  const denied = (async () => Response.json({ data: null, errors: [{ message: 'not authorized' }] }, { status: 200 })) as unknown as typeof fetch
  expect(await cloudflareUsage(env, T, denied)).toMatchObject({ configured: true, error: 'not authorized', kv: { write: 0 } })
  resetCloudflareCache()
  const down = (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch
  expect(await cloudflareUsage(env, T, down)).toMatchObject({ configured: true, error: 'network down' })
})
