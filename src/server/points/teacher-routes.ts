import { Hono } from 'hono'
import { z } from 'zod'
import { requireTeacher } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { classPoints, getSeating, givePoints, leaderboardEnabled, saveSeating, setLeaderboard } from './service'

export const teacherPointsRoutes = new Hono<AppEnv>()
teacherPointsRoutes.use('*', requireTeacher)

const pointsSchema = z.object({
  studentIds: z.array(z.string()).min(1).max(60),
  delta: z
    .number()
    .int()
    .min(-5)
    .max(10)
    .refine((d) => d !== 0),
  reason: z.string().trim().min(1).max(100),
})
const layoutSchema = z.object({ cols: z.number().int().min(2).max(12), seats: z.array(z.string().nullable()).max(150) })

teacherPointsRoutes.post('/points', async (c) => {
  const { studentIds, delta, reason } = await parseBody(c, pointsSchema)
  await givePoints(getDb(c.env), studentIds, delta, reason)
  return c.json({ ok: true })
})
teacherPointsRoutes.get('/classes/:id/points', async (c) => c.json(await classPoints(getDb(c.env), c.req.param('id'))))
teacherPointsRoutes.get('/classes/:id/seating', async (c) => c.json(await getSeating(getDb(c.env), c.req.param('id'))))
teacherPointsRoutes.put('/classes/:id/seating', async (c) => {
  await saveSeating(getDb(c.env), c.req.param('id'), await parseBody(c, layoutSchema))
  return c.json({ ok: true })
})
teacherPointsRoutes.get('/classes/:id/settings', async (c) => c.json({ leaderboardEnabled: await leaderboardEnabled(getDb(c.env), c.req.param('id')) }))
teacherPointsRoutes.put('/classes/:id/settings/leaderboard', async (c) => {
  const { enabled } = await parseBody(c, z.object({ enabled: z.boolean() }))
  await setLeaderboard(getDb(c.env), c.req.param('id'), enabled)
  return c.json({ ok: true })
})
