import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { CF_FREE_LIMITS, type CloudflareUsage } from '../../shared/cloudflareUsage'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'
import Icon from '../components/Icon'

type Usage = { bytes: number; files: number; limitBytes: number; freeBytes: number; syncedAt: number | null }
type Candidate = { assignmentId: string; title: string; className: string; submissions: number; files: number; bytes: number; lastGradedAt: number }

type Part = { id: string; label: string; files: number; bytes: number }
const PART_COLOR: Record<string, string> = {
  sub: 'bg-board',
  ann: 'bg-teal-400',
  'mat-blank': 'bg-blue-500',
  'mat-notes': 'bg-amber-400',
  asg: 'bg-violet-500',
  quiz: 'bg-pink-400',
  pay: 'bg-stone-500',
  other: 'bg-stone-300',
}
export const fmtBytes = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${b > 0 ? Math.max(1, Math.round(b / 1024)) : 0} KB`)
const dayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })

export default function TeacherStorage() {
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<{ usage: Usage; breakdown: Part[]; candidates: Candidate[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState(30)

  const load = useCallback(() => {
    api<{ usage: Usage; breakdown: Part[]; candidates: Candidate[] }>('/api/teacher/storage').then(setData).catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])

  async function run(path: string, body: unknown, confirmText: string, done: (r: { submissions?: number; files: number; bytes: number }) => string) {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ submissions?: number; files: number; bytes: number }>(path, { body })
      setFlash(done(r))
      load()
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  const purged = (r: { submissions?: number; files: number; bytes: number }) => `ลบรูปแล้ว ${r.files} ไฟล์ จากงาน ${r.submissions ?? 0} ชิ้น · คืนพื้นที่ ${fmtBytes(r.bytes)}`

  if (!data) return <TeacherLayout>{error ? <ErrorBox message={error} /> : <Loading />}</TeacherLayout>
  const { usage: u, candidates, breakdown } = data
  const parts = breakdown.filter((p) => p.bytes > 0)
  const pct = Math.min(100, (u.bytes / u.freeBytes) * 100)
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-board'
  const total = candidates.reduce((n, c) => n + c.bytes, 0)

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">พื้นที่เก็บไฟล์</h1>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <b>
            ใช้ไป {fmtBytes(u.bytes)} จาก {fmtBytes(u.freeBytes)}
          </b>
          <span className="text-stone-500">{u.files} ไฟล์</span>
        </div>
        <div className="h-3 rounded-full bg-stone-100 overflow-hidden flex" title={`ใช้ไป ${pct.toFixed(1)}%`}>
          {parts.length ? (
            parts.map((p) => <div key={p.id} className={`h-full ${PART_COLOR[p.id] ?? 'bg-stone-400'}`} style={{ width: `${(p.bytes / u.freeBytes) * 100}%` }} />)
          ) : (
            <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
          )}
        </div>
        <p className="text-xs text-stone-500">
          {pct >= 90
            ? 'ใกล้เต็มแล้ว — ถ้าเกิน 9.5 GB จะอัปโหลดไฟล์/รูปใหม่ไม่ได้ (นักเรียนยังส่งข้อความได้) กรุณาลบรูปงานที่ตรวจแล้วหรือเอกสารที่ไม่ใช้'
            : `ใช้ไป ${pct.toFixed(1)}% ของแพ็กเกจฟรี Cloudflare (10 GB) · รวมไฟล์ทุกชนิดด้านล่าง · ระบบหยุดรับไฟล์ใหม่ที่ 9.5 GB เพื่อไม่ให้เต็มกลางคาบ`}
        </p>
        <ul className="grid gap-1 sm:grid-cols-2 text-sm" data-testid="storage-breakdown">
          {breakdown.map((p) => (
            <li key={p.id} className={`flex items-center gap-2 ${p.bytes ? '' : 'opacity-50'}`}>
              <span className={`h-3 w-3 shrink-0 rounded-sm ${PART_COLOR[p.id] ?? 'bg-stone-400'}`} aria-hidden />
              <span className="flex-1">{p.label}</span>
              <span className="tabular-nums text-stone-600">
                {fmtBytes(p.bytes)} · {p.files} ไฟล์
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="self-start text-xs text-board underline" disabled={busy} onClick={() => api<Usage>('/api/teacher/storage/sync', { body: {} }).then(() => load()).catch((e) => setError(handle(e)))}>
          นับพื้นที่ใหม่
        </button>
      </Card>
      <CloudflareQuota />

      <Card className="p-4 flex flex-col gap-3">
        <h2 className="font-bold">ลบรูปงานที่ตรวจแล้ว</h2>
        <p className="text-sm text-stone-500">ลบเฉพาะรูป (รูปที่นักเรียนส่ง + รูปที่ครูเขียนทับ) ของงานที่ให้คะแนนแล้ว · คะแนน คอมเมนต์ และข้อความยังอยู่ครบ · งานที่ยังไม่ตรวจไม่ถูกลบ</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">ทุกงานที่ตรวจไว้นานกว่า</span>
          <select aria-label="นานกว่ากี่วัน" className="border-2 border-line rounded-xl px-2 py-1 bg-white" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90, 180].map((d) => (
              <option key={d} value={d}>
                {d} วัน
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => run('/api/teacher/storage/purge', { olderThanDays: days }, `ลบรูปของงานทุกชิ้นที่ตรวจไว้นานกว่า ${days} วัน? ลบแล้วกู้คืนไม่ได้ (คะแนนยังอยู่)`, purged)}
            className="py-2"
          >
            <Icon n="trash" /> ลบรูปเก่า
          </Button>
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-stone-500">ไม่มีงานที่ตรวจแล้วและยังมีรูปค้างอยู่</p>
        ) : (
          <>
            <p className="text-sm">
              งานที่ตรวจแล้วยังมีรูปรวม <b>{fmtBytes(total)}</b>
            </p>
            <div className="divide-y divide-stone-100">
              {candidates.map((c) => (
                <div key={c.assignmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-bold">{c.title}</span>
                    <span className="block text-xs text-stone-500">
                      {c.className} · ตรวจแล้ว {c.submissions} คน · {c.files} รูป · {fmtBytes(c.bytes)} · ตรวจล่าสุด {dayFmt.format(c.lastGradedAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-red-200 text-red-700 bg-white px-3 py-1.5 text-xs font-bold"
                    onClick={() => run('/api/teacher/storage/purge', { assignmentId: c.assignmentId }, `ลบรูปของงาน "${c.title}" (${c.className}) ที่ตรวจแล้ว ${c.submissions} คน? กู้คืนไม่ได้ (คะแนนยังอยู่)`, purged)}
                    aria-label={`ลบรูปงาน ${c.title} ${c.className}`}
                  >
                    <Icon n="trash" /> ลบรูปงานนี้
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        <h2 className="font-bold">ลบไฟล์ค้าง</h2>
        <p className="text-sm text-stone-500">รูปที่อัปโหลดแล้วไม่ได้กดส่ง หรือรูปที่ครูเขียนทับรอบก่อน (ไม่มีงานไหนใช้แล้ว อายุเกิน 1 วัน)</p>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          className="self-start py-2"
          onClick={() => run('/api/teacher/storage/purge-orphans', {}, 'ลบไฟล์ที่ไม่มีงานไหนใช้แล้ว?', (r) => `ลบไฟล์ค้างแล้ว ${r.files} ไฟล์ · คืนพื้นที่ ${fmtBytes(r.bytes)}`)}
        >
          ลบไฟล์ค้าง
        </Button>
      </Card>

      <Backups />
    </TeacherLayout>
  )
}

type Backup = { name: string; size: number; uploadedAt: number }
const num = new Intl.NumberFormat('th-TH')
const hhmm = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })

function QuotaBar({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const pct = Math.min(100, (used / limit) * 100)
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-board'
  return (
    <li className="text-sm" data-testid={`quota-${label}`}>
      <div className="flex justify-between gap-2">
        <span>
          {label}
          {hint && <span className="text-xs text-stone-500"> · {hint}</span>}
        </span>
        <span className={`tabular-nums whitespace-nowrap ${pct >= 90 ? 'text-red-700 font-bold' : pct >= 70 ? 'text-amber-700 font-bold' : 'text-stone-600'}`}>
          {num.format(used)} / {num.format(limit)} ({pct < 1 && used > 0 ? '<1' : Math.round(pct)}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(pct, used > 0 ? 0.5 : 0)}%` }} />
      </div>
    </li>
  )
}

/** การใช้งานวันนี้ของทั้งบัญชี Cloudflare (KV · Workers · D1) — นับรวมทุกแอปในบัญชี */
function CloudflareQuota() {
  const [u, setU] = useState<CloudflareUsage | null>(null)
  useEffect(() => {
    api<CloudflareUsage>('/api/teacher/storage/cloudflare')
      .then(setU)
      .catch(() => setU(null))
  }, [])
  if (!u) return null
  return (
    <Card className="p-4 flex flex-col gap-2" data-testid="cf-usage">
      <h2 className="font-bold"><Icon n="cloud" /> โควตาวันนี้ของบัญชี Cloudflare (แพ็กเกจฟรี)</h2>
      {!u.configured ? (
        <p className="text-sm text-stone-600">
          ยังไม่ได้เชื่อม — ตั้ง GitHub secret <code className="bg-stone-100 px-1 rounded">CF_ANALYTICS_TOKEN</code> (Cloudflare API token สิทธิ์ “Account Analytics: Read” อย่างเดียว) แล้ว deploy ใหม่ จะเห็นการใช้ KV · Workers · D1 ของวันนี้ที่นี่
        </p>
      ) : (
        <>
          <p className="text-xs text-stone-500">
            นับรวมทุกแอปในบัญชี · รีเซ็ตทุกวัน 07:00 น. · อัปเดต {hhmm.format(u.fetchedAt)} น. (ทุก ~5 นาที){u.error && <> · <Icon n="warning" /> ดึงข้อมูลไม่ได้: {u.error}</>}
          </p>
          <b className="text-sm pt-1">KV</b>
          <ul className="flex flex-col gap-1.5">
            <QuotaBar label="KV อ่าน" used={u.kv.read} limit={CF_FREE_LIMITS.kvRead} />
            <QuotaBar label="KV เขียน" used={u.kv.write} limit={CF_FREE_LIMITS.kvWrite} hint="เต็มเร็วที่สุด" />
            <QuotaBar label="KV ลบ" used={u.kv.delete} limit={CF_FREE_LIMITS.kvDelete} />
            <QuotaBar label="KV list" used={u.kv.list} limit={CF_FREE_LIMITS.kvList} />
          </ul>
          <p className="text-xs text-stone-500">พื้นที่ KV {fmtBytes(u.kv.storageBytes)} จาก 1 GB · {num.format(u.kv.keys)} คีย์ · แอปห้องเรียนไม่ได้ใช้ KV (ตัวเลขนี้มาจากแอปอื่นในบัญชี)</p>
          <b className="text-sm pt-1">Workers และฐานข้อมูล</b>
          <ul className="flex flex-col gap-1.5">
            <QuotaBar label="Workers requests" used={u.workers.requests} limit={CF_FREE_LIMITS.workerRequests} hint={u.workers.byScript.map((x) => `${x.name} ${num.format(x.requests)}`).join(' · ')} />
            <QuotaBar label="D1 อ่านแถว" used={u.d1.rowsRead} limit={CF_FREE_LIMITS.d1RowsRead} />
            <QuotaBar label="D1 เขียนแถว" used={u.d1.rowsWritten} limit={CF_FREE_LIMITS.d1RowsWritten} />
          </ul>
        </>
      )}
    </Card>
  )
}

const when = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

/** ไฟล์สำรองฐานข้อมูลรายสัปดาห์ (GitHub Actions เขียนลง R2 ส่วนตัว) */
function Backups() {
  const [list, setList] = useState<Backup[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api<Backup[]>('/api/teacher/backups')
      .then(setList)
      .catch(() => setFailed(true))
  }, [])
  const latest = list?.[0]
  const stale = latest !== undefined && Date.now() - latest.uploadedAt > 9 * 86400_000
  return (
    <Card className="p-4 flex flex-col gap-2" data-testid="backups">
      <h2 className="font-bold"><Icon n="backup" /> สำรองข้อมูลอัตโนมัติ</h2>
      <p className="text-sm text-stone-500">
        ระบบสำรองฐานข้อมูลทั้งหมด (รายชื่อ งาน คะแนน เช็กชื่อ แต้ม ค่าเอกสาร ประกาศ) ทุกวันอาทิตย์ 02:00 น. เก็บย้อนหลัง 180 วัน · ไม่รวมไฟล์รูปงาน/เอกสารเรียน
      </p>
      {failed && <p className="text-sm text-red-700">โหลดรายการไฟล์สำรองไม่สำเร็จ</p>}
      {list && list.length === 0 && <p className="text-sm text-amber-700">ยังไม่มีไฟล์สำรอง — ไฟล์แรกจะถูกสร้างในวันอาทิตย์ที่จะถึง</p>}
      {latest && (
        <p className={`text-sm font-semibold ${stale ? 'text-red-700' : 'text-board'}`}>
          ล่าสุด: {when.format(latest.uploadedAt)} {stale && '— เกิน 9 วันแล้ว ควรแจ้งผู้ดูแลระบบตรวจ GitHub Actions'}
        </p>
      )}
      {list && list.length > 0 && (
        <div className="divide-y divide-stone-100 text-sm">
          {list.slice(0, 8).map((b) => (
            <div key={b.name} className="flex justify-between items-center py-1.5 gap-2">
              <span>
                {when.format(b.uploadedAt)} <span className="text-xs text-stone-500">· {fmtBytes(b.size)}</span>
              </span>
              <a className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" href={`/api/teacher/backups/${encodeURIComponent(b.name)}`} download>
                <Icon n="download" /> ดาวน์โหลด
              </a>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-stone-500">ไฟล์ .sql.gz ใช้กู้ข้อมูลกลับเข้าระบบ (ผู้ดูแลระบบทำตามขั้นตอนใน docs/backup.md) · มีข้อมูลนักเรียน เก็บไว้ในที่ปลอดภัย</p>
    </Card>
  )
}
