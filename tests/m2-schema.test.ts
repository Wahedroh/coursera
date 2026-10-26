import { env } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { attendanceDays, attendanceRecords, eggs, seating } from '../src/server/db/schema'
import { seedClass, seedStudent } from './helpers'

it('unique(classId, date) และ unique(dayId, studentId)', async () => {
  const db = getDb(env)
  const { classId } = await seedClass(db)
  const s = await seedStudent(db, classId)
  const dayId = newId()
  await db.insert(attendanceDays).values({ id: dayId, classId, date: '2026-10-26', createdAt: now() })
  await expect(db.insert(attendanceDays).values({ id: newId(), classId, date: '2026-10-26', createdAt: now() })).rejects.toThrow()
  const rec = { dayId, studentId: s.id, status: 'present' as const, source: 'teacher' as const, updatedAt: now() }
  await db.insert(attendanceRecords).values({ id: newId(), ...rec })
  await expect(db.insert(attendanceRecords).values({ id: newId(), ...rec })).rejects.toThrow()
})

it('eggs unique(studentId, level) และ seating ต่อห้อง', async () => {
  const db = getDb(env)
  const { classId } = await seedClass(db)
  const s = await seedStudent(db, classId)
  await db.insert(eggs).values({ id: newId(), studentId: s.id, level: 1, createdAt: now() })
  await expect(db.insert(eggs).values({ id: newId(), studentId: s.id, level: 1, createdAt: now() })).rejects.toThrow()
  await db.insert(seating).values({ classId, layout: { cols: 6, seats: [s.id, null] }, updatedAt: now() })
  const [row] = await db.select().from(seating)
  expect(row.layout).toEqual({ cols: 6, seats: [s.id, null] })
})
