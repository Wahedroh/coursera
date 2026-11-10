import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { notifications, pushSubscriptions } from '../src/server/db/schema'
import { openDay } from '../src/server/attendance/service'
import { runCron } from '../src/server/push/cron'
import { drain, enqueue } from '../src/server/push/service'
import { isPushEndpoint, vapidAuthorization, vapidKeys } from '../src/server/push/vapid'
import { todayBangkok } from '../src/shared/attendance'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123'
const ASG = { title: 'ใบงานแรง', instructions: '', attachmentKeys: [], dueAt: null, maxScore: 10, submitMode: 'text' }

async function setup() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId, { firstName: 'เอ' })
  const b = await seedStudent(db(), classId, { firstName: 'บี' })
  return { teacher, classId, a, b, sa: await studentCookie(a.id), sb: await studentCookie(b.id) }
}

describe('การแจ้งเตือน (Web Push)', () => {
  it('endpoint ต้องเป็นบริการ push ของเบราว์เซอร์', () => {
    expect(isPushEndpoint(FCM)).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/QGx')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(isPushEndpoint('https://evil.example.com/push')).toBe(false)
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
    expect(isPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false)
  })

  it('กุญแจ VAPID สร้างครั้งเดียว · ลายเซ็น JWT ตรวจสอบได้ด้วยกุญแจสาธารณะ', async () => {
    const k1 = await vapidKeys(db())
    const k2 = await vapidKeys(db())
    expect(k2).toEqual(k1)
    const auth = await vapidAuthorization(k1, FCM, Date.UTC(2026, 10, 10))
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth)!
    expect(m[4]).toBe(k1.publicKey)
    const dec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
    expect(JSON.parse(new TextDecoder().decode(dec(m[2])))).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'https://classroom.wahedroh.workers.dev' })
    const pub = await crypto.subtle.importKey('raw', dec(k1.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, dec(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`))).toBe(true)
  })

  it('สมัคร/ยกเลิก · endpoint แปลกปลอม 400 · ครูสมัครไม่ได้', async () => {
    const { teacher, a, sa } = await setup()
    expect((await json(await getJson('/api/student/push/key', sa))).publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/)
    expect((await postJson('/api/student/push/subscribe', { endpoint: 'https://evil.example.com/x' }, { cookie: sa })).status).toBe(400)
    expect((await postJson('/api/student/push/subscribe', { endpoint: FCM }, { cookie: teacher })).status).toBe(401)
    expect((await postJson('/api/student/push/subscribe', { endpoint: FCM }, { cookie: sa })).status).toBe(200)
    expect((await db().select().from(pushSubscriptions)).map((s) => s.studentId)).toEqual([a.id])
    await postJson('/api/student/push/unsubscribe', { endpoint: FCM }, { cookie: sa })
    expect(await db().select().from(pushSubscriptions)).toHaveLength(0)
  })

  it('เครื่องเดียวกันเปลี่ยนคนล็อกอิน → ผูกกับคนล่าสุด', async () => {
    const { b, sa, sb } = await setup()
    await postJson('/api/student/push/subscribe', { endpoint: FCM }, { cookie: sa })
    await postJson('/api/student/push/subscribe', { endpoint: FCM }, { cookie: sb })
    expect((await db().select().from(pushSubscriptions)).map((s) => s.studentId)).toEqual([b.id])
  })

  it('ครูสร้างงาน/ประกาศ → นักเรียนทุกคนในห้องได้การแจ้งเตือน · service worker ดึงข้อความได้ครั้งเดียว', async () => {
    const { teacher, classId, sa, sb } = await setup()
    await postJson('/api/teacher/assignments', { ...ASG, classIds: [classId] }, { cookie: teacher })
    await postJson('/api/teacher/announcements', { title: 'พรุ่งนี้สอบ', body: 'บทที่ 3', pinned: false, expiresOn: null, classIds: [classId] }, { cookie: teacher })
    const got = await json(await postJson('/api/student/push/take', {}, { cookie: sa }))
    expect(got.map((n: { title: string; body: string }) => [n.title, n.body])).toEqual([
      ['📝 งานใหม่', 'ใบงานแรง'],
      ['📢 พรุ่งนี้สอบ', 'บทที่ 3'],
    ])
    expect(await json(await postJson('/api/student/push/take', {}, { cookie: sa }))).toEqual([])
    expect(await json(await postJson('/api/student/push/take', {}, { cookie: sb }))).toHaveLength(2)
    expect((await json(await getJson('/api/student/push/notifications', sa))).unread).toBe(2)
    await postJson('/api/student/push/notifications/read', {}, { cookie: sa })
    const inbox = await json(await getJson('/api/student/push/notifications', sa))
    expect(inbox.unread).toBe(0)
    expect(inbox.items.map((n: { title: string; read: boolean }) => [n.title, n.read])).toEqual([['📢 พรุ่งนี้สอบ', true], ['📝 งานใหม่', true]])
    expect((await json(await getJson('/api/student/push/notifications', sb))).unread).toBe(2)
  })

  it('ครูส่งงานกลับ → แจ้งเฉพาะเจ้าของงาน พร้อมลิงก์ไปงานนั้น', async () => {
    const { teacher, classId, sa, sb } = await setup()
    const id = await seedAssignment(classId, { title: 'งานย่อ' })
    await putJson(`/api/student/assignments/${id}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'r1' }, sa)
    const gb = await json(await getJson(`/api/teacher/classes/${classId}/gradebook`, teacher))
    const subId = Object.values(gb.students.find((s: { firstName: string }) => s.firstName === 'เอ').cells as Record<string, { submissionId: string }>)[0].submissionId
    await postJson(`/api/teacher/submissions/${subId}/return`, { comment: 'เขียนหน่วยด้วย' }, { cookie: teacher })
    expect(await json(await postJson('/api/student/push/take', {}, { cookie: sa }))).toMatchObject([
      { title: '↩️ ครูส่งงานกลับให้แก้', body: 'งานย่อ: เขียนหน่วยด้วย', url: `/me/assignments/${id}` },
    ])
    expect(await json(await postJson('/api/student/push/take', {}, { cookie: sb }))).toEqual([])
  })

  it('drain: 1 push ต่ออุปกรณ์ · endpoint หมดอายุ (410) ถูกลบ · ไม่ส่งซ้ำ · จำกัดจำนวนต่อรอบ', async () => {
    const { a, b } = await setup()
    const t = Date.now()
    await db().insert(pushSubscriptions).values([
      { id: 's1', studentId: a.id, endpoint: `${FCM}-1`, createdAt: t },
      { id: 's2', studentId: a.id, endpoint: `${FCM}-2`, createdAt: t },
      { id: 's3', studentId: b.id, endpoint: `${FCM}-3`, createdAt: t },
    ])
    await enqueue(db(), [{ studentId: a.id, title: 'x' }, { studentId: a.id, title: 'y' }, { studentId: b.id, title: 'z' }], t)
    const sent: string[] = []
    const send = async (endpoint: string, auth: string) => {
      expect(auth).toMatch(/^vapid t=/)
      sent.push(endpoint)
      return endpoint.endsWith('-2') ? 410 : 201
    }
    // โควตา 2: ส่งได้แค่ของ เอ (2 เครื่อง) — บี รอรอบหน้า
    expect(await drain(db(), t, send, 2)).toEqual({ pushed: 2, removed: 1 })
    expect(sent.sort()).toEqual([`${FCM}-1`, `${FCM}-2`])
    expect((await db().select().from(pushSubscriptions)).map((s) => s.id).sort()).toEqual(['s1', 's3'])
    expect(await drain(db(), t, send)).toEqual({ pushed: 1, removed: 0 })
    expect(sent).toContain(`${FCM}-3`)
    expect(await drain(db(), t, send)).toEqual({ pushed: 0, removed: 0 })
    expect((await db().select().from(notifications)).every((n) => n.pushedAt !== null)).toBe(true)
  })

  it('cron: เตือนงานที่ครบกำหนดใน 24 ชม. เฉพาะคนที่ยังไม่ส่ง ครั้งเดียว', async () => {
    const { classId, sa, a, b } = await setup()
    const soon = await seedAssignment(classId, { title: 'ใกล้ส่ง', dueAt: Date.now() + 3600_000 })
    await seedAssignment(classId, { title: 'อีกนาน', dueAt: Date.now() + 5 * 86400_000 })
    await putJson(`/api/student/assignments/${soon}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'c1' }, sa)
    const send = async () => 201
    expect((await runCron(env, Date.now(), send)).reminders).toBe(1)
    expect((await runCron(env, Date.now(), send)).reminders).toBe(0)
    const rows = await db().select().from(notifications)
    expect(rows.map((r) => [r.studentId, r.title, r.url])).toEqual([[b.id, '⏰ งานใกล้ครบกำหนด', `/me/assignments/${soon}`]])
    expect(rows.some((r) => r.studentId === a.id)).toBe(false)
  })
})

describe('เหรียญตรา', () => {
  it('เริ่มต้นยังไม่มี · ได้เหรียญเมื่อทำครบ', async () => {
    const { classId, a, sa } = await setup()
    const b0 = await json(await getJson('/api/student/badges', sa))
    expect(b0).toHaveLength(9)
    expect(b0.filter((x: { earned: boolean }) => x.earned)).toEqual([])
    // ส่งงานตรงเวลา 10 ชิ้น
    for (let i = 0; i < 10; i++) {
      const id = await seedAssignment(classId, { dueAt: Date.now() + 86400_000 })
      await putJson(`/api/student/assignments/${id}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: `b${i}` }, sa)
    }
    // มาเรียนครบ 4 คาบในเดือนเดียว (เดือนก่อน กันข้ามเดือน)
    const d = new Date()
    for (const day of [3, 10, 17, 24]) await openDay(db(), classId, todayBangkok(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, day, 5)))
    const b1 = await json(await getJson('/api/student/badges', sa))
    const by = (id: string) => b1.find((x: { id: string }) => x.id === id)
    expect(by('onTime10')).toMatchObject({ earned: true, progress: 10 })
    expect(by('fullMonth')).toMatchObject({ earned: true })
    expect(by('attend20')).toMatchObject({ earned: false, progress: 4, need: 20 })
    expect(a.id).toBeTruthy()
  })

  it('เดือนที่ขาด 1 คาบ ไม่ได้เหรียญมาครบทั้งเดือน', async () => {
    const { teacher, classId, b, sb } = await setup()
    const d = new Date()
    let last = ''
    for (const day of [3, 10, 17, 24]) last = (await openDay(db(), classId, todayBangkok(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, day, 5)))).day!.id
    await putJson(`/api/teacher/attendance/${last}/records/${b.id}`, { status: 'absent' }, teacher)
    const badges = await json(await getJson('/api/student/badges', sb))
    expect(badges.find((x: { id: string }) => x.id === 'fullMonth')).toMatchObject({ earned: false, progress: 0 })
  })
})

describe('กราฟภาพรวมห้อง', () => {
  it('เช็กชื่อรายสัปดาห์ · ส่งงานตรงเวลา/ช้า/ยังไม่ส่ง · การกระจายคะแนนสอบ · เทียบห้อง', async () => {
    const { teacher, classId, a, b, sa, sb } = await setup()
    const { day } = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie: teacher }))
    await putJson(`/api/teacher/attendance/${day.id}/records/${b.id}`, { status: 'absent' }, teacher)
    const ontime = await seedAssignment(classId, { title: 'ตรงเวลา', dueAt: Date.now() + 86400_000, maxScore: 10 })
    const late = await seedAssignment(classId, { title: 'เลยกำหนด', dueAt: Date.now() - 1000, maxScore: 10 })
    await putJson(`/api/student/assignments/${ontime}/submission`, { text: 'ก', imageKeys: [], clientRequestId: 'i1' }, sa)
    await putJson(`/api/student/assignments/${ontime}/submission`, { text: 'ข', imageKeys: [], clientRequestId: 'i2' }, sb)
    await putJson(`/api/student/assignments/${late}/submission`, { text: 'ค', imageKeys: [], clientRequestId: 'i3' }, sa)
    const { ids } = await json(await postJson('/api/teacher/score-items', { title: 'สอบย่อย', category: 'quiz', maxScore: 20, takenOn: '2026-11-01', classIds: [classId] }, { cookie: teacher }))
    await putJson(`/api/teacher/score-items/${ids[0]}/scores/${a.id}`, { score: 19, absent: false, note: '' }, teacher)
    await putJson(`/api/teacher/score-items/${ids[0]}/scores/${b.id}`, { score: 9, absent: false, note: '' }, teacher)

    const x = await json(await getJson(`/api/teacher/classes/${classId}/insights`, teacher))
    expect(x.students).toBe(2)
    expect(x.attendanceWeeks).toHaveLength(1)
    expect(x.attendanceWeeks[0]).toMatchObject({ present: 1, absent: 1 })
    expect(x.assignments.map((r: { title: string; onTime: number; late: number; missing: number }) => [r.title, r.onTime, r.late, r.missing])).toEqual([
      ['เลยกำหนด', 0, 1, 1],
      ['ตรงเวลา', 2, 0, 0],
    ])
    expect(x.exams[0]).toMatchObject({ n: 2, avgPct: 70, minPct: 45, maxPct: 95 })
    expect(x.exams[0].buckets[4]).toBe(1)
    expect(x.exams[0].buckets[9]).toBe(1)

    const cmp = await json(await getJson('/api/teacher/insights', teacher))
    expect(cmp.classes).toEqual([{ id: classId, name: expect.any(String), students: 2, attendancePct: 50, submitPct: 50, examPct: 70 }])
    expect((await getJson('/api/teacher/insights', sa)).status).toBe(401)
    expect((await getJson('/api/teacher/classes/nope/insights', teacher)).status).toBe(404)
  })
})
