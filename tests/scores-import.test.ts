import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { parseZipgradeResults, toItemScore } from '../src/shared/zipgrade-results'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

describe('parseZipgradeResults', () => {
  it('อ่านคอลัมน์มาตรฐานของ ZipGrade ตัดศูนย์นำหน้า และใช้ใบล่างสุดเมื่อสแกนซ้ำ', () => {
    const csv = 'Quiz Name,Student First Name,Student Last Name,ZipGrade ID,Earned Points,Possible Points,Percent Correct\nบท1,ก,ข,007,8,10,80\nบท1,ค,ง,12,9.5,10,95\nบท1,ก,ข,7,9,10,90\n'
    const r = parseZipgradeResults(csv)
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      { line: 4, zipgradeId: '7', earned: 9, possible: 10 },
      { line: 3, zipgradeId: '12', earned: 9.5, possible: 10 },
    ])
    expect(r.duplicates).toEqual(['7'])
  })
  it('ใช้ Student ID ได้ · ไม่มีคอลัมน์ที่ต้องการแจ้งผิด · ไฟล์ไม่ใช่ UTF-8 แจ้งผิด', () => {
    expect(parseZipgradeResults('Student ID,Points Earned\n5,3\n').rows[0]).toEqual(expect.objectContaining({ zipgradeId: '5', earned: 3, possible: null }))
    expect(parseZipgradeResults('Name,Score\nก,3\n').errors).toHaveLength(1)
    expect(parseZipgradeResults('ZipGrade ID,Earned Points\n1,�\n').errors[0]).toContain('UTF-8')
  })
  it('เทียบสัดส่วนคะแนนเต็ม', () => {
    expect(toItemScore({ earned: 8, possible: 10 }, 20, true)).toBe(16)
    expect(toItemScore({ earned: 1, possible: 3 }, 10, true)).toBe(3.33)
    expect(toItemScore({ earned: 8, possible: 10 }, 20, false)).toBe(8)
  })
})

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId, { zipgradeId: '101' })
  const b = await seedStudent(db(), classId, { zipgradeId: '102' })
  const c = await seedStudent(db(), classId, { zipgradeId: '103' })
  const { ids } = await json(await postJson('/api/teacher/score-items', { title: 'สอบ', category: 'quiz', maxScore: 20, takenOn: '2026-10-20', classIds: [classId] }, { cookie }))
  return { cookie, a, b, c, itemId: ids[0] as string }
}
const sheet = async (itemId: string, cookie: string) =>
  Object.fromEntries((await json(await getJson(`/api/teacher/score-items/${itemId}`, cookie))).students.map((s: { zipgradeId: string; score: number | null; absent: boolean; note: string }) => [s.zipgradeId, s]))

it('นำเข้าคะแนนตาม ZipGrade ID · ไม่ทับคะแนนเดิมถ้าไม่เลือก · ข้ามคนนอกห้องและคะแนนเกิน', async () => {
  const { cookie, a, itemId } = await setup()
  await putJson(`/api/teacher/score-items/${itemId}/scores/${a.id}`, { score: 5, absent: false, note: 'สอบซ่อม' }, cookie)
  const res = await postJson(
    `/api/teacher/score-items/${itemId}/import`,
    { rows: [{ zipgradeId: '0101', score: 18 }, { zipgradeId: '102', score: 15.5 }, { zipgradeId: '999', score: 10 }, { zipgradeId: '103', score: 25 }], overwrite: false, absentMissing: false },
    { cookie },
  )
  expect(await json(res)).toEqual({ saved: 1, keptExisting: 1, markedAbsent: 0, notInClass: ['999'], invalid: ['103'] })
  const s = await sheet(itemId, cookie)
  expect(s['101']).toEqual(expect.objectContaining({ score: 5, note: 'สอบซ่อม' }))
  expect(s['102'].score).toBe(15.5)
  expect(s['103'].score).toBeNull()
})

it('เขียนทับได้ (หมายเหตุคงเดิม) · ติ๊กขาดสอบให้คนที่ไม่มีในไฟล์ · ครูแก้รายคนต่อได้', async () => {
  const { cookie, a, b, itemId } = await setup()
  await putJson(`/api/teacher/score-items/${itemId}/scores/${a.id}`, { score: 5, absent: false, note: 'สอบซ่อม' }, cookie)
  const r = await json(await postJson(`/api/teacher/score-items/${itemId}/import`, { rows: [{ zipgradeId: '101', score: 18 }, { zipgradeId: '102', score: 12 }], overwrite: true, absentMissing: true }, { cookie }))
  expect(r).toEqual(expect.objectContaining({ saved: 2, markedAbsent: 1 }))
  let s = await sheet(itemId, cookie)
  expect(s['101']).toEqual(expect.objectContaining({ score: 18, note: 'สอบซ่อม' }))
  expect(s['103']).toEqual(expect.objectContaining({ score: null, absent: true }))
  expect((await putJson(`/api/teacher/score-items/${itemId}/scores/${b.id}`, { score: 13, absent: false, note: 'แก้หลังนำเข้า' }, cookie)).status).toBe(200)
  s = await sheet(itemId, cookie)
  expect(s['102'].score).toBe(13)
  expect((await postJson(`/api/teacher/score-items/${itemId}/import`, { rows: [], overwrite: true, absentMissing: false }, { cookie })).status).toBe(400)
})
