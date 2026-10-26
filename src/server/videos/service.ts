import { and, desc, eq } from 'drizzle-orm'
import { parseYouTubeId, type StudentVideo, type TeacherVideo, type VideoInput } from '../../shared/videos'
import { newId, type Db } from '../db/client'
import { classes, videos } from '../db/schema'
import { apiError } from '../http'

export const videoNotFound = () => apiError('video_not_found', 'ไม่พบคลิปนี้', 404)

const toRow = (input: VideoInput) => ({ title: input.title, description: input.description, youtubeId: parseYouTubeId(input.url)! })

export async function createVideos(db: Db, classIds: string[], input: VideoInput, t: number): Promise<string[]> {
  const unique = [...new Set(classIds)]
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  }
  const rows = unique.map((classId) => ({ id: newId(), classId, ...toRow(input), createdAt: t }))
  for (const r of rows) await db.insert(videos).values(r)
  return rows.map((r) => r.id)
}

const cols = { id: videos.id, title: videos.title, description: videos.description, youtubeId: videos.youtubeId, published: videos.published, createdAt: videos.createdAt }

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
  await db.update(videos).set({ published }).where(eq(videos.id, id))
}

export async function deleteVideo(db: Db, id: string): Promise<void> {
  await getVideo(db, id)
  await db.delete(videos).where(eq(videos.id, id))
}

const visible = (classId: string) => and(eq(videos.classId, classId), eq(videos.published, true))
const studentCols = { id: videos.id, title: videos.title, description: videos.description, youtubeId: videos.youtubeId, createdAt: videos.createdAt }

export async function videosForStudent(db: Db, classId: string): Promise<StudentVideo[]> {
  return db.select(studentCols).from(videos).where(visible(classId)).orderBy(desc(videos.createdAt))
}

export async function videoForStudent(db: Db, id: string, classId: string): Promise<StudentVideo> {
  const [v] = await db.select(studentCols).from(videos).where(and(eq(videos.id, id), visible(classId)))
  if (!v) throw videoNotFound()
  return v
}
