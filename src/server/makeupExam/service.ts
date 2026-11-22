import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import {
  ANSWER_GRACE_MS,
  answerKey,
  examLayout,
  gradeMakeup,
  MAKEUP_LEAVE_LIMIT,
  makeupDeadline,
  type ExamSet,
  type ExamSetInput,
  type ExamSetSummary,
  type MakeupApprove,
  type MakeupStatus,
  type StudentExamPaper,
  type StudentMakeup,
  type TeacherMakeupDetail,
  type TeacherMakeupRow,
  type TeacherMakeups,
} from '../../shared/makeupExam'
import { newId, type Db } from '../db/client'
import { classes, examSets, makeupEvents, makeupExams, scoreItems, scores, students } from '../db/schema'
import { apiError } from '../http'
import { enqueue } from '../push/service'
import { saveScore } from '../scores/service'
import { notifyTeacher } from '../teacherNotify/service'
import { termWindow } from '../terms/service'

/** หมายเหตุในคะแนนเมื่อหมดสิทธิ์สอบย้อนหลัง (ใช้หาว่าใครได้ 0 จากระบบ) */
export const EXPIRED_NOTE = 'หมดสิทธิ์สอบย้อนหลัง'
const notFound = () => apiError('makeup_not_found', 'ไม่พบการสอบย้อนหลังนี้', 404)
const fullName = (s: { title: string | null; firstName: string; lastName: string }) => `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim()
const code6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
const seed32 = () => crypto.getRandomValues(new Uint32Array(1))[0]

// ---------- ชุดข้อสอบ ----------
export async function listExamSets(db: Db): Promise<ExamSetSummary[]> {
  const rows = await db.select().from(examSets).orderBy(desc(examSets.updatedAt))
  return rows.map((r) => ({ id: r.id, title: r.title, kind: r.kind, count: r.kind === 'typed' ? r.questions.length : r.answers.length, updatedAt: r.updatedAt }))
}
export async function getExamSet(db: Db, id: string): Promise<ExamSet> {
  const [r] = await db.select().from(examSets).where(eq(examSets.id, id))
  if (!r) throw apiError('exam_set_not_found', 'ไม่พบชุดข้อสอบนี้', 404)
  return { id: r.id, title: r.title, kind: r.kind, questions: r.questions, pageKeys: r.pageKeys, answers: r.answers, choiceCount: r.choiceCount, updatedAt: r.updatedAt }
}
const setValues = (input: ExamSetInput) =>
  input.kind === 'typed'
    ? { title: input.title, kind: input.kind, questions: input.questions, pageKeys: [], answers: [], choiceCount: Math.max(...input.questions.map((q) => q.choices.length)) }
    : { title: input.title, kind: input.kind, questions: [], pageKeys: input.pageKeys, answers: input.answers, choiceCount: input.choiceCount }
export async function createExamSet(db: Db, input: ExamSetInput, t: number): Promise<string> {
  const id = newId()
  await db.insert(examSets).values({ id, ...setValues(input), createdAt: t, updatedAt: t })
  return id
}
export async function updateExamSet(db: Db, id: string, input: ExamSetInput, t: number): Promise<void> {
  await assertSetEditable(db, id)
  await db.update(examSets).set({ ...setValues(input), updatedAt: t }).where(eq(examSets.id, id))
}
export async function deleteExamSet(db: Db, id: string): Promise<void> {
  await assertSetEditable(db, id)
  const [used] = await db.select({ id: makeupExams.id }).from(makeupExams).where(eq(makeupExams.examSetId, id)).limit(1)
  if (used) throw apiError('exam_set_in_use', 'ชุดนี้ถูกเลือกให้นักเรียนสอบแล้ว ลบไม่ได้', 409)
  await db.update(scoreItems).set({ examSetId: null }).where(eq(scoreItems.examSetId, id))
  await db.delete(examSets).where(eq(examSets.id, id))
}
/** ชุดที่มีคนเริ่มสอบแล้ว แก้/ลบไม่ได้ (เฉลยต้องคงเดิม) */
async function assertSetEditable(db: Db, id: string) {
  await getExamSet(db, id)
  const [used] = await db.select({ id: makeupExams.id }).from(makeupExams).where(and(eq(makeupExams.examSetId, id), inArray(makeupExams.status, ['in_progress', 'submitted', 'graded']))).limit(1)
  if (used) throw apiError('exam_set_in_use', 'มีนักเรียนสอบชุดนี้แล้ว แก้/ลบไม่ได้ — คัดลอกเป็นชุดใหม่แทน', 409)
}

// ---------- ข้อมูลรายการ ----------
type Row = typeof makeupExams.$inferSelect
async function getExam(db: Db, id: string): Promise<Row> {
  const [r] = await db.select().from(makeupExams).where(eq(makeupExams.id, id))
  if (!r) throw notFound()
  return r
}
async function itemOf(db: Db, id: string) {
  const [i] = await db.select().from(scoreItems).where(eq(scoreItems.id, id))
  if (!i) throw apiError('score_item_not_found', 'ไม่พบรายการสอบนี้', 404)
  return i
}
const OPEN: MakeupStatus[] = ['pending', 'approved', 'in_progress', 'submitted', 'graded']
async function openRequest(db: Db, scoreItemId: string, studentId: string) {
  const [r] = await db
    .select({ id: makeupExams.id })
    .from(makeupExams)
    .where(and(eq(makeupExams.scoreItemId, scoreItemId), eq(makeupExams.studentId, studentId), inArray(makeupExams.status, OPEN)))
    .limit(1)
  return r ?? null
}

// ---------- ฝั่งนักเรียน: ขอสอบ ----------
/** รายการสอบที่ขาดสอบ (เผยแพร่แล้ว · เทอมนี้) + คำขอล่าสุด */
export async function studentMakeups(db: Db, studentId: string, classId: string): Promise<StudentMakeup[]> {
  const { start } = await termWindow(db)
  // ขาดสอบ หรือ ยังไม่มีคะแนน (เผยแพร่แล้วแต่ช่องว่าง) → ขอสอบย้อนหลังได้
  const rows = await db.all<{ id: string; title: string; maxScore: number; takenOn: string; makeupDays: number; absent: number }>(sql`
    SELECT i.id, i.title, i.max_score AS maxScore, i.taken_on AS takenOn, i.makeup_days AS makeupDays, coalesce(s.absent, 0) AS absent
    FROM score_items i LEFT JOIN scores s ON s.item_id = i.id AND s.student_id = ${studentId}
    WHERE i.class_id = ${classId} AND i.published = 1 AND i.created_at >= ${start}
      AND ((i.makeup_days > 0 AND (s.absent = 1 OR s.score IS NULL)) OR EXISTS (SELECT 1 FROM makeup_exams m WHERE m.score_item_id = i.id AND m.student_id = ${studentId}))
    ORDER BY i.taken_on`)
  const reqs = rows.length
    ? await db
        .select()
        .from(makeupExams)
        .where(and(eq(makeupExams.studentId, studentId), inArray(makeupExams.scoreItemId, rows.map((r) => r.id))))
        .orderBy(desc(makeupExams.createdAt))
    : []
  return rows.map((r) => {
    const q = reqs.find((x) => x.scoreItemId === r.id)
    return {
      scoreItemId: r.id,
      title: r.title,
      maxScore: r.maxScore,
      takenOn: r.takenOn,
      absent: !!r.absent,
      deadline: makeupDeadline(r.takenOn, r.makeupDays),
      request: q ? { id: q.id, status: q.status, mode: q.mode, opensAt: q.opensAt, closesAt: q.closesAt, durationMin: q.durationMin, teacherNote: q.teacherNote } : null,
    }
  })
}

export async function requestMakeup(db: Db, p: { studentId: string; classId: string; scoreItemId: string; reason: string; imageKey: string | null; mode: 'online' | 'paper'; t: number }): Promise<string> {
  const item = await itemOf(db, p.scoreItemId)
  if (item.classId !== p.classId || !item.published) throw apiError('score_item_not_found', 'ไม่พบรายการสอบนี้', 404)
  const [s] = await db.select({ absent: scores.absent, score: scores.score }).from(scores).where(and(eq(scores.itemId, item.id), eq(scores.studentId, p.studentId)))
  if (s && !s.absent && s.score !== null) throw apiError('not_absent', 'ขอสอบย้อนหลังได้เฉพาะรายการที่ขาดสอบหรือยังไม่มีคะแนน', 400)
  const deadline = makeupDeadline(item.takenOn, item.makeupDays)
  if (deadline === null) throw apiError('makeup_closed', 'รายการนี้ครูไม่เปิดสอบย้อนหลัง', 400)
  if (p.t > deadline) throw apiError('makeup_expired', 'หมดเวลาขอสอบย้อนหลังแล้ว', 409)
  if (p.imageKey && !p.imageKey.startsWith(`sub/${p.studentId}/`)) throw apiError('invalid_image', 'รูปไม่ถูกต้อง', 400)
  if (await openRequest(db, item.id, p.studentId)) throw apiError('makeup_exists', 'ส่งคำขอรายการนี้ไปแล้ว', 409)
  const id = newId()
  await db.insert(makeupExams).values({ id, scoreItemId: item.id, studentId: p.studentId, reason: p.reason, imageKey: p.imageKey, mode: p.mode, createdAt: p.t, updatedAt: p.t })
  const [st] = await db.select().from(students).where(eq(students.id, p.studentId))
  await notifyTeacher(db, { kind: 'makeup', title: `📝 ขอสอบย้อนหลัง${p.mode === 'online' ? 'ออนไลน์' : 'ออนไซต์'}: ${st ? fullName(st) : ''} · ${item.title}`, body: p.reason, url: '/teacher/makeup-exams', dedupeKey: `mkreq:${id}` }, p.t)
  return id
}

// ---------- ฝั่งครู: อนุมัติ / ให้สิทธิ์ / ตรวจ ----------
/** ค่าที่บันทึกตอนอนุมัติ: รหัสเริ่มสอบใหม่ · สลับข้อ (seed) เฉพาะข้อสอบที่พิมพ์ในระบบ */
async function prepareApprove(db: Db, a: MakeupApprove, t: number) {
  const set = a.mode === 'online' ? await getExamSet(db, a.examSetId!) : null
  return {
    status: 'approved' as const,
    mode: a.mode,
    opensAt: a.opensAt,
    closesAt: a.closesAt,
    durationMin: a.durationMin,
    capPct: a.capPct,
    examSetId: set?.id ?? null,
    code: code6(),
    seed: a.shuffle && set?.kind === 'typed' ? seed32() : null,
    updatedAt: t,
  }
}
async function notifyApproved(db: Db, r: { id: string; studentId: string; scoreItemId: string }, a: MakeupApprove, t: number) {
  const item = await itemOf(db, r.scoreItemId)
  const when = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(a.opensAt)
  await enqueue(db, [{ studentId: r.studentId, title: `✅ ครูอนุมัติสอบย้อนหลัง: ${item.title}`, body: a.mode === 'online' ? `สอบออนไลน์ เริ่มได้ ${when} · ขอรหัสเริ่มสอบจากครู` : `สอบกระดาษกับครู ${when}`, url: '/me/scores', dedupeKey: `mkok:${r.id}:${t}` }], t)
}

export async function approveMakeup(db: Db, id: string, a: MakeupApprove, t: number): Promise<{ code: string }> {
  const r = await getExam(db, id)
  if (r.status !== 'pending' && r.status !== 'approved') throw apiError('makeup_state', 'คำขอนี้อนุมัติไม่ได้แล้ว', 409)
  const v = await prepareApprove(db, a, t)
  await db.update(makeupExams).set(v).where(eq(makeupExams.id, id))
  await notifyApproved(db, r, a, t)
  return { code: v.code }
}

/** ครูให้สิทธิ์เอง: นักเรียนยังไม่ได้ขอ · ขยายเวลา · คืนสิทธิ์หลังได้ 0 (คำขอเก่าที่ยังเปิดถูกปิดเป็นหมดสิทธิ์) */
export async function grantMakeup(db: Db, p: MakeupApprove & { scoreItemId: string; studentId: string }, t: number): Promise<{ id: string; code: string }> {
  const item = await itemOf(db, p.scoreItemId)
  const [st] = await db.select({ classId: students.classId }).from(students).where(eq(students.id, p.studentId))
  if (!st || st.classId !== item.classId) throw apiError('student_not_found', 'ไม่พบนักเรียนในห้องนี้', 404)
  await db
    .update(makeupExams)
    .set({ status: 'expired', updatedAt: t })
    .where(and(eq(makeupExams.scoreItemId, item.id), eq(makeupExams.studentId, p.studentId), inArray(makeupExams.status, ['pending', 'approved'])))
  const v = await prepareApprove(db, p, t)
  const id = newId()
  await db.insert(makeupExams).values({ id, scoreItemId: item.id, studentId: p.studentId, reason: 'ครูให้สิทธิ์สอบ', ...v, createdAt: t })
  await notifyApproved(db, { id, studentId: p.studentId, scoreItemId: item.id }, p, t)
  return { id, code: v.code }
}

export async function rejectMakeup(db: Db, id: string, note: string, t: number): Promise<void> {
  const r = await getExam(db, id)
  if (r.status !== 'pending' && r.status !== 'approved') throw apiError('makeup_state', 'คำขอนี้ปฏิเสธไม่ได้แล้ว', 409)
  await db.update(makeupExams).set({ status: 'rejected', teacherNote: note, updatedAt: t }).where(eq(makeupExams.id, id))
  const item = await itemOf(db, r.scoreItemId)
  await enqueue(db, [{ studentId: r.studentId, title: `❌ ครูไม่อนุมัติสอบย้อนหลัง: ${item.title}`, body: note, url: '/me/scores', dedupeKey: `mkno:${id}` }], t)
}

/** ครูบันทึกคะแนน → ลงช่องสอบเดิม (ไม่ขาดสอบแล้ว) · ไม่เกินคะแนนเต็ม */
export async function gradeMakeupExam(db: Db, id: string, score: number, note: string, t: number): Promise<void> {
  const r = await getExam(db, id)
  if (!['approved', 'in_progress', 'submitted', 'graded'].includes(r.status)) throw apiError('makeup_state', 'ยังให้คะแนนไม่ได้', 409)
  if (r.status === 'in_progress') await finish(db, r, 'submit', t)
  const item = await itemOf(db, r.scoreItemId)
  if (score > item.maxScore) throw apiError('invalid_score', `คะแนนต้องไม่เกิน ${item.maxScore}`, 400)
  await saveScore(db, item.id, r.studentId, { score, absent: false, note: note ? `สอบย้อนหลัง · ${note}` : 'สอบย้อนหลัง' }, t)
  await db.update(makeupExams).set({ status: 'graded', finalScore: score, teacherNote: note, updatedAt: t }).where(eq(makeupExams.id, id))
  await enqueue(db, [{ studentId: r.studentId, title: `📊 ครูให้คะแนนสอบย้อนหลังแล้ว: ${item.title}`, url: '/me/scores', dedupeKey: `mkgr:${id}:${t}` }], t)
}

const rowCols = {
  id: makeupExams.id,
  status: makeupExams.status,
  reason: makeupExams.reason,
  imageKey: makeupExams.imageKey,
  mode: makeupExams.mode,
  opensAt: makeupExams.opensAt,
  closesAt: makeupExams.closesAt,
  durationMin: makeupExams.durationMin,
  capPct: makeupExams.capPct,
  examSetId: makeupExams.examSetId,
  code: makeupExams.code,
  startedAt: makeupExams.startedAt,
  submittedAt: makeupExams.submittedAt,
  leaves: makeupExams.leaves,
  autoScore: makeupExams.autoScore,
  finalScore: makeupExams.finalScore,
  teacherNote: makeupExams.teacherNote,
  createdAt: makeupExams.createdAt,
  studentId: students.id,
  zipgradeId: students.zipgradeId,
  sTitle: students.title,
  firstName: students.firstName,
  lastName: students.lastName,
  className: classes.name,
  itemId: scoreItems.id,
  itemTitle: scoreItems.title,
  maxScore: scoreItems.maxScore,
  takenOn: scoreItems.takenOn,
  makeupDays: scoreItems.makeupDays,
  itemExamSetId: scoreItems.examSetId,
}
type JoinedRow = Awaited<ReturnType<ReturnType<typeof joined>['execute']>>[number]
function toRow(r: JoinedRow): TeacherMakeupRow {
  return {
    id: r.id!,
    status: r.status as MakeupStatus,
    student: { id: r.studentId!, name: fullName({ title: r.sTitle as string | null, firstName: r.firstName!, lastName: r.lastName! }), zipgradeId: r.zipgradeId! },
    className: r.className!,
    item: { id: r.itemId!, title: r.itemTitle!, maxScore: r.maxScore!, takenOn: r.takenOn!, examSetId: r.itemExamSetId as string | null },
    deadline: makeupDeadline(r.takenOn!, r.makeupDays!),
    reason: r.reason!,
    imageKey: r.imageKey as string | null,
    mode: r.mode as 'online' | 'paper' | null,
    opensAt: r.opensAt as number | null,
    closesAt: r.closesAt as number | null,
    durationMin: r.durationMin as number | null,
    capPct: r.capPct!,
    examSetId: r.examSetId as string | null,
    code: r.code as string | null,
    startedAt: r.startedAt as number | null,
    submittedAt: r.submittedAt as number | null,
    leaves: r.leaves!,
    autoScore: r.autoScore as number | null,
    finalScore: r.finalScore as number | null,
    teacherNote: r.teacherNote!,
    createdAt: r.createdAt!,
  }
}
const joined = (db: Db) =>
  db
    .select(rowCols)
    .from(makeupExams)
    .innerJoin(students, eq(students.id, makeupExams.studentId))
    .innerJoin(scoreItems, eq(scoreItems.id, makeupExams.scoreItemId))
    .innerJoin(classes, eq(classes.id, scoreItems.classId))

export async function teacherMakeups(db: Db, t: number): Promise<TeacherMakeups> {
  await sweepMakeups(db, t)
  const all = (await joined(db).orderBy(desc(makeupExams.updatedAt)).limit(300)).map((r) => toRow(r))
  const { start } = await termWindow(db)
  // ขาดสอบ · ได้ 0 เพราะหมดสิทธิ์ · ยังไม่มีคะแนน (เฉพาะรายการที่เผยแพร่แล้ว)
  const absentRows = await db.all<{ studentId: string; zipgradeId: string; title: string | null; firstName: string; lastName: string; className: string; itemId: string; itemTitle: string; maxScore: number; takenOn: string; makeupDays: number; examSetId: string | null; absent: number | null; score: number | null }>(sql`
    SELECT st.id AS studentId, st.zipgrade_id AS zipgradeId, st.title, st.first_name AS firstName, st.last_name AS lastName, c.name AS className,
      i.id AS itemId, i.title AS itemTitle, i.max_score AS maxScore, i.taken_on AS takenOn, i.makeup_days AS makeupDays, i.exam_set_id AS examSetId, s.absent, s.score
    FROM score_items i JOIN classes c ON c.id = i.class_id JOIN students st ON st.class_id = i.class_id
      LEFT JOIN scores s ON s.item_id = i.id AND s.student_id = st.id
    WHERE st.active = 1 AND c.archived = 0 AND i.created_at >= ${start} AND i.makeup_days > 0
      AND (s.absent = 1 OR s.note = ${EXPIRED_NOTE} OR (i.published = 1 AND s.score IS NULL))
      AND NOT EXISTS (SELECT 1 FROM makeup_exams m WHERE m.score_item_id = i.id AND m.student_id = st.id AND m.status IN ('pending', 'approved', 'in_progress', 'submitted', 'graded'))
    ORDER BY i.taken_on DESC, st.sort_order`)
  return {
    pending: all.filter((r) => r.status === 'pending'),
    active: all.filter((r) => r.status === 'approved' || r.status === 'in_progress'),
    toReview: all.filter((r) => r.status === 'submitted'),
    recent: all.filter((r) => ['graded', 'rejected', 'expired'].includes(r.status)).slice(0, 40),
    absent: absentRows.map((r) => ({
      student: { id: r.studentId, name: fullName(r), zipgradeId: r.zipgradeId },
      className: r.className,
      item: { id: r.itemId, title: r.itemTitle, maxScore: r.maxScore, takenOn: r.takenOn, examSetId: r.examSetId },
      deadline: makeupDeadline(r.takenOn, r.makeupDays),
      zeroed: !r.absent && r.score !== null,
      blank: !r.absent && r.score === null,
    })),
  }
}

export async function pendingMakeupCount(db: Db): Promise<number> {
  const [r] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM makeup_exams WHERE status IN ('pending', 'submitted')`)
  return r.n
}

export async function teacherMakeupDetail(db: Db, id: string, t: number): Promise<TeacherMakeupDetail> {
  await sweepMakeups(db, t)
  const [r] = await joined(db).where(eq(makeupExams.id, id))
  if (!r) throw notFound()
  const row = toRow(r)
  const full = await getExam(db, id)
  const set = full.examSetId ? await getExamSet(db, full.examSetId) : null
  const key = set ? answerKey(set) : []
  const events = await db.select({ at: makeupEvents.at, kind: makeupEvents.kind, ms: makeupEvents.ms }).from(makeupEvents).where(eq(makeupEvents.examId, id)).orderBy(makeupEvents.at)
  return {
    ...row,
    examSet: set,
    key,
    answers: full.answers,
    graded: set && full.startedAt ? gradeMakeup(full.answers, key, row.item.maxScore, row.capPct) : null,
    events,
  }
}

// ---------- ฝั่งนักเรียน: สอบออนไลน์ ----------
async function mine(db: Db, id: string, studentId: string): Promise<Row> {
  const r = await getExam(db, id)
  if (r.studentId !== studentId) throw notFound()
  return r
}
const endsAt = (r: Pick<Row, 'startedAt' | 'durationMin'>) => (r.startedAt ?? 0) + (r.durationMin ?? 0) * 60_000
async function event(db: Db, examId: string, kind: (typeof makeupEvents.$inferInsert)['kind'], t: number, ms?: number) {
  await db.insert(makeupEvents).values({ id: newId(), examId, at: t, kind, ms: ms ?? null })
}

/** ส่ง (เอง/อัตโนมัติ/หมดเวลา) → ตรวจที่เซิร์ฟเวอร์ · แจ้งครู */
async function finish(db: Db, r: Row, kind: 'submit' | 'auto-submit' | 'timeout', t: number): Promise<void> {
  const res = await db
    .update(makeupExams)
    .set({ status: 'submitted', submittedAt: t, updatedAt: t })
    .where(and(eq(makeupExams.id, r.id), eq(makeupExams.status, 'in_progress')))
    .returning({ id: makeupExams.id })
  if (!res.length) return
  const item = await itemOf(db, r.scoreItemId)
  if (r.examSetId) {
    const set = await getExamSet(db, r.examSetId)
    const g = gradeMakeup(r.answers, answerKey(set), item.maxScore, r.capPct)
    await db.update(makeupExams).set({ autoScore: g.capped }).where(eq(makeupExams.id, r.id))
  }
  await event(db, r.id, kind, t)
  const [st] = await db.select().from(students).where(eq(students.id, r.studentId))
  await notifyTeacher(db, { kind: 'makeup', title: `📝 ส่งสอบย้อนหลัง: ${st ? fullName(st) : ''} · ${item.title}${r.leaves ? ` · ออกจากหน้าจอ ${r.leaves} ครั้ง` : ''}`, url: `/teacher/makeup-exams/${r.id}`, dedupeKey: `mksub:${r.id}` }, t)
}

async function paper(db: Db, r: Row, t: number): Promise<StudentExamPaper> {
  const set = await getExamSet(db, r.examSetId!)
  const item = await itemOf(db, r.scoreItemId)
  const [st] = await db.select().from(students).where(eq(students.id, r.studentId))
  const layout = examLayout(set.kind === 'typed' ? set.questions : set.answers.map(() => ({ choices: Array.from({ length: set.choiceCount }, () => '') })), r.seed)
  // คำตอบที่บันทึก (ลำดับต้นฉบับ) → ลำดับที่นักเรียนเห็น
  const shown = layout.order.map((qi, pos) => {
    const a = r.answers[qi] ?? -1
    return a < 0 ? -1 : layout.choices[pos].indexOf(a)
  })
  return {
    id: r.id,
    title: item.title,
    studentName: st ? fullName(st) : '',
    zipgradeId: st?.zipgradeId ?? '',
    kind: set.kind,
    questions: set.kind === 'typed' ? layout.order.map((qi, pos) => ({ q: set.questions[qi].q, ...(set.questions[qi].image ? { image: set.questions[qi].image } : {}), choices: layout.choices[pos].map((ci) => set.questions[qi].choices[ci]) })) : [],
    pageKeys: set.kind === 'pages' ? set.pageKeys : [],
    count: layout.order.length,
    choiceCount: set.choiceCount,
    answers: shown,
    endsAt: endsAt(r),
    leaves: r.leaves,
    leaveLimit: MAKEUP_LEAVE_LIMIT,
    status: r.status,
  }
}

export async function startMakeup(db: Db, id: string, studentId: string, code: string, deviceId: string, t: number): Promise<StudentExamPaper> {
  const r = await mine(db, id, studentId)
  if (r.status === 'in_progress') {
    if (r.deviceId !== deviceId) {
      await event(db, id, 'device', t)
      throw apiError('other_device', 'เริ่มสอบที่เครื่องอื่นไปแล้ว — สอบต่อได้เฉพาะเครื่องเดิม (ครูเห็นว่ามีการเปิดจากเครื่องอื่น)', 403)
    }
    return paper(db, r, t)
  }
  if (r.status !== 'approved' || r.mode !== 'online') throw apiError('makeup_state', 'ยังเริ่มสอบไม่ได้', 409)
  if (t < (r.opensAt ?? 0)) throw apiError('not_open', 'ยังไม่ถึงเวลาสอบ', 409)
  if (t > (r.closesAt ?? 0)) throw apiError('makeup_expired', 'เลยเวลาเริ่มสอบแล้ว', 409)
  if (code !== r.code) throw apiError('wrong_code', 'รหัสเริ่มสอบไม่ถูกต้อง — ขอรหัสจากครู', 400)
  const set = await getExamSet(db, r.examSetId!)
  const n = set.kind === 'typed' ? set.questions.length : set.answers.length
  const res = await db
    .update(makeupExams)
    .set({ status: 'in_progress', startedAt: t, deviceId, answers: Array.from({ length: n }, () => -1), updatedAt: t })
    .where(and(eq(makeupExams.id, id), eq(makeupExams.status, 'approved')))
    .returning({ id: makeupExams.id })
  if (!res.length) throw apiError('makeup_state', 'เริ่มสอบไปแล้ว', 409)
  await event(db, id, 'start', t)
  return paper(db, await getExam(db, id), t)
}

/** โหลดข้อสอบที่กำลังทำ (เครื่องเดิมเท่านั้น) · หมดเวลาแล้วส่งให้ */
export async function resumeMakeup(db: Db, id: string, studentId: string, deviceId: string, t: number): Promise<StudentExamPaper> {
  let r = await mine(db, id, studentId)
  if (r.status === 'in_progress' && t > endsAt(r) + ANSWER_GRACE_MS) {
    await finish(db, r, 'timeout', t)
    r = await getExam(db, id)
  }
  if (r.status !== 'in_progress') throw apiError('makeup_state', r.status === 'submitted' || r.status === 'graded' ? 'ส่งคำตอบแล้ว' : 'ยังไม่ได้เริ่มสอบ', 409)
  if (r.deviceId !== deviceId) {
    await event(db, id, 'device', t)
    throw apiError('other_device', 'สอบต่อได้เฉพาะเครื่องที่เริ่มสอบ (ครูเห็นว่ามีการเปิดจากเครื่องอื่น)', 403)
  }
  return paper(db, r, t)
}

async function active(db: Db, id: string, studentId: string, deviceId: string, t: number): Promise<Row> {
  const r = await mine(db, id, studentId)
  if (r.status !== 'in_progress') throw apiError('makeup_state', 'ส่งคำตอบแล้ว', 409)
  if (r.deviceId !== deviceId) {
    await event(db, id, 'device', t)
    throw apiError('other_device', 'สอบต่อได้เฉพาะเครื่องที่เริ่มสอบ', 403)
  }
  if (t > endsAt(r) + ANSWER_GRACE_MS) {
    await finish(db, r, 'timeout', t)
    throw apiError('time_up', 'หมดเวลาแล้ว ระบบส่งคำตอบที่บันทึกไว้ให้', 409)
  }
  return r
}

/** บันทึกคำตอบ (ลำดับที่นักเรียนเห็น → ลำดับต้นฉบับ) */
export async function saveMakeupAnswers(db: Db, id: string, studentId: string, deviceId: string, shown: number[], t: number): Promise<void> {
  const r = await active(db, id, studentId, deviceId, t)
  const set = await getExamSet(db, r.examSetId!)
  const layout = examLayout(set.kind === 'typed' ? set.questions : set.answers.map(() => ({ choices: Array.from({ length: set.choiceCount }, () => '') })), r.seed)
  if (shown.length !== layout.order.length) throw apiError('invalid_answers', 'จำนวนข้อไม่ตรง', 400)
  const answers = [...r.answers]
  layout.order.forEach((qi, pos) => {
    const a = shown[pos]
    answers[qi] = a < 0 || a >= layout.choices[pos].length ? -1 : layout.choices[pos][a]
  })
  await db.update(makeupExams).set({ answers, updatedAt: t }).where(eq(makeupExams.id, id))
}

/** ออกจากหน้าจอ/กลับมา · ครบ 3 ครั้งส่งอัตโนมัติ */
export async function makeupEvent(db: Db, id: string, studentId: string, deviceId: string, kind: 'leave' | 'return', ms: number | undefined, t: number): Promise<{ leaves: number; submitted: boolean }> {
  const r = await active(db, id, studentId, deviceId, t)
  await event(db, id, kind, t, ms)
  if (kind === 'return') return { leaves: r.leaves, submitted: false }
  const leaves = r.leaves + 1
  await db.update(makeupExams).set({ leaves, updatedAt: t }).where(eq(makeupExams.id, id))
  if (leaves >= MAKEUP_LEAVE_LIMIT) {
    await finish(db, { ...r, leaves }, 'auto-submit', t)
    return { leaves, submitted: true }
  }
  return { leaves, submitted: false }
}

export async function submitMakeup(db: Db, id: string, studentId: string, deviceId: string, t: number): Promise<void> {
  const r = await active(db, id, studentId, deviceId, t)
  await finish(db, r, 'submit', t)
}

// ---------- ทำงานตามเวลา (cron + ตอนเปิดหน้า) ----------
/**
 * - กำลังสอบแต่หมดเวลา → ส่งให้
 * - อนุมัติแล้วแต่ไม่ได้เริ่มจนเลยเวลาปิด → หมดสิทธิ์ · คำขอที่ค้างจนเลยกำหนด → หมดสิทธิ์
 * - ขาดสอบ เลยกำหนด และไม่มีคำขอที่ยังเปิด → ได้ 0 (หมายเหตุ "หมดสิทธิ์สอบย้อนหลัง")
 */
export async function sweepMakeups(db: Db, t: number): Promise<{ submitted: number; expired: number; zeroed: number }> {
  const running = await db.select().from(makeupExams).where(and(eq(makeupExams.status, 'in_progress'), lt(makeupExams.startedAt, t)))
  let submitted = 0
  for (const r of running)
    if (t > endsAt(r) + ANSWER_GRACE_MS) {
      await finish(db, r, 'timeout', t)
      submitted++
    }
  const exp1 = await db
    .update(makeupExams)
    .set({ status: 'expired', updatedAt: t })
    .where(and(eq(makeupExams.status, 'approved'), lt(makeupExams.closesAt, t)))
    .returning({ id: makeupExams.id })
  const exp2 = await db.run(sql`
    UPDATE makeup_exams SET status = 'expired', updated_at = ${t}
    WHERE status = 'pending' AND EXISTS (SELECT 1 FROM score_items i WHERE i.id = makeup_exams.score_item_id AND i.makeup_days > 0
      AND ${t} > (unixepoch(i.taken_on || ' 23:59:59') - 7 * 3600 + i.makeup_days * 86400) * 1000)`)
  // ขาดสอบที่หมดกำหนดแล้ว → 0
  const zero = await db.run(sql`
    UPDATE scores SET score = 0, absent = 0, note = ${EXPIRED_NOTE}, updated_at = ${t}
    WHERE absent = 1 AND EXISTS (SELECT 1 FROM score_items i WHERE i.id = scores.item_id AND i.makeup_days > 0
      AND ${t} > (unixepoch(i.taken_on || ' 23:59:59') - 7 * 3600 + i.makeup_days * 86400) * 1000)
      AND NOT EXISTS (SELECT 1 FROM makeup_exams m WHERE m.score_item_id = scores.item_id AND m.student_id = scores.student_id AND m.status IN ('approved', 'in_progress', 'submitted'))`)
  return { submitted, expired: exp1.length + (exp2.meta.changes ?? 0), zeroed: zero.meta.changes ?? 0 }
}

/** เตือนนักเรียนที่ขาดสอบและยังไม่ได้ขอ: เหลือ 3 วัน และ 1 วัน */
export async function remindMakeupDeadlines(db: Db, t: number): Promise<number> {
  const rows = await db.all<{ studentId: string; itemId: string; title: string; deadline: number }>(sql`
    SELECT s.student_id AS studentId, i.id AS itemId, i.title, (unixepoch(i.taken_on || ' 23:59:59') - 7 * 3600 + i.makeup_days * 86400) * 1000 AS deadline
    FROM scores s JOIN score_items i ON i.id = s.item_id JOIN students st ON st.id = s.student_id
    WHERE s.absent = 1 AND i.published = 1 AND i.makeup_days > 0 AND st.active = 1
      AND NOT EXISTS (SELECT 1 FROM makeup_exams m WHERE m.score_item_id = i.id AND m.student_id = s.student_id AND m.status IN ('pending', 'approved', 'in_progress', 'submitted', 'graded'))`)
  const out: { studentId: string; title: string; body: string; url: string; dedupeKey: string }[] = []
  for (const r of rows) {
    const left = r.deadline - t
    for (const d of [1, 3])
      if (left > 0 && left <= d * 86400_000 && left > (d === 3 ? 1 : 0) * 86400_000)
        out.push({ studentId: r.studentId, title: `⏰ สอบย้อนหลัง “${r.title}” เหลืออีก ${d} วัน`, body: 'หมดเวลาแล้วจะได้ 0 — ขอสอบย้อนหลังในหน้าคะแนนสอบ', url: '/me/scores', dedupeKey: `mkdl:${r.itemId}:${r.studentId}:${d}` })
  }
  if (out.length) await enqueue(db, out, t)
  return out.length
}
