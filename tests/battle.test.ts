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
  const sa = await Promise.all([0, 1, 2, 3].map((i) => seedStudent(db(), a.classId, { zipgradeId: `a${i}`, firstName: `ชื่อจริงเอ${i}` })))
  const sb = await Promise.all([0, 1, 2].map((i) => seedStudent(db(), b.classId, { zipgradeId: `b${i}`, firstName: `ชื่อจริงบี${i}` })))
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

  // อันดับรายคน (ทุกห้องรวม): ชื่อเล่น + โรงเรียน เท่านั้น · คะแนนเท่ากันอันดับเดียวกัน
  expect(all[0].players).toBe(6)
  expect(all[0].top.map((p: { rank: number; score: number; schoolName: string }) => [p.rank, p.score, p.schoolName])).toEqual([
    [1, 9, 'โรงเรียนบี'],
    [2, 8, 'โรงเรียนบี'],
    [2, 8, 'โรงเรียนเอ'],
    [4, 7, 'โรงเรียนบี'],
    [5, 6, 'โรงเรียนเอ'],
    [6, 4, 'โรงเรียนเอ'],
  ])
  expect(all[0].top[0].nickname).toBe('ยังไม่ตั้งชื่อเล่น')

  // นักเรียนเห็นเฉพาะศึกที่ห้องตัวเองอยู่ + ห้องตัวเองถูกไฮไลต์ + อันดับของตัวเอง · ไม่มีชื่อจริง/รหัส
  const ca = await studentCookie(sa[0].id)
  await putJson('/api/student/avatar', { nickname: 'เทพเวกเตอร์', config: { gender: 'm', skin: 0, hair: 'short', hairColor: 1, job: 'student', glasses: false } }, ca)
  const mine = await json(await getJson('/api/student/battles', ca))
  expect(mine[0].rows.find((r: { mine: boolean }) => r.mine).classId).toBe(a.classId)
  expect(mine[0].me).toEqual({ rank: 2, score: 8, pct: 80 })
  expect(mine[0].top.find((p: { mine: boolean }) => p.mine)).toMatchObject({ nickname: 'เทพเวกเตอร์', schoolName: 'โรงเรียนเอ', rank: 2 })
  expect(JSON.stringify(mine)).not.toContain('ชื่อจริง')
  for (const x of [...sa, ...sb]) expect(JSON.stringify(mine)).not.toContain(`"${x.zipgradeId}"`)
  expect(JSON.stringify(mine)).not.toMatch(/studentId|firstName|zipgrade/)
  expect(await json(await getJson('/api/student/battles', await studentCookie(sc[0].id)))).toEqual([])

  // ครูปิดศึกสอบของห้อง b → เหลือห้องเดียว ไม่เป็นศึก
  expect(await json(await getJson(`/api/teacher/classes/${b.classId}/settings/battle`, cookie))).toEqual({ enabled: true })
  await putJson(`/api/teacher/classes/${b.classId}/settings/battle`, { enabled: false }, cookie)
  expect(await json(await getJson('/api/teacher/battles', cookie))).toEqual([])
  expect((await getJson('/api/student/battles')).status).toBe(401)
})
