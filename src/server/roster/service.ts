import { eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { RosterRow } from '../../shared/roster/parse'
import { newId, now, type Db } from '../db/client'
import { classes, schools, students } from '../db/schema'

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
