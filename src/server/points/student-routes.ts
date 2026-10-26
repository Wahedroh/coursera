import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { leaderboard, openEgg, progress } from './service'

// ตรวจสิทธิ์ราย route — router นี้ mount ที่ /api/student ร่วมกับหน้าล็อกอินซึ่งต้องเข้าได้โดยไม่ล็อกอิน
export const studentPointsRoutes = new Hono<AppEnv>()
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as Extract<SessionInfo, { kind: 'student' }>

studentPointsRoutes.get('/progress', requireStudent, async (c) => c.json(await progress(getDb(c.env), me(c).studentId)))
studentPointsRoutes.post('/eggs/:id/open', requireStudent, async (c) => c.json(await openEgg(getDb(c.env), me(c).studentId, c.req.param('id'))))
studentPointsRoutes.get('/leaderboard', requireStudent, async (c) => c.json(await leaderboard(getDb(c.env), me(c).classId, me(c).studentId)))
