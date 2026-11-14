import { and, desc, eq, like } from 'drizzle-orm'
import { EXP_RULES, VIDEO_WATCH_RATIO } from '../../shared/points'
import { parseYouTubeId, type StudentVideo, type TeacherVideo, type VideoInput, type VideoWatchResult } from '../../shared/videos'
import { newId, type Db } from '../db/client'
import { classes, pointEvents, videos } from '../db/schema'
import { apiError } from '../http'

export const videoNotFound = () => apiError('video_not_found', 'ไม่พบคลิปนี้', 404)

const toRow = (input: VideoInput) => ({ title: input.title, description: input.description, youtubeId: parseYouTubeId(input.url)!, questions: input.questions ?? [] })

export async function createVideos(db: Db, classIds: string[], input: VideoInput, t: number, sched?: Map<string, { published: boolean; publishAt: number | null }>): Promise<string[]> {
  const unique = [...new Set(classIds)]
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  }
  const rows = unique.map((classId) => ({ id: newId(), classId, ...toRow(input), ...(sched?.get(classId) ?? {}), createdAt: t }))
  for (const r of rows) await db.insert(videos).values(r)
  return rows.map((r) => r.id)
}

const cols = { id: videos.id, title: videos.title, description: videos.description, youtubeId: videos.youtubeId, published: videos.published, publishAt: videos.publishAt, createdAt: videos.createdAt, questions: videos.questions }

export async function listVideos(db: Db, classId: string): Promise<TeacherVideo[]> {
  return db.select(cols).from(videos).where(eq(videos.classId, classId)).orderBy(desc(videos.createdAt))
}

async function getVideo(db: Db, id: string) {
  const [v] = await db.select().from(videos).where(eq(videos.id, id))
  if (!v) throw videoNotFound()
  return v
}

export async function updateVideo(db: Db, id: string, input: VideoInput): Promise<void> {
  await getVideo(db, id)
  await db.update(videos).set(toRow(input)).where(eq(videos.id, id))
}

export async function setVideoPublished(db: Db, id: string, published: boolean): Promise<void> {
  await getVideo(db, id)
  await db.update(videos).set({ published, publishAt: null }).where(eq(videos.id, id))
}

export async function deleteVideo(db: Db, id: string): Promise<void> {
  await getVideo(db, id)
  await db.delete(videos).where(eq(videos.id, id))
}

const visible = (classId: string) => and(eq(videos.classId, classId), eq(videos.published, true))
const studentCols = { id: videos.id, title: videos.title, description: videos.description, youtubeId: videos.youtubeId, createdAt: videos.createdAt, questions: videos.questions }
/** ซ่อนเฉลย */
const forStudent = ({ questions, ...v }: { questions: { q: string; image?: string; choices: string[] }[] } & Omit<StudentVideo, 'quiz' | 'rewarded'>, rewarded: boolean): StudentVideo => ({
  ...v,
  rewarded,
  quiz: questions.map(({ q, image, choices }) => ({ q, choices, ...(image ? { image } : {}) })),
})

const refOf = (videoId: string, studentId: string) => `${videoId}:${studentId}`

async function rewardedSet(db: Db, studentId: string): Promise<Set<string>> {
  const rows = await db
    .select({ ref: pointEvents.refId })
    .from(pointEvents)
    .where(and(eq(pointEvents.source, 'video'), eq(pointEvents.studentId, studentId), like(pointEvents.refId, `%:${studentId}`)))
  return new Set(rows.map((r) => (r.ref ?? '').split(':')[0]))
}

export async function videosForStudent(db: Db, classId: string, studentId: string): Promise<StudentVideo[]> {
  const got = await rewardedSet(db, studentId)
  return (await db.select(studentCols).from(videos).where(visible(classId)).orderBy(desc(videos.createdAt))).map((v) => forStudent(v, got.has(v.id)))
}

async function visibleVideo(db: Db, id: string, classId: string) {
  const [v] = await db.select(studentCols).from(videos).where(and(eq(videos.id, id), visible(classId)))
  if (!v) throw videoNotFound()
  return v
}

export async function videoForStudent(db: Db, id: string, classId: string, studentId: string): Promise<StudentVideo> {
  const v = await visibleVideo(db, id, classId)
  return forStudent(v, (await rewardedSet(db, studentId)).has(v.id))
}

/** ทบทวนคลิปถึง 70% ของความยาว (และตอบคำถามท้ายคลิปถูกทุกข้อ ถ้ามี) → +EXP (คลิปละครั้งต่อคน) */
export async function recordWatch(
  db: Db,
  id: string,
  classId: string,
  studentId: string,
  w: { watchedSeconds: number; durationSeconds: number; answers?: number[] },
  t: number,
): Promise<VideoWatchResult> {
  const v = await visibleVideo(db, id, classId)
  if (w.watchedSeconds + 1 < w.durationSeconds * VIDEO_WATCH_RATIO) throw apiError('not_enough', `ต้องดูอย่างน้อย ${Math.round(VIDEO_WATCH_RATIO * 100)}% ของคลิป`, 400)
  if (v.questions.length) {
    const answers = w.answers ?? []
    const correct = v.questions.filter((q, i) => answers[i] === q.answer).length
    // ตอบไม่ครบ/ผิด: ไม่บอกว่าข้อไหนผิด ให้ลองใหม่
    if (correct < v.questions.length) return { awarded: false, exp: EXP_RULES.video, correct, total: v.questions.length }
  }
  const res = await db
    .insert(pointEvents)
    .values({ id: newId(), studentId, delta: EXP_RULES.video, reason: `ทบทวนคลิป: ${v.title}`, source: 'video', refId: refOf(id, studentId), createdAt: t })
    .onConflictDoNothing()
    .returning({ id: pointEvents.id })
  return { awarded: res.length > 0, exp: EXP_RULES.video, ...(v.questions.length ? { correct: v.questions.length, total: v.questions.length } : {}) }
}
