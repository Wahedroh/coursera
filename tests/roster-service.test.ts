import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { classes, schools, sessions, students } from '../src/server/db/schema'
import { applyImport, previewImport } from '../src/server/roster/service'
import { parseZipgradeCsv } from '../src/shared/roster/parse'
import fixture from './fixtures/roster.sample.csv?raw'
import { resetDb } from './helpers'

const rows = () => parseZipgradeCsv(fixture).rows
const db = () => getDb(env)
const byZip = async (z: string) => (await db().select().from(students).where(eq(students.zipgradeId, z)))[0]

beforeEach(resetDb)

it('preview ฐานข้อมูลว่าง: ทุกคนเป็นคนใหม่ ห้องใหม่ 2 ห้อง', async () => {
  const p = await previewImport(db(), rows())
  expect(p.newStudents).toHaveLength(7)
  expect(p.newClasses).toEqual(['โรงเรียนตัวอย่าง ชั้น 5', 'โรงเรียนทดสอบ ชั้น 1'])
  expect(p.flagged).toHaveLength(4)
  expect(p.changed).toEqual([])
  expect(p.missing).toEqual([])
  expect(p.unchanged).toBe(0)
})

it('apply แล้วสร้างโรงเรียน ห้อง นักเรียน', async () => {
  expect(await applyImport(db(), rows(), { deactivateMissing: false })).toEqual({ created: 7, updated: 0, deactivated: 0 })
  expect(await db().select().from(schools)).toHaveLength(2)
  const [c] = await db().select().from(classes).where(eq(classes.name, 'โรงเรียนทดสอบ ชั้น 1'))
  expect(c.grade).toBe(1)
  expect(c.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  expect((await byZip('31448')).sortOrder).toBeGreaterThan((await byZip('4')).sortOrder)
  expect(await byZip('2')).toMatchObject({ title: 'เด็กชาย', firstName: 'สมชาย', lastName: 'รักเรียน' })
})

it('นำเข้าซ้ำโดยไม่เปลี่ยน: unchanged 7', async () => {
  await applyImport(db(), rows(), { deactivateMissing: false })
  const p = await previewImport(db(), rows())
  expect(p.unchanged).toBe(7)
  expect(p.newStudents).toEqual([])
  expect(p.newClasses).toEqual([])
  expect(await applyImport(db(), rows(), { deactivateMissing: false })).toEqual({ created: 0, updated: 0, deactivated: 0 })
})

it('ย้ายห้องและเปลี่ยนชื่อแสดงใน changed แล้ว apply อัปเดต โดย pinHash และ session ยังอยู่', async () => {
  await applyImport(db(), rows(), { deactivateMissing: false })
  const s1 = await byZip('1')
  await db().update(students).set({ pinHash: 'pbkdf2-sha256$1$a$b' }).where(eq(students.id, s1.id))
  await db().insert(sessions).values({ id: newId(), kind: 'student', studentId: s1.id, tokenHash: 'h1', createdAt: now(), lastSeenAt: now(), expiresAt: now() + 1e9 })

  const edited = fixture.replace('1,โรงเรียนทดสอบ ชั้น 1,เด็กหญิงสมใจ,ใจดี,โรงเรียนทดสอบ ชั้น 1', '1,,เด็กหญิงสมใจ,ใจงาม,โรงเรียนตัวอย่าง ชั้น 5')
  const p = await previewImport(db(), parseZipgradeCsv(edited).rows)
  expect(p.changed).toHaveLength(1)
  expect(p.changed[0].before).toEqual({ title: 'เด็กหญิง', firstName: 'สมใจ', lastName: 'ใจดี', className: 'โรงเรียนทดสอบ ชั้น 1' })
  expect(p.changed[0].row.lastName).toBe('ใจงาม')

  expect(await applyImport(db(), parseZipgradeCsv(edited).rows, { deactivateMissing: false })).toEqual({ created: 0, updated: 1, deactivated: 0 })
  const after = await byZip('1')
  const [target] = await db().select().from(classes).where(eq(classes.name, 'โรงเรียนตัวอย่าง ชั้น 5'))
  expect(after.classId).toBe(target.id)
  expect(after.lastName).toBe('ใจงาม')
  expect(after.pinHash).toBe('pbkdf2-sha256$1$a$b')
  expect(await db().select().from(sessions).where(eq(sessions.studentId, s1.id))).toHaveLength(1)
})

it('คนที่ไม่อยู่ในไฟล์อยู่ใน missing; ปิดใช้งานเฉพาะเมื่อ deactivateMissing', async () => {
  await applyImport(db(), rows(), { deactivateMissing: false })
  const without3 = rows().filter((r) => r.zipgradeId !== '3')
  const p = await previewImport(db(), without3)
  expect(p.missing).toEqual([{ id: (await byZip('3')).id, zipgradeId: '3', name: 'มานี มีนา', className: 'โรงเรียนทดสอบ ชั้น 1' }])
  await applyImport(db(), without3, { deactivateMissing: false })
  expect((await byZip('3')).active).toBe(true)
  expect(await applyImport(db(), without3, { deactivateMissing: true })).toEqual({ created: 0, updated: 0, deactivated: 1 })
  expect((await byZip('3')).active).toBe(false)
})

it('คนที่ถูกปิดใช้งานกลับมาในไฟล์ → active อีกครั้ง', async () => {
  await applyImport(db(), rows(), { deactivateMissing: false })
  await applyImport(db(), rows().filter((r) => r.zipgradeId !== '3'), { deactivateMissing: true })
  const p = await previewImport(db(), rows())
  expect(p.changed.map((c) => c.row.zipgradeId)).toEqual(['3'])
  expect(await applyImport(db(), rows(), { deactivateMissing: false })).toEqual({ created: 0, updated: 1, deactivated: 0 })
  expect((await byZip('3')).active).toBe(true)
})

it('ปิดใช้งานคนที่หายไปจำนวนมาก (เกิน 100 คน) ได้ในครั้งเดียว', async () => {
  const header = 'ZipGrade ID,External ID,First Name,Last Name,Classes'
  const big = [header, ...Array.from({ length: 150 }, (_, i) => `${i + 1000},,เด็กชายคน${i},ทดสอบ,ห้องใหญ่ ชั้น 3`)].join('\n')
  await applyImport(db(), parseZipgradeCsv(big).rows, { deactivateMissing: false })
  expect(await applyImport(db(), rows(), { deactivateMissing: true })).toEqual({ created: 7, updated: 0, deactivated: 150 })
  expect((await byZip('1000')).active).toBe(false)
})
