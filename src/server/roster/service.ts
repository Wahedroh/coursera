import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { RosterRow } from '../../shared/roster/parse'
import { newId, now, type Db } from '../db/client'
import { classes, schools, sessions, students } from '../db/schema'

export type ImportPreview = {
  newStudents: RosterRow[]
  changed: { row: RosterRow; before: { firstName: string; lastName: string; title: string | null; className: string } }[]
  unchanged: number
  missing: { id: string; zipgradeId: string; name: string; className: string }[]
  flagged: RosterRow[]
  newClasses: string[]
}

const JOIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => JOIN_ALPHABET[b % JOIN_ALPHABET.length]).join('')
}

async function loadExisting(db: Db) {
  const rows = await db
    .select({
      id: students.id,
      zipgradeId: students.zipgradeId,
      title: students.title,
      firstName: students.firstName,
      lastName: students.lastName,
      active: students.active,
      className: classes.name,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
  return new Map(rows.map((r) => [r.zipgradeId, r]))
}

function diff(rows: RosterRow[], existing: Awaited<ReturnType<typeof loadExisting>>) {
  const created: RosterRow[] = []
  const changed: ImportPreview['changed'] = []
  let unchanged = 0
  for (const row of rows) {
    const e = existing.get(row.zipgradeId)
    if (!e) {
      created.push(row)
      continue
    }
    const same =
      e.active && e.title === row.title && e.firstName === row.firstName && e.lastName === row.lastName && e.className === row.className
    if (same) unchanged++
    else changed.push({ row, before: { title: e.title, firstName: e.firstName, lastName: e.lastName, className: e.className } })
  }
  const inFile = new Set(rows.map((r) => r.zipgradeId))
  const missing = [...existing.values()]
    .filter((e) => e.active && !inFile.has(e.zipgradeId))
    .map((e) => ({ id: e.id, zipgradeId: e.zipgradeId, name: `${e.firstName} ${e.lastName}`.trim(), className: e.className }))
  return { created, changed, unchanged, missing }
}

export async function previewImport(db: Db, rows: RosterRow[]): Promise<ImportPreview> {
  const existing = await loadExisting(db)
  const { created, changed, unchanged, missing } = diff(rows, existing)
  const classNames = new Set((await db.select({ name: classes.name }).from(classes)).map((c) => c.name))
  const newClasses = [...new Set(rows.map((r) => r.className))].filter((n) => !classNames.has(n)).sort()
  return { newStudents: created, changed, unchanged, missing, flagged: rows.filter((r) => r.flags.length > 0), newClasses }
}

function sortOrders(rows: RosterRow[]): Map<string, number> {
  const byClass = new Map<string, RosterRow[]>()
  for (const r of rows) byClass.set(r.className, [...(byClass.get(r.className) ?? []), r])
  const out = new Map<string, number>()
  for (const group of byClass.values()) {
    const numeric = (z: string) => (/^\d+$/.test(z) ? Number(z) : Number.POSITIVE_INFINITY)
    group
      .slice()
      .sort((a, b) => numeric(a.zipgradeId) - numeric(b.zipgradeId) || a.zipgradeId.localeCompare(b.zipgradeId))
      .forEach((r, i) => out.set(r.zipgradeId, i + 1))
  }
  return out
}

export async function applyImport(
  db: Db,
  rows: RosterRow[],
  opts: { deactivateMissing: boolean },
): Promise<{ created: number; updated: number; deactivated: number }> {
  const t = now()
  const existing = await loadExisting(db)
  const { created, changed, missing } = diff(rows, existing)

  const schoolIds = new Map((await db.select().from(schools)).map((s) => [s.name, s.id]))
  const allClasses = await db.select().from(classes)
  const classIds = new Map(allClasses.map((c) => [c.name, c.id]))
  const usedCodes = new Set(allClasses.map((c) => c.joinCode))

  const stmts: BatchItem<'sqlite'>[] = []
  for (const r of rows) {
    if (classIds.has(r.className)) continue
    let schoolId = schoolIds.get(r.schoolName)
    if (!schoolId) {
      schoolId = newId()
      schoolIds.set(r.schoolName, schoolId)
      stmts.push(db.insert(schools).values({ id: schoolId, name: r.schoolName, createdAt: t }))
    }
    let joinCode = generateJoinCode()
    while (usedCodes.has(joinCode)) joinCode = generateJoinCode()
    usedCodes.add(joinCode)
    const classId = newId()
    classIds.set(r.className, classId)
    stmts.push(db.insert(classes).values({ id: classId, schoolId, grade: r.grade, name: r.className, joinCode, createdAt: t }))
  }

  const order = sortOrders(rows)
  for (const r of created) {
    stmts.push(
      db.insert(students).values({
        id: newId(),
        zipgradeId: r.zipgradeId,
        classId: classIds.get(r.className)!,
        title: r.title,
        firstName: r.firstName,
        lastName: r.lastName,
        sortOrder: order.get(r.zipgradeId)!,
        createdAt: t,
        updatedAt: t,
      }),
    )
  }
  for (const { row, before } of changed) {
    const moved = before.className !== row.className
    stmts.push(
      db
        .update(students)
        .set({
          title: row.title,
          firstName: row.firstName,
          lastName: row.lastName,
          classId: classIds.get(row.className)!,
          active: true,
          updatedAt: t,
          ...(moved ? { sortOrder: order.get(row.zipgradeId)! } : {}),
        })
        .where(eq(students.zipgradeId, row.zipgradeId)),
    )
  }
  if (opts.deactivateMissing) {
    // D1 จำกัดตัวแปรไม่เกิน 100 ตัวต่อคำสั่ง
    for (let i = 0; i < missing.length; i += 90) {
      const ids = missing.slice(i, i + 90).map((m) => m.id)
      stmts.push(db.update(students).set({ active: false, updatedAt: t }).where(inArray(students.id, ids)))
    }
  }

  if (stmts.length > 0) await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { created: created.length, updated: changed.length, deactivated: opts.deactivateMissing ? missing.length : 0 }
}

export type ClassSummary = { id: string; name: string; grade: number | null; joinCode: string; studentCount: number; pinSetCount: number }
export type SchoolSummary = { schoolId: string; schoolName: string; classes: ClassSummary[] }

export async function listClasses(db: Db): Promise<SchoolSummary[]> {
  const rows = await db
    .select({
      schoolId: schools.id,
      schoolName: schools.name,
      id: classes.id,
      name: classes.name,
      grade: classes.grade,
      joinCode: classes.joinCode,
      studentCount: sql<number>`count(${students.id})`,
      pinSetCount: sql<number>`count(${students.pinHash})`,
    })
    .from(classes)
    .innerJoin(schools, eq(classes.schoolId, schools.id))
    .leftJoin(students, and(eq(students.classId, classes.id), eq(students.active, true)))
    .where(eq(classes.archived, false))
    .groupBy(classes.id)
  const bySchool = new Map<string, SchoolSummary>()
  for (const r of rows) {
    const s = bySchool.get(r.schoolId) ?? { schoolId: r.schoolId, schoolName: r.schoolName, classes: [] }
    s.classes.push({ id: r.id, name: r.name, grade: r.grade, joinCode: r.joinCode, studentCount: r.studentCount, pinSetCount: r.pinSetCount })
    bySchool.set(r.schoolId, s)
  }
  const out = [...bySchool.values()].sort((a, b) => (a.schoolName < b.schoolName ? -1 : a.schoolName > b.schoolName ? 1 : 0))
  for (const s of out) s.classes.sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.name < b.name ? -1 : 1))
  return out
}

export type StudentAdminRow = {
  id: string
  zipgradeId: string
  title: string | null
  firstName: string
  lastName: string
  sortOrder: number
  active: boolean
  pinSet: boolean
  locked: boolean
  activeSessions: number
  newDeviceSessionIds: string[]
  lastSeenAt: number | null
}

export async function listStudents(db: Db, classId: string): Promise<StudentAdminRow[]> {
  const t = now()
  const rows = await db.select().from(students).where(eq(students.classId, classId)).orderBy(students.sortOrder, students.zipgradeId)
  if (rows.length === 0) return []
  const live = await db
    .select({ id: sessions.id, studentId: sessions.studentId, flagged: sessions.flaggedNewDevice, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .innerJoin(students, eq(sessions.studentId, students.id))
    .where(and(eq(students.classId, classId), isNull(sessions.revokedAt), gt(sessions.expiresAt, t)))
  return rows.map((s) => {
    const mine = live.filter((x) => x.studentId === s.id)
    return {
      id: s.id,
      zipgradeId: s.zipgradeId,
      title: s.title,
      firstName: s.firstName,
      lastName: s.lastName,
      sortOrder: s.sortOrder,
      active: s.active,
      pinSet: s.pinHash !== null,
      locked: s.lockedUntil !== null && s.lockedUntil > t,
      activeSessions: mine.length,
      newDeviceSessionIds: mine.filter((x) => x.flagged).map((x) => x.id),
      lastSeenAt: mine.length ? Math.max(...mine.map((x) => x.lastSeenAt)) : null,
    }
  })
}
