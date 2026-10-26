import { env } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { assignments, pointEvents, submissions } from '../src/server/db/schema'
import { seedClass, seedStudent } from './helpers'

it('บันทึก assignment + submission และ unique(assignment, student)', async () => {
  const db = getDb(env)
  const { classId } = await seedClass(db)
  const { id: studentId } = await seedStudent(db, classId)
  const assignmentId = newId()
  await db.insert(assignments).values({ id: assignmentId, classId, title: 'ใบงาน 1', maxScore: 10, submitMode: 'both', createdAt: now(), updatedAt: now() })
  const sub = { assignmentId, studentId, status: 'submitted' as const, submittedAt: now(), updatedAt: now() }
  await db.insert(submissions).values({ id: newId(), ...sub })
  await expect(db.insert(submissions).values({ id: newId(), ...sub })).rejects.toThrow()
})

it('pointEvents unique(source, refId)', async () => {
  const db = getDb(env)
  const { classId } = await seedClass(db)
  const { id: studentId } = await seedStudent(db, classId)
  const ev = { studentId, delta: 10, reason: 'ส่งงาน', source: 'assignment' as const, refId: 'sub-1', createdAt: now() }
  await db.insert(pointEvents).values({ id: newId(), ...ev })
  await expect(db.insert(pointEvents).values({ id: newId(), ...ev })).rejects.toThrow()
})
