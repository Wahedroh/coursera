import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

/** ห้อง + นักเรียน + ลงคะแนนรายการสอบ (เผยแพร่) */
async function exam(cookie: string, classId: string, title: string, takenOn: string, marks: (number | null)[], studentIds: string[]) {
  const { ids } = await json(await postJson('/api/teacher/score-items', { title, category: 'quiz', maxScore: 10, takenOn, classIds: [classId] }, { cookie }))
  for (const [i, m] of marks.entries()) await putJson(`/api/teacher/score-items/${ids[0]}/scores/${studentIds[i]}`, { score: m, absent: m === null, note: '' }, cookie)
  await putJson(`/api/teacher/score-items/${ids[0]}/published`, { published: true }, cookie)
}

it('ศึกสอบ: ข้อสอบชุดเดียวกันต่างโรงเรียน เทียบค่าเฉลี่ย/ผ่านเกณฑ์/พัฒนาการรายห้อง · ไม่มีข้อมูลรายคน · ปิดรายห้องได้', async () => {
  const cookie = await loginTeacher()
  const a = await seedClass(db(), { name: 'ม.2/1', schoolName: 'โรงเรียนเอ' })
  const b = await seedClass(db(), { name: 'ม.2/3', schoolName: 'โรงเรียนบี' })
  const c = await seedClass(db(), { name: 'ม.2/5', schoolName: 'โรงเรียนซี' })
  const sa = await Promise.all([0, 1, 2, 3].map((i) => seedStudent(db(), a.classId, { zipgradeId: `a${i}` })))
  const sb = await Promise.all([0, 1, 2].map((i) => seedStudent(db(), b.classId, { zipgradeId: `b${i}` })))
  const sc = await Promise.all([0, 1].map((i) => seedStudent(db(), c.classId, { zipgradeId: `c${i}` })))
  // ครั้งก่อนของห้อง b (ไว้คิดพัฒนาการ)
  await exam(cookie, b.classId, 'สอบย่อยบทที่ 2', '2026-11-10', [4, 5, 6], sb.map((s) => s.id))
  await exam(cookie, a.classId, 'สอบย่อยบทที่ 3', '2026-11-20', [8, 6, 4, null], sa.map((s) => s.id)) // เฉลี่ย 60% ผ่าน 3/3
  await exam(cookie, b.classId, ' สอบย่อยบทที่ 3 ', '2026-11-21', [9, 7, 8], sb.map((s) => s.id)) // เฉลี่ย 80% (+30 จากครั้งก่อน 50%)
  await exam(cookie, c.classId, 'สอบย่อยบทที่ 3', '2026-11-21', [10, 10], sc.map((s) => s.id)) // คนน้อยเกิน → ไม่นับ

  const all = await json(await getJson('/api/teacher/battles', cookie))
  expect(all).toHaveLength(1)
  expect(all[0]).toMatchObject({ title: 'สอบย่อยบทที่ 3', maxScore: 10, takenOn: '2026-11-21', mostImproved: b.classId })
  expect(all[0].rows).toEqual([
    { classId: b.classId, className: 'ม.2/3', schoolName: 'โรงเรียนบี', n: 3, avgPct: 80, passPct: 100, deltaPct: 30, rank: 1 },
    { classId: a.classId, className: 'ม.2/1', schoolName: 'โรงเรียนเอ', n: 3, avgPct: 60, passPct: 66.7, deltaPct: null, rank: 2 },
  ])

  // นักเรียนเห็นเฉพาะศึกที่ห้องตัวเองอยู่ + ห้องตัวเองถูกไฮไลต์ · ไม่มีชื่อ/คะแนนรายคน
  const mine = await json(await getJson('/api/student/battles', await studentCookie(sa[0].id)))
  expect(mine[0].rows.find((r: { mine: boolean }) => r.mine).classId).toBe(a.classId)
  expect(JSON.stringify(mine)).not.toMatch(/firstName|zipgrade|"score"/)
  expect(await json(await getJson('/api/student/battles', await studentCookie(sc[0].id)))).toEqual([])

  // ครูปิดศึกสอบของห้อง b → เหลือห้องเดียว ไม่เป็นศึก
  expect(await json(await getJson(`/api/teacher/classes/${b.classId}/settings/battle`, cookie))).toEqual({ enabled: true })
  await putJson(`/api/teacher/classes/${b.classId}/settings/battle`, { enabled: false }, cookie)
  expect(await json(await getJson('/api/teacher/battles', cookie))).toEqual([])
  expect((await getJson('/api/student/battles')).status).toBe(401)
})
