import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { avatarConfigSchema, DEFAULT_AVATAR, type AvatarConfig } from '../../shared/avatar'
import { CHARACTERS, RARITY_WEIGHTS } from '../../shared/characters'
import { EXP_PER_LEVEL, levelOf } from '../../shared/points'
import { newId, now, type Db } from '../db/client'
import { classes, eggs, pointEvents, seating, settings, studentAvatars, students } from '../db/schema'
import { apiError } from '../http'

export type Layout = { cols: number; seats: (string | null)[] }

export async function givePoints(db: Db, studentIds: string[], delta: number, reason: string): Promise<void> {
  const unique = [...new Set(studentIds)]
  // ≤ 60 คน (จำกัดที่ route) — ไม่เกินข้อจำกัด 100 ตัวแปรของ D1; ให้แต้มเฉพาะคนที่ยังอยู่ในห้อง
  const found = await db.select({ id: students.id }).from(students).where(and(inArray(students.id, unique), eq(students.active, true)))
  if (found.length !== unique.length) throw apiError('student_not_found', 'ไม่พบนักเรียน', 404)
  const t = now()
  const rows = unique.map((studentId) => ({ id: newId(), studentId, delta, reason, source: 'manual' as const, refId: null, createdAt: t }))
  for (let i = 0; i < rows.length; i += 10) await db.insert(pointEvents).values(rows.slice(i, i + 10))
}

export async function classPoints(db: Db, classId: string): Promise<{ studentId: string; exp: number; level: number; avatar: AvatarConfig }[]> {
  const rows = await db
    .select({ studentId: students.id, exp: sql<number>`coalesce(sum(${pointEvents.delta}), 0)`, avatar: studentAvatars.config })
    .from(students)
    .leftJoin(pointEvents, eq(pointEvents.studentId, students.id))
    .leftJoin(studentAvatars, eq(studentAvatars.studentId, students.id))
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .groupBy(students.id)
  return rows.map((r) => ({ ...r, level: levelOf(r.exp), avatar: parseAvatar(r.avatar) }))
}

export async function getSeating(db: Db, classId: string): Promise<Layout> {
  const roster = (
    await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.classId, classId), eq(students.active, true)))
      .orderBy(students.sortOrder, students.zipgradeId)
  ).map((s) => s.id)
  const [row] = await db.select().from(seating).where(eq(seating.classId, classId))
  if (!row) return { cols: 6, seats: roster }
  // ผังที่บันทึกไว้: ซ่อนคนที่ไม่อยู่ห้อง/ปิดใช้งาน และต่อท้ายนักเรียนที่ยังไม่มีที่นั่ง
  const active = new Set(roster)
  const seats = row.layout.seats.map((s) => (s && active.has(s) ? s : null))
  const placed = new Set(seats)
  return { cols: row.layout.cols, seats: [...seats, ...roster.filter((s) => !placed.has(s))] }
}

export async function saveSeating(db: Db, classId: string, layout: Layout): Promise<void> {
  const ids = layout.seats.filter((x): x is string => x !== null)
  const bad = () => apiError('invalid_layout', 'ผังที่นั่งไม่ถูกต้อง', 400)
  if (new Set(ids).size !== ids.length) throw bad()
  const roster = new Set(
    (await db.select({ id: students.id }).from(students).where(eq(students.classId, classId))).map((s) => s.id),
  )
  if (ids.some((id) => !roster.has(id))) throw bad()
  const [cls] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId))
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  await db
    .insert(seating)
    .values({ classId, layout, updatedAt: now() })
    .onConflictDoUpdate({ target: seating.classId, set: { layout, updatedAt: now() } })
}

/** สุ่มตัวละครตามน้ำหนักความหายาก; rand ∈ [0,1) */
export function rollCharacter(rand: () => number): string {
  let r = rand() * 100
  let rarity = RARITY_WEIGHTS[0][0]
  for (const [k, w] of RARITY_WEIGHTS) {
    if (r < w) {
      rarity = k
      break
    }
    r -= w
  }
  const pool = CHARACTERS.filter((c) => c.rarity === rarity)
  return pool[Math.floor(rand() * pool.length) % pool.length].id
}

export const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32

export async function studentExp(db: Db, studentId: string): Promise<number> {
  const [{ exp }] = await db
    .select({ exp: sql<number>`coalesce(sum(${pointEvents.delta}), 0)` })
    .from(pointEvents)
    .where(eq(pointEvents.studentId, studentId))
  return exp
}

export async function progress(db: Db, studentId: string) {
  const exp = await studentExp(db, studentId)
  const level = levelOf(exp)
  const t = now()
  const have = new Set((await db.select({ level: eggs.level }).from(eggs).where(eq(eggs.studentId, studentId))).map((e) => e.level))
  const missing = Array.from({ length: level }, (_, i) => i + 1).filter((l) => !have.has(l))
  for (let i = 0; i < missing.length; i += 10) {
    await db
      .insert(eggs)
      .values(missing.slice(i, i + 10).map((l) => ({ id: newId(), studentId, level: l, createdAt: t })))
      .onConflictDoNothing()
  }
  const myEggs = await db
    .select({ id: eggs.id, level: eggs.level, characterId: eggs.characterId, openedAt: eggs.openedAt })
    .from(eggs)
    .where(eq(eggs.studentId, studentId))
    .orderBy(eggs.level)
  const history = await db
    .select({ delta: pointEvents.delta, reason: pointEvents.reason, createdAt: pointEvents.createdAt })
    .from(pointEvents)
    .where(eq(pointEvents.studentId, studentId))
    .orderBy(desc(pointEvents.createdAt))
    .limit(30)
  return { exp, level, nextLevelAt: (level + 1) * EXP_PER_LEVEL, eggs: myEggs, history }
}

export async function openEgg(db: Db, studentId: string, eggId: string, rand = secureRandom): Promise<{ characterId: string }> {
  const [egg] = await db.select({ id: eggs.id }).from(eggs).where(and(eq(eggs.id, eggId), eq(eggs.studentId, studentId)))
  if (!egg) throw apiError('egg_not_found', 'ไม่พบไข่ใบนี้', 404)
  const characterId = rollCharacter(rand)
  const res = await db
    .update(eggs)
    .set({ characterId, openedAt: now() })
    .where(and(eq(eggs.id, eggId), eq(eggs.studentId, studentId), isNull(eggs.openedAt)))
    .returning({ id: eggs.id })
  if (!res.length) throw apiError('egg_already_opened', 'ไข่ใบนี้เปิดไปแล้ว', 409)
  return { characterId }
}

const leaderboardKey = (classId: string) => `leaderboard_enabled:${classId}`

export async function leaderboardEnabled(db: Db, classId: string): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, leaderboardKey(classId)))
  return row ? JSON.parse(row.value) === true : false
}

export async function setLeaderboard(db: Db, classId: string, enabled: boolean): Promise<void> {
  const value = JSON.stringify(enabled)
  await db.insert(settings).values({ key: leaderboardKey(classId), value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

export async function leaderboard(db: Db, classId: string, studentId: string) {
  if (!(await leaderboardEnabled(db, classId))) throw apiError('leaderboard_disabled', 'ครูยังไม่เปิดกระดานจัดอันดับ', 403)
  const rows = await db
    .select({ id: students.id, firstName: students.firstName, exp: sql<number>`coalesce(sum(${pointEvents.delta}), 0)`, avatar: studentAvatars.config })
    .from(students)
    .leftJoin(pointEvents, eq(pointEvents.studentId, students.id))
    .leftJoin(studentAvatars, eq(studentAvatars.studentId, students.id))
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .groupBy(students.id)
  // แต้มเท่ากันได้อันดับเท่ากัน (1, 2, 2, 4) และเรียงชื่อเพื่อให้ลำดับคงที่
  const sorted = rows.sort((a, b) => b.exp - a.exp || a.firstName.localeCompare(b.firstName, 'th'))
  return sorted
    .map((r, i) => ({ r, rank: sorted.findIndex((x) => x.exp === r.exp) + 1, i }))
    .filter(({ rank }) => rank <= 10)
    .map(({ r, rank }) => ({ rank, firstName: r.firstName, exp: r.exp, level: levelOf(r.exp), isMe: r.id === studentId, avatar: parseAvatar(r.avatar) }))
}

/** ค่าที่เก็บไว้ผิดรูปแบบ (เช่น ตัวเลือกที่ถูกเอาออกในเวอร์ชันหลัง) → ใช้ค่าเริ่มต้น */
const parseAvatar = (v: unknown): AvatarConfig => {
  const r = avatarConfigSchema.safeParse(v)
  return r.success ? r.data : DEFAULT_AVATAR
}

export async function getAvatar(db: Db, studentId: string): Promise<{ nickname: string; config: AvatarConfig; isDefault: boolean }> {
  const [row] = await db.select().from(studentAvatars).where(eq(studentAvatars.studentId, studentId))
  return row ? { nickname: row.nickname, config: parseAvatar(row.config), isDefault: false } : { nickname: '', config: DEFAULT_AVATAR, isDefault: true }
}

export async function saveAvatar(db: Db, studentId: string, nickname: string, config: AvatarConfig, t: number): Promise<void> {
  const values = { nickname, config, updatedAt: t }
  await db.insert(studentAvatars).values({ studentId, ...values }).onConflictDoUpdate({ target: studentAvatars.studentId, set: values })
}
