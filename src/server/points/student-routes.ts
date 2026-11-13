import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb, now } from '../db/client'
import { avatarInputSchema } from '../../shared/avatar'
import { parseBody } from '../http'
import type { AppEnv, SessionInfo } from '../env'
import { getAvatar, leaderboard, openEgg, progress, saveAvatar } from './service'
import { expSummary, studentStats } from './stats'
import { studentBadges } from './badges'
import { getGrading } from '../grades/service'

// ตรวจสิทธิ์ราย route — router นี้ mount ที่ /api/student ร่วมกับหน้าล็อกอินซึ่งต้องเข้าได้โดยไม่ล็อกอิน
export const studentPointsRoutes = new Hono<AppEnv>()
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as Extract<SessionInfo, { kind: 'student' }>

studentPointsRoutes.get('/progress', requireStudent, async (c) => {
  const db = getDb(c.env)
  const g = await getGrading(db, me(c).classId)
  // กติกาครู: ครบชุดได้เกรดสูงสุด — บอกนักเรียนเพื่อเป็นแรงจูงใจ
  return c.json({ ...(await progress(db, me(c).studentId)), fullSetReward: g.fullSetTopGrade ? { grade: g.bands[0].grade, minExamPct: g.fullSetMinExamPct } : null })
})
studentPointsRoutes.post('/eggs/:id/open', requireStudent, async (c) => c.json(await openEgg(getDb(c.env), me(c).studentId, c.req.param('id'))))
studentPointsRoutes.get('/leaderboard', requireStudent, async (c) => c.json(await leaderboard(getDb(c.env), me(c).classId, me(c).studentId)))
studentPointsRoutes.get('/avatar', requireStudent, async (c) => c.json(await getAvatar(getDb(c.env), me(c).studentId)))
studentPointsRoutes.put('/avatar', requireStudent, async (c) => {
  const { nickname, config } = await parseBody(c, avatarInputSchema)
  await saveAvatar(getDb(c.env), me(c).studentId, nickname, config, now())
  return c.json({ ok: true })
})
studentPointsRoutes.get('/exp', requireStudent, async (c) => c.json(await expSummary(getDb(c.env), me(c).studentId)))
studentPointsRoutes.get('/stats', requireStudent, async (c) => c.json(await studentStats(getDb(c.env), me(c).studentId, me(c).classId, now())))
studentPointsRoutes.get('/badges', requireStudent, async (c) => c.json(await studentBadges(getDb(c.env), me(c).studentId)))
