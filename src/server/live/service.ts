import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import {
  aggregate,
  answerSchemaFor,
  LIVE_EXP,
  QUIZ_GRACE_MS,
  toStudentState,
  type ActivityInput,
  type LiveActivityView,
  type LiveSessionSummary,
  type MyLiveAnswer,
  type StudentLiveState,
  type TeacherLiveState,
} from '../../shared/live'
import { newId, type Db } from '../db/client'
import type { Env } from '../env'
import { classes, liveActivities, liveResponses, liveSessions, pointEvents, students } from '../db/schema'
import { apiError } from '../http'

export const liveNotFound = () => apiError('live_not_found', 'ไม่พบไลฟ์นี้', 404)
const activityNotFound = () => apiError('activity_not_found', 'ไม่พบกิจกรรมนี้', 404)

type Activity = typeof liveActivities.$inferSelect
const asInput = (a: Activity) => ({ ...a.config, kind: a.kind }) as ActivityInput

async function getSession(db: Db, id: string) {
  const [s] = await db.select().from(liveSessions).where(eq(liveSessions.id, id))
  if (!s) throw liveNotFound()
  return s
}

async function getActivity(db: Db, aid: string) {
  const [a] = await db.select().from(liveActivities).where(eq(liveActivities.id, aid))
  if (!a) throw activityNotFound()
  return a
}

const activitiesOf = (db: Db, sessionId: string) =>
  db.select().from(liveActivities).where(eq(liveActivities.sessionId, sessionId)).orderBy(asc(liveActivities.sortOrder), asc(liveActivities.createdAt))

export async function createLive(db: Db, classId: string, title: string, t: number): Promise<string> {
  const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId))
  if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const id = newId()
  await db.insert(liveSessions).values({ id, classId, title, createdAt: t })
  return id
}

export async function listLive(db: Db, classId: string): Promise<LiveSessionSummary[]> {
  const rows = await db
    .select({
      id: liveSessions.id,
      title: liveSessions.title,
      status: liveSessions.status,
      createdAt: liveSessions.createdAt,
      startedAt: liveSessions.startedAt,
      activityCount: sql<number>`(SELECT count(*) FROM live_activities a WHERE a.session_id = "live_sessions"."id")`,
    })
    .from(liveSessions)
    .where(eq(liveSessions.classId, classId))
    .orderBy(desc(liveSessions.createdAt))
  return rows
}

export async function renameLive(db: Db, id: string, title: string): Promise<void> {
  await getSession(db, id)
  await db.update(liveSessions).set({ title }).where(eq(liveSessions.id, id))
}

async function hasResponses(db: Db, where: ReturnType<typeof eq>) {
  const [r] = await db.select({ id: liveResponses.id }).from(liveResponses).innerJoin(liveActivities, eq(liveResponses.activityId, liveActivities.id)).where(where).limit(1)
  return !!r
}

export async function deleteLive(db: Db, id: string): Promise<void> {
  const s = await getSession(db, id)
  if (s.status === 'live') throw apiError('live_running', 'จบไลฟ์ก่อนจึงลบได้', 409)
  if (await hasResponses(db, eq(liveActivities.sessionId, id))) throw apiError('has_responses', 'ไลฟ์นี้มีคำตอบของนักเรียนแล้ว ลบไม่ได้', 409)
  await db.batch([db.delete(liveActivities).where(eq(liveActivities.sessionId, id)), db.delete(liveSessions).where(eq(liveSessions.id, id))])
}

export async function addActivity(db: Db, id: string, input: ActivityInput, t: number): Promise<string> {
  const s = await getSession(db, id)
  if (s.status === 'ended') throw apiError('live_ended', 'ไลฟ์นี้จบแล้ว', 409)
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${liveActivities.sortOrder}), -1) + 1` })
    .from(liveActivities)
    .where(eq(liveActivities.sessionId, id))
  const { kind, ...config } = input
  const aid = newId()
  await db.insert(liveActivities).values({ id: aid, sessionId: id, sortOrder: next, kind, config, createdAt: t })
  return aid
}

export async function updateActivity(db: Db, aid: string, input: ActivityInput): Promise<string> {
  const a = await getActivity(db, aid)
  if (await hasResponses(db, eq(liveActivities.id, aid))) throw apiError('has_responses', 'มีนักเรียนตอบแล้ว แก้กิจกรรมนี้ไม่ได้', 409)
  const { kind, ...config } = input
  await db.update(liveActivities).set({ kind, config }).where(eq(liveActivities.id, aid))
  return a.sessionId
}

export async function deleteActivity(db: Db, aid: string): Promise<string> {
  const a = await getActivity(db, aid)
  if (await hasResponses(db, eq(liveActivities.id, aid))) throw apiError('has_responses', 'มีนักเรียนตอบแล้ว ลบกิจกรรมนี้ไม่ได้', 409)
  await db.batch([
    db.update(liveSessions).set({ currentActivityId: null }).where(and(eq(liveSessions.id, a.sessionId), eq(liveSessions.currentActivityId, aid))),
    db.delete(liveActivities).where(eq(liveActivities.id, aid)),
  ])
  return a.sessionId
}

export async function moveActivity(db: Db, aid: string, dir: -1 | 1): Promise<string> {
  const a = await getActivity(db, aid)
  const list = await activitiesOf(db, a.sessionId)
  const i = list.findIndex((x) => x.id === aid)
  const j = i + dir
  if (j < 0 || j >= list.length) return a.sessionId
  // จัดลำดับใหม่ทั้งชุดเป็น 0..n-1 (กันค่า sort_order ซ้ำ)
  const order = list.map((x) => x.id)
  ;[order[i], order[j]] = [order[j], order[i]]
  await db.batch(order.map((id, k) => db.update(liveActivities).set({ sortOrder: k }).where(eq(liveActivities.id, id))) as [never, ...never[]])
  return a.sessionId
}

/** เปิดกิจกรรม: ตั้งเป็นกิจกรรมปัจจุบัน, เริ่มจับเวลาครั้งแรกที่เปิด */
async function openActivity(db: Db, sessionId: string, a: Activity, t: number) {
  await db.batch([
    db.update(liveSessions).set({ currentActivityId: a.id }).where(eq(liveSessions.id, sessionId)),
    db.update(liveActivities).set({ openedAt: a.openedAt ?? t }).where(eq(liveActivities.id, a.id)),
  ])
}

export async function startLive(db: Db, id: string, t: number): Promise<string[]> {
  const s = await getSession(db, id)
  if (s.status === 'ended') throw apiError('live_ended', 'ไลฟ์นี้จบแล้ว', 409)
  // ห้องหนึ่งมีไลฟ์ได้ทีละอัน: จบไลฟ์อื่นของห้องนี้ที่ค้างอยู่
  const others = await db
    .select({ id: liveSessions.id })
    .from(liveSessions)
    .where(and(eq(liveSessions.classId, s.classId), eq(liveSessions.status, 'live'), ne(liveSessions.id, id)))
  for (const o of others) await db.update(liveSessions).set({ status: 'ended', endedAt: t }).where(eq(liveSessions.id, o.id))
  await db.update(liveSessions).set({ status: 'live', startedAt: s.startedAt ?? t }).where(eq(liveSessions.id, id))
  if (!s.currentActivityId) {
    const [first] = await activitiesOf(db, id)
    if (first) await openActivity(db, id, first, t)
  }
  return others.map((o) => o.id)
}

export async function endLive(db: Db, id: string, t: number): Promise<void> {
  await getSession(db, id)
  await db.update(liveSessions).set({ status: 'ended', endedAt: t }).where(eq(liveSessions.id, id))
}

export async function gotoActivity(db: Db, id: string, index: number, t: number): Promise<void> {
  const s = await getSession(db, id)
  if (s.status !== 'live') throw apiError('not_live', 'ยังไม่ได้เริ่มไลฟ์', 409)
  const a = (await activitiesOf(db, id))[index]
  if (!a) throw activityNotFound()
  await openActivity(db, id, a, t)
}

async function currentActivity(db: Db, id: string) {
  const s = await getSession(db, id)
  if (!s.currentActivityId) throw apiError('no_activity', 'ยังไม่มีกิจกรรมที่เปิดอยู่', 409)
  return { s, a: await getActivity(db, s.currentActivityId) }
}

export async function setAccepting(db: Db, id: string, open: boolean, t: number): Promise<void> {
  const { a } = await currentActivity(db, id)
  // เปิดรับควิซใหม่ = เริ่มจับเวลาใหม่
  await db
    .update(liveActivities)
    .set({ accepting: open, ...(open && a.kind === 'quiz' ? { openedAt: t } : {}) })
    .where(eq(liveActivities.id, a.id))
}

export async function setShowResults(db: Db, id: string, show: boolean): Promise<void> {
  const { a } = await currentActivity(db, id)
  await db.update(liveActivities).set({ showResults: show }).where(eq(liveActivities.id, a.id))
}

function deadlineOf(a: Activity): number | null {
  if (a.kind !== 'quiz' || a.openedAt === null) return null
  return a.openedAt + Number((a.config as { seconds: number }).seconds) * 1000
}

export async function teacherState(db: Db, id: string, t: number): Promise<TeacherLiveState> {
  const s = await getSession(db, id)
  const [cls] = await db.select({ name: classes.name, joinCode: classes.joinCode }).from(classes).where(eq(classes.id, s.classId))
  const list = await activitiesOf(db, id)
  const counts = await db
    .select({ activityId: liveResponses.activityId, n: sql<number>`count(*)` })
    .from(liveResponses)
    .innerJoin(liveActivities, eq(liveResponses.activityId, liveActivities.id))
    .where(eq(liveActivities.sessionId, id))
    .groupBy(liveResponses.activityId)
  const countOf = (aid: string) => counts.find((c) => c.activityId === aid)?.n ?? 0
  let current: TeacherLiveState['current'] = null
  const idx = list.findIndex((a) => a.id === s.currentActivityId)
  if (idx >= 0) {
    const a = list[idx]
    const input = asInput(a)
    const rs = await db
      .select({ answer: liveResponses.answer, correct: liveResponses.correct, elapsedMs: liveResponses.elapsedMs, name: students.firstName })
      .from(liveResponses)
      .innerJoin(students, eq(liveResponses.studentId, students.id))
      .where(eq(liveResponses.activityId, a.id))
      .orderBy(asc(liveResponses.answeredAt))
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(students)
      .where(and(eq(students.classId, s.classId), eq(students.active, true)))
    const deadline = deadlineOf(a)
    const activity: LiveActivityView = {
      id: a.id,
      index: idx,
      kind: a.kind,
      prompt: input.prompt,
      ...(input.kind === 'poll' || input.kind === 'quiz' ? { options: input.options } : {}),
      ...(input.kind === 'quiz' ? { correct: input.correct, seconds: input.seconds } : {}),
      // ควิซหมดเวลาแล้วถือว่าปิดรับ
      accepting: a.accepting && (deadline === null || t <= deadline + QUIZ_GRACE_MS),
      showResults: a.showResults,
      openedAt: a.openedAt,
      deadline,
    }
    current = { activity, responseCount: rs.length, total, results: aggregate(input, rs) }
  }
  return {
    session: { id: s.id, title: s.title, status: s.status, classId: s.classId, className: cls?.name ?? '', joinCode: cls?.joinCode ?? '' },
    activities: list.map((a) => ({ ...asInput(a), id: a.id, responseCount: countOf(a.id) })),
    current,
    serverNow: t,
  }
}

/** ส่ง state ล่าสุดให้ทุกคนที่ต่อ WebSocket อยู่ (พลาดก็ไม่เป็นไร ไคลเอนต์ดึงใหม่เองเมื่อต่อใหม่) */
export async function publish(env: Pick<Env, 'DB' | 'LIVE'>, db: Db, id: string, t: number): Promise<void> {
  try {
    const teacher = await teacherState(db, id, t)
    const stub = env.LIVE.get(env.LIVE.idFromName(`live:${id}`))
    await stub.fetch('https://live/broadcast', { method: 'POST', body: JSON.stringify({ teacher, student: toStudentState(teacher) }) })
  } catch (e) {
    console.error('live publish failed', e)
  }
}

// ---------- นักเรียน ----------

type Student = { studentId: string; classId: string }

/** ไลฟ์ของห้องนักเรียน: ต้องเป็นห้องเดียวกันและเริ่มแล้ว (draft ไม่ให้เห็น) */
async function sessionForStudent(db: Db, id: string, st: Student) {
  const [s] = await db.select().from(liveSessions).where(eq(liveSessions.id, id))
  if (!s || s.classId !== st.classId || s.status === 'draft') throw liveNotFound()
  return s
}

export async function canJoin(db: Db, id: string, st: Student): Promise<boolean> {
  const [s] = await db.select().from(liveSessions).where(eq(liveSessions.id, id))
  return !!s && s.classId === st.classId && s.status === 'live'
}

export async function currentForStudent(db: Db, classId: string): Promise<{ id: string; title: string } | null> {
  const [s] = await db
    .select({ id: liveSessions.id, title: liveSessions.title })
    .from(liveSessions)
    .where(and(eq(liveSessions.classId, classId), eq(liveSessions.status, 'live')))
    .orderBy(desc(liveSessions.startedAt))
    .limit(1)
  return s ?? null
}

export async function studentState(db: Db, id: string, st: Student, t: number): Promise<StudentLiveState & { mine: MyLiveAnswer }> {
  await sessionForStudent(db, id, st)
  const state = toStudentState(await teacherState(db, id, t))
  let mine: MyLiveAnswer = null
  if (state.current) {
    const [r] = await db
      .select({ answer: liveResponses.answer, correct: liveResponses.correct })
      .from(liveResponses)
      .where(and(eq(liveResponses.activityId, state.current.activity.id), eq(liveResponses.studentId, st.studentId)))
    // ผลถูก/ผิดของควิซเปิดเผยพร้อมเฉลยเท่านั้น
    if (r) mine = { activityId: state.current.activity.id, answer: r.answer, correct: state.current.activity.showResults ? r.correct : null }
  }
  return { ...state, mine }
}

// ไม่คืนจำนวน EXP: จะเดาได้ว่าควิซถูกก่อนครูเฉลย
export async function submitAnswer(db: Db, id: string, st: Student, body: unknown, t: number): Promise<void> {
  const s = await sessionForStudent(db, id, st)
  if (s.status !== 'live' || !s.currentActivityId) throw apiError('closed', 'ปิดรับคำตอบแล้ว', 409)
  const a = await getActivity(db, s.currentActivityId)
  const input = asInput(a)
  const deadline = deadlineOf(a)
  if (!a.accepting || (deadline !== null && t > deadline + QUIZ_GRACE_MS)) throw apiError('closed', 'ปิดรับคำตอบแล้ว', 409)
  const parsed = answerSchemaFor(input).safeParse(body)
  if (!parsed.success) throw apiError('invalid_request', 'คำตอบไม่ถูกต้อง', 400)
  const answer = parsed.data as Record<string, unknown>
  const correct = input.kind === 'quiz' ? answer.choice === input.correct : null
  const rid = newId()
  const inserted = await db
    .insert(liveResponses)
    .values({ id: rid, activityId: a.id, studentId: st.studentId, answer, correct, elapsedMs: a.openedAt === null ? null : Math.max(0, t - a.openedAt), answeredAt: t })
    .onConflictDoNothing()
    .returning({ id: liveResponses.id })
  if (inserted.length === 0) throw apiError('already_answered', 'ตอบกิจกรรมนี้แล้ว', 409)
  const reason = `ไลฟ์: ${s.title}`
  const events: (typeof pointEvents.$inferInsert)[] = [{ id: newId(), studentId: st.studentId, delta: LIVE_EXP.answer, reason, source: 'live', refId: rid, createdAt: t }]
  if (correct) events.push({ id: newId(), studentId: st.studentId, delta: LIVE_EXP.quizCorrect, reason: `${reason} (ควิซถูก)`, source: 'live', refId: `${rid}:correct`, createdAt: t })
  await db.insert(pointEvents).values(events).onConflictDoNothing()
}
