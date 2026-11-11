import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { feesForStudent, getPaymentInfo } from './service'

type StudentSession = Extract<SessionInfo, { kind: 'student' }>

export const studentFeeRoutes = new Hono<AppEnv>()
studentFeeRoutes.use('*', requireStudent)

studentFeeRoutes.get('/', async (c) => c.json(await feesForStudent(getDb(c.env), (c.get('session') as StudentSession).studentId)))
/** ช่องทางโอนจ่าย (เลขบัญชี/QR) ที่ครูตั้งไว้ */
studentFeeRoutes.get('/payment-info', async (c) => c.json(await getPaymentInfo(getDb(c.env))))
