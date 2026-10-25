import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { students } from '../src/server/db/schema'
import { seedClass, seedStudent } from './helpers'

it('บันทึกและอ่านนักเรียนได้', async () => {
  const db = getDb(env)
  const { classId } = await seedClass(db)
  const { id } = await seedStudent(db, classId, { firstName: 'สมใจ' })
  const [row] = await db.select().from(students).where(eq(students.id, id))
  expect(row.firstName).toBe('สมใจ')
  expect(row.active).toBe(true)
  expect(row.pinHash).toBeNull()
})

it('zipgradeId ซ้ำไม่ได้', async () => {
  const db = getDb(env)
  const { classId } = await seedClass(db)
  await seedStudent(db, classId, { zipgradeId: '9001' })
  await expect(seedStudent(db, classId, { zipgradeId: '9001' })).rejects.toThrow()
})
