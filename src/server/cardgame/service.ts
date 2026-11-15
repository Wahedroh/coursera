import { and, desc, eq, gt, isNull, like, sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { CARD_EXP, DEVICE_GAME_WINDOW_MS, TIME_GRACE_MS, type CardGameResult, type CardGameState, type CardQuizInput, type CardQuizSummary, type StudentActiveGame, type StudentCardGame } from '../../shared/cardgame'
import { newId, type Db } from '../db/client'
import { attendanceDays, cardAnswers, cardGames, cardQuizzes, classes, pointEvents, scoreItems, scores, studentAvatars, students } from '../db/schema'
import { apiError } from '../http'
import { openDay, setStatuses } from '../attendance/service'

const quizNotFound = () => apiError('quiz_not_found', 'ไม่พบชุดคำถามนี้', 404)
const gameNotFound = () => apiError('game_not_found', 'ไม่พบเกมนี้', 404)

// ---------- ชุดคำถาม ----------
export async function listQuizzes(db: Db): Promise<CardQuizSummary[]> {
  const rows = await db.select().from(cardQuizzes).orderBy(desc(cardQuizzes.updatedAt))
  return rows.map((r) => ({ id: r.id, title: r.title, count: r.questions.length, updatedAt: r.updatedAt }))
}
export async function getQuiz(db: Db, id: string) {
  const [q] = await db.select().from(cardQuizzes).where(eq(cardQuizzes.id, id))
  if (!q) throw quizNotFound()
  return q
}
export async function createQuiz(db: Db, input: CardQuizInput, t: number): Promise<string> {
  const id = newId()
  await db.insert(cardQuizzes).values({ id, ...input, createdAt: t, updatedAt: t })
  return id
}
export async function updateQuiz(db: Db, id: string, input: CardQuizInput, t: number): Promise<void> {
  const res = await db.update(cardQuizzes).set({ ...input, updatedAt: t }).where(eq(cardQuizzes.id, id)).returning({ id: cardQuizzes.id })
  if (!res.length) throw quizNotFound()
}
/** ลบชุดคำถาม — เกมที่เคยเล่นไปแล้วยังเก็บผลไว้ จึงลบได้เฉพาะชุดที่ยังไม่เคยเล่น */
export async function deleteQuiz(db: Db, id: string): Promise<void> {
  await getQuiz(db, id)
  const [used] = await db.select({ id: cardGames.id }).from(cardGames).where(eq(cardGames.quizId, id)).limit(1)
  if (used) throw apiError('quiz_used', 'ชุดคำถามนี้เคยใช้เล่นแล้ว ลบไม่ได้ (แก้ไขได้)', 409)
  await db.delete(cardQuizzes).where(eq(cardQuizzes.id, id))
}

// ---------- เกม ----------
async function roster(db: Db, classId: string) {
  const rows = await db
    .select({ id: students.id, zipgradeId: students.zipgradeId, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  return rows.map((r, i) => ({ id: r.id, no: i + 1, zipgradeId: r.zipgradeId, name: `${r.firstName} ${r.lastName}`.trim() }))
}

/** การ์ดของห้อง (สำหรับพิมพ์) */
export async function classCards(db: Db, classId: string) {
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId))
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  return { class: cls, students: await roster(db, classId) }
}

export async function startGame(db: Db, quizId: string, classId: string, t: number): Promise<string> {
  const quiz = await getQuiz(db, quizId)
  const [cls] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId))
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const id = newId()
  await db.insert(cardGames).values({ id, quizId, classId, questions: quiz.questions, questionStartedAt: t, createdAt: t })
  return id
}

/** เวลาเหลือของข้อปัจจุบัน (ms) · null = ไม่จำกัด */
function remainingMs(g: { questions: { seconds?: number }[]; current: number; questionStartedAt: number | null }, t: number): number | null {
  const sec = g.questions[g.current]?.seconds ?? 0
  if (!sec) return null
  return Math.max(0, (g.questionStartedAt ?? t) + sec * 1000 - t)
}

async function getGame(db: Db, id: string) {
  const [g] = await db.select().from(cardGames).where(eq(cardGames.id, id))
  if (!g) throw gameNotFound()
  return g
}

export async function gameState(db: Db, id: string, t = Date.now()): Promise<CardGameState> {
  const g = await getGame(db, id)
  const [quiz] = await db.select({ title: cardQuizzes.title }).from(cardQuizzes).where(eq(cardQuizzes.id, g.quizId))
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, g.classId))
  const ans = await db
    .select({ studentId: cardAnswers.studentId, answer: cardAnswers.answer, via: cardAnswers.via })
    .from(cardAnswers)
    .where(and(eq(cardAnswers.gameId, id), eq(cardAnswers.qIndex, g.current)))
  return {
    id,
    quizTitle: quiz?.title ?? '',
    class: cls,
    questions: g.questions,
    current: g.current,
    remainingMs: remainingMs(g, t),
    revealed: g.revealed,
    ended: g.endedAt !== null,
    roster: (await roster(db, g.classId)).map(({ id, no, zipgradeId, name }) => ({ id, no, zipgradeId, name })),
    answers: Object.fromEntries(ans.map((a) => [a.studentId, a.answer])),
    devices: ans.filter((a) => a.via === 'device').map((a) => a.studentId),
  }
}

/** ยังรับคำตอบของข้อปัจจุบันไหม: ยังไม่เฉลย ยังไม่จบ และยังไม่หมดเวลา (เผื่อเวลาส่ง 2 วินาที) */
function accepting(g: { endedAt: number | null; revealed: boolean; questions: { seconds?: number }[]; current: number; questionStartedAt: number | null }, t: number): boolean {
  if (g.endedAt !== null || g.revealed) return false
  const sec = g.questions[g.current]?.seconds ?? 0
  return !sec || t <= (g.questionStartedAt ?? 0) + sec * 1000 + TIME_GRACE_MS
}

/** บันทึกคำตอบที่สแกนได้ของข้อปัจจุบัน — สแกนซ้ำทับคำตอบเดิม · หลังเฉลย/จบเกมไม่รับ · การ์ดที่ไม่ใช่ของห้องนี้ข้ามไป */
export async function recordScans(db: Db, id: string, qIndex: number, scans: { zipgradeId: string; answer: number }[], t: number) {
  const g = await getGame(db, id)
  if (g.endedAt !== null) throw apiError('game_ended', 'เกมจบแล้ว', 409)
  if (qIndex !== g.current || !accepting(g, t)) return { accepted: 0, unknown: [] as string[], locked: true }
  const nQ = g.questions[g.current].choices.length
  const rows = await roster(db, g.classId)
  // การ์ดพิมพ์ ID เป็นตัวพิมพ์ใหญ่ (โหมด QR ที่อ่านได้ไกล) → เทียบแบบไม่สนตัวพิมพ์
  const byZip = new Map(rows.map((r) => [r.zipgradeId.toUpperCase(), r.id]))
  const unknown: string[] = []
  const values: { gameId: string; qIndex: number; studentId: string; answer: number; scannedAt: number }[] = []
  for (const s of scans) {
    const sid = byZip.get(s.zipgradeId.toUpperCase())
    if (!sid) unknown.push(s.zipgradeId)
    // ข้อที่มี 2–3 ตัวเลือก: ด้านที่ไม่มีตัวเลือกไม่นับ
    else if (s.answer < nQ) values.push({ gameId: id, qIndex, studentId: sid, answer: s.answer, scannedAt: t })
  }
  for (let i = 0; i < values.length; i += 15)
    await db
      .insert(cardAnswers)
      .values(values.slice(i, i + 15))
      // คนที่ตอบในเครื่องตัวเองแล้ว: การสแกนการ์ดไม่ทับคำตอบ
      .onConflictDoUpdate({ target: [cardAnswers.gameId, cardAnswers.qIndex, cardAnswers.studentId], set: { answer: sql`excluded.answer`, scannedAt: t }, setWhere: sql`${cardAnswers.via} = 'card'` })
  return { accepted: values.length, unknown: [...new Set(unknown)], locked: false }
}

// ---------- นักเรียนตอบในเครื่องตัวเอง ----------
/** เกมที่กำลังเล่นของห้องนี้ (ล่าสุด · ยังไม่จบ · เริ่มภายใน 3 ชั่วโมง) */
export async function activeGameFor(db: Db, classId: string, t: number): Promise<StudentActiveGame> {
  const [g] = await db
    .select({ id: cardGames.id, quizTitle: cardQuizzes.title })
    .from(cardGames)
    .innerJoin(cardQuizzes, eq(cardQuizzes.id, cardGames.quizId))
    .where(and(eq(cardGames.classId, classId), isNull(cardGames.endedAt), gt(cardGames.createdAt, t - DEVICE_GAME_WINDOW_MS)))
    .orderBy(desc(cardGames.createdAt))
    .limit(1)
  return g ?? null
}

async function gameOfClass(db: Db, id: string, classId: string) {
  const g = await getGame(db, id)
  if (g.classId !== classId) throw gameNotFound()
  return g
}

export async function studentGameView(db: Db, id: string, me: { studentId: string; classId: string }, t: number): Promise<StudentCardGame> {
  const g = await gameOfClass(db, id, me.classId)
  const [quiz] = await db.select({ title: cardQuizzes.title }).from(cardQuizzes).where(eq(cardQuizzes.id, g.quizId))
  const mine = await db.select({ qIndex: cardAnswers.qIndex, answer: cardAnswers.answer }).from(cardAnswers).where(and(eq(cardAnswers.gameId, id), eq(cardAnswers.studentId, me.studentId)))
  const q = g.questions[g.current]
  const ended = g.endedAt !== null
  const correct = mine.filter((a) => g.questions[a.qIndex]?.answer === a.answer).length
  return {
    id,
    quizTitle: quiz?.title ?? '',
    total: g.questions.length,
    current: g.current,
    question: { q: q.q, ...(q.image ? { image: q.image } : {}), choices: q.choices },
    remainingMs: ended || g.revealed ? null : remainingMs(g, t),
    revealed: g.revealed || ended,
    correct: g.revealed || ended ? q.answer : null,
    mine: mine.find((a) => a.qIndex === g.current)?.answer ?? null,
    ended,
    summary: ended ? { correct, answered: mine.length, exp: mine.length ? CARD_EXP.join + correct * CARD_EXP.correct : 0 } : null,
  }
}

/** นักเรียนกดตอบในเครื่อง: เฉพาะข้อปัจจุบัน ก่อนเฉลย/หมดเวลา · เปลี่ยนคำตอบได้ · ทับคำตอบจากการ์ด */
export async function answerOnDevice(db: Db, id: string, me: { studentId: string; classId: string }, qIndex: number, answer: number, t: number): Promise<{ ok: boolean }> {
  const g = await gameOfClass(db, id, me.classId)
  if (g.endedAt !== null) throw apiError('game_ended', 'เกมจบแล้ว', 409)
  if (qIndex !== g.current || !accepting(g, t)) throw apiError('answer_locked', 'ข้อนี้ปิดรับคำตอบแล้ว', 409)
  if (answer >= g.questions[g.current].choices.length) throw apiError('invalid_answer', 'ไม่มีตัวเลือกนี้', 400)
  const [s] = await db.select({ active: students.active }).from(students).where(eq(students.id, me.studentId))
  if (!s?.active) throw apiError('not_in_class', 'ไม่พบชื่อในห้องนี้', 403)
  await db
    .insert(cardAnswers)
    .values({ gameId: id, qIndex, studentId: me.studentId, answer, scannedAt: t, via: 'device' })
    .onConflictDoUpdate({ target: [cardAnswers.gameId, cardAnswers.qIndex, cardAnswers.studentId], set: { answer, scannedAt: t, via: 'device' } })
  return { ok: true }
}

export async function reveal(db: Db, id: string): Promise<void> {
  const g = await getGame(db, id)
  if (g.endedAt !== null) throw apiError('game_ended', 'เกมจบแล้ว', 409)
  await db.update(cardGames).set({ revealed: true }).where(eq(cardGames.id, id))
}

export async function goTo(db: Db, id: string, index: number): Promise<void> {
  const g = await getGame(db, id)
  if (g.endedAt !== null) throw apiError('game_ended', 'เกมจบแล้ว', 409)
  if (index < 0 || index >= g.questions.length) throw apiError('invalid_question', 'ไม่มีข้อนี้', 400)
  // ย้อนกลับไปข้อที่เฉลยแล้ว = ยังล็อกอยู่ · ไปข้อใหม่ = ยังไม่เฉลย
  const [any] = await db.select({ n: sql<number>`count(*)` }).from(cardAnswers).where(and(eq(cardAnswers.gameId, id), eq(cardAnswers.qIndex, index)))
  await db.update(cardGames).set({ current: index, revealed: index < g.current && any.n > 0, questionStartedAt: Date.now() }).where(eq(cardGames.id, id))
}

export async function gameResult(db: Db, id: string): Promise<CardGameResult> {
  const g = await getGame(db, id)
  const rows = await roster(db, g.classId)
  const ans = await db.select().from(cardAnswers).where(eq(cardAnswers.gameId, id))
  const avatars = new Map(
    (await db.select({ id: studentAvatars.studentId, config: studentAvatars.config }).from(studentAvatars).innerJoin(students, eq(students.id, studentAvatars.studentId)).where(eq(students.classId, g.classId))).map(
      (a) => [a.id, a.config],
    ),
  )
  const perQuestion = g.questions.map((q, i) => {
    const xs = ans.filter((a) => a.qIndex === i)
    const counts = q.choices.map((_, k) => xs.filter((a) => a.answer === k).length)
    return { counts, correct: counts[q.answer] ?? 0, answered: xs.length }
  })
  const players = rows.map((r) => {
    const mine = ans.filter((a) => a.studentId === r.id)
    const correct = mine.filter((a) => g.questions[a.qIndex]?.answer === a.answer).length
    return { id: r.id, no: r.no, name: r.name, correct, answered: mine.length, exp: mine.length ? CARD_EXP.join + correct * CARD_EXP.correct : 0, avatar: avatars.get(r.id) ?? null }
  })
  players.sort((a, b) => b.correct - a.correct || b.answered - a.answered || a.no - b.no)
  return { total: g.questions.length, players, perQuestion }
}

/** จบเกม: ให้ EXP (ครั้งเดียว) · บันทึกเป็นคะแนนเก็บ · นับเป็นการเช็กชื่อวันนี้ (เลือกได้) */
export async function endGame(db: Db, id: string, opts: { saveScore: boolean; attendance: boolean }, t: number): Promise<CardGameResult> {
  const g = await getGame(db, id)
  if (g.endedAt !== null) throw apiError('game_ended', 'เกมจบแล้ว', 409)
  const claimed = await db.update(cardGames).set({ endedAt: t, revealed: true }).where(and(eq(cardGames.id, id), sql`${cardGames.endedAt} IS NULL`)).returning({ id: cardGames.id })
  if (!claimed.length) throw apiError('game_ended', 'เกมจบแล้ว', 409)
  const res = await gameResult(db, id)
  const [quiz] = await db.select({ title: cardQuizzes.title }).from(cardQuizzes).where(eq(cardQuizzes.id, g.quizId))
  const title = `เกมการ์ด: ${quiz?.title ?? ''}`.trim()
  const played = res.players.filter((p) => p.answered > 0)
  const ev = played.map((p) => ({ id: newId(), studentId: p.id, delta: p.exp, reason: `${title} (ถูก ${p.correct}/${res.total})`, source: 'live' as const, refId: `card:${id}:${p.id}`, createdAt: t }))
  for (let i = 0; i < ev.length; i += 10) await db.insert(pointEvents).values(ev.slice(i, i + 10)).onConflictDoNothing()

  let scoreItemId: string | null = null
  if (opts.saveScore) {
    scoreItemId = newId()
    await db.insert(scoreItems).values({ id: scoreItemId, classId: g.classId, title, category: 'other', maxScore: res.total, takenOn: todayBangkok(t), createdAt: t, updatedAt: t })
    const vals = res.players.map((p) => ({ id: newId(), itemId: scoreItemId!, studentId: p.id, score: p.answered ? p.correct : null, absent: p.answered === 0, note: '', updatedAt: t }))
    for (let i = 0; i < vals.length; i += 10) await db.insert(scores).values(vals.slice(i, i + 10))
    await db.update(cardGames).set({ scoreItemId }).where(eq(cardGames.id, id))
  }
  let attendanceDate: string | null = null
  if (opts.attendance) {
    attendanceDate = todayBangkok(t)
    const [existing] = await db.select({ id: attendanceDays.id }).from(attendanceDays).where(and(eq(attendanceDays.classId, g.classId), eq(attendanceDays.date, attendanceDate)))
    const day = (await openDay(db, g.classId, attendanceDate)).day!
    // คนที่ชูการ์ด = มาเรียน · วันใหม่ที่เพิ่งเปิด: คนที่ไม่ได้เล่น = ขาด (วันที่เช็กไว้แล้วไม่แตะคนที่ไม่ได้เล่น)
    await setStatuses(db, day.id, res.players.filter((p) => p.answered > 0).map((p) => p.id), 'present')
    if (!existing) await setStatuses(db, day.id, res.players.filter((p) => p.answered === 0).map((p) => p.id), 'absent')
  }
  return { ...res, saved: { scoreItemId, attendanceDate } }
}

/** เกมล่าสุดของห้อง */
export async function recentGames(db: Db, classId?: string) {
  const rows = await db
    .select({ id: cardGames.id, classId: cardGames.classId, className: classes.name, quizTitle: cardQuizzes.title, createdAt: cardGames.createdAt, endedAt: cardGames.endedAt, n: sql<number>`json_array_length(${cardGames.questions})` })
    .from(cardGames)
    .innerJoin(classes, eq(classes.id, cardGames.classId))
    .innerJoin(cardQuizzes, eq(cardQuizzes.id, cardGames.quizId))
    .where(classId ? eq(cardGames.classId, classId) : undefined)
    .orderBy(desc(cardGames.createdAt))
    .limit(20)
  return rows
}


/** ลบเกม: คำตอบ · EXP ที่ได้จากเกม · รายการคะแนนเก็บของเกม (การเช็กชื่อที่บันทึกไปแล้วไม่ย้อน) — กู้คืนไม่ได้ */
export async function deleteGame(db: Db, id: string): Promise<{ removedExp: number; removedScoreItem: boolean }> {
  const g = await getGame(db, id)
  const ev = await db.delete(pointEvents).where(and(eq(pointEvents.source, 'live'), like(pointEvents.refId, `card:${id}:%`))).returning({ id: pointEvents.id })
  if (g.scoreItemId) await db.batch([db.delete(scores).where(eq(scores.itemId, g.scoreItemId)), db.delete(scoreItems).where(eq(scoreItems.id, g.scoreItemId))])
  await db.batch([db.delete(cardAnswers).where(eq(cardAnswers.gameId, id)), db.delete(cardGames).where(eq(cardGames.id, id))])
  return { removedExp: ev.length, removedScoreItem: !!g.scoreItemId }
}
