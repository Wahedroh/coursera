import type { CloudflareUsage } from '../../shared/cloudflareUsage'
import type { Env } from '../env'

const CACHE_MS = 5 * 60_000
let cache: { at: number; value: CloudflareUsage } | null = null

const QUERY = `query($a:String!,$d:Date!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
kv:kvOperationsAdaptiveGroups(limit:20,filter:{date:$d}){sum{requests} dimensions{actionType}}
kvs:kvStorageAdaptiveGroups(limit:100,filter:{date:$d}){max{byteCount keyCount} dimensions{namespaceId}}
w:workersInvocationsAdaptive(limit:50,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests} dimensions{scriptName}}
d1:d1AnalyticsAdaptiveGroups(limit:20,filter:{date:$d}){sum{rowsRead rowsWritten}}}}}`

type Gql = {
  data?: {
    viewer: {
      accounts: {
        kv: { sum: { requests: number }; dimensions: { actionType: string } }[]
        kvs: { max: { byteCount: number; keyCount: number }; dimensions: { namespaceId: string } }[]
        w: { sum: { requests: number }; dimensions: { scriptName: string } }[]
        d1: { sum: { rowsRead: number; rowsWritten: number } }[]
      }[]
    }
  }
  errors?: { message: string }[] | null
}

/** การใช้งานวันนี้ของทั้งบัญชี Cloudflare (KV · Workers · D1) จาก GraphQL Analytics — ต้องมี token แบบอ่านอย่างเดียว */
export async function cloudflareUsage(env: Pick<Env, 'CF_ACCOUNT_ID' | 'CF_ANALYTICS_TOKEN'>, t: number, fetcher: typeof fetch = fetch): Promise<CloudflareUsage> {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) return { configured: false }
  if (cache && t - cache.at < CACHE_MS) return cache.value
  const date = new Date(t).toISOString().slice(0, 10)
  const empty = { kv: { read: 0, write: 0, delete: 0, list: 0, storageBytes: 0, keys: 0 }, workers: { requests: 0, byScript: [] }, d1: { rowsRead: 0, rowsWritten: 0 } }
  try {
    const res = await fetcher('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { a: env.CF_ACCOUNT_ID, d: date, s: `${date}T00:00:00Z`, e: new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z') } }),
    })
    const body = (await res.json()) as Gql
    const acc = body.data?.viewer.accounts[0]
    if (!res.ok || !acc) return { configured: true, date, fetchedAt: t, ...empty, error: body.errors?.[0]?.message ?? `HTTP ${res.status}` }
    const op = (k: string) => acc.kv.filter((x) => x.dimensions.actionType === k).reduce((n, x) => n + x.sum.requests, 0)
    const byScript = new Map<string, number>()
    for (const w of acc.w) byScript.set(w.dimensions.scriptName, (byScript.get(w.dimensions.scriptName) ?? 0) + w.sum.requests)
    const ns = new Map<string, { byteCount: number; keyCount: number }>()
    for (const s of acc.kvs) {
      const prev = ns.get(s.dimensions.namespaceId)
      if (!prev || s.max.byteCount > prev.byteCount) ns.set(s.dimensions.namespaceId, s.max)
    }
    const value: CloudflareUsage = {
      configured: true,
      date,
      fetchedAt: t,
      kv: { read: op('read'), write: op('write'), delete: op('delete'), list: op('list'), storageBytes: [...ns.values()].reduce((n, x) => n + x.byteCount, 0), keys: [...ns.values()].reduce((n, x) => n + x.keyCount, 0) },
      workers: { requests: [...byScript.values()].reduce((a, b) => a + b, 0), byScript: [...byScript].map(([name, requests]) => ({ name, requests })).sort((a, b) => b.requests - a.requests) },
      d1: { rowsRead: acc.d1.reduce((n, x) => n + x.sum.rowsRead, 0), rowsWritten: acc.d1.reduce((n, x) => n + x.sum.rowsWritten, 0) },
    }
    cache = { at: t, value }
    return value
  } catch (e) {
    return { configured: true, date, fetchedAt: t, ...empty, error: e instanceof Error ? e.message : 'เชื่อมต่อ Cloudflare ไม่ได้' }
  }
}

export const resetCloudflareCache = () => {
  cache = null
}
