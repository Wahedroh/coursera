import { classes, schools, students } from '../src/server/db/schema'
import { newId, now, type Db } from '../src/server/db/client'

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export async function seedClass(db: Db, overrides: { schoolName?: string; name?: string; grade?: number | null } = {}) {
  const u = unique()
  const schoolId = newId()
  const classId = newId()
  const joinCode = u.toUpperCase().slice(-6).padStart(6, 'X')
  await db.insert(schools).values({ id: schoolId, name: overrides.schoolName ?? `โรงเรียน ${u}`, createdAt: now() })
  await db.insert(classes).values({
    id: classId,
    schoolId,
    grade: overrides.grade ?? 1,
    name: overrides.name ?? `โรงเรียน ${u} ชั้น 1`,
    joinCode,
    createdAt: now(),
  })
  return { schoolId, classId, joinCode }
}

export async function seedStudent(
  db: Db,
  classId: string,
  overrides: Partial<typeof students.$inferInsert> = {},
) {
  const id = overrides.id ?? newId()
  const zipgradeId = overrides.zipgradeId ?? String(100000 + counter++ + Math.floor(Math.random() * 1e6))
  await db.insert(students).values({
    id,
    zipgradeId,
    classId,
    title: 'เด็กหญิง',
    firstName: 'ทดสอบ',
    lastName: 'ระบบ',
    sortOrder: 0,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  })
  return { id, zipgradeId }
}

/** ล้างข้อมูลทุก binding แล้ว apply migrations ใหม่ (storage ของ plugin แยกต่อไฟล์ ไม่ใช่ต่อเทสต์) */
export async function resetDb() {
  const { reset, applyD1Migrations, env } = await import('cloudflare:test')
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
}
