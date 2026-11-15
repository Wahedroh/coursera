import { Hono } from 'hono'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { cardQuizInputSchema, deviceAnswerSchema, endGameSchema, scanBatchSchema, startGameSchema } from '../../shared/cardgame'
import { z } from 'zod'
import { activeGameFor, answerOnDevice, classCards, createQuiz, deleteGame, deleteQuiz, endGame, gameResult, gameState, getQuiz, goTo, listQuizzes, recentGames, recordScans, reveal, startGame, studentGameView, updateQuiz } from './service'

export const teacherCardRoutes = new Hono<AppEnv>()
teacherCardRoutes.use('*', requireTeacher)

teacherCardRoutes.get('/card-quizzes', async (c) => c.json(await listQuizzes(getDb(c.env))))
teacherCardRoutes.get('/card-quizzes/:id', async (c) => c.json(await getQuiz(getDb(c.env), c.req.param('id'))))
teacherCardRoutes.post('/card-quizzes', async (c) => c.json({ id: await createQuiz(getDb(c.env), await parseBody(c, cardQuizInputSchema), now()) }))
teacherCardRoutes.put('/card-quizzes/:id', async (c) => {
  await updateQuiz(getDb(c.env), c.req.param('id'), await parseBody(c, cardQuizInputSchema), now())
  return c.json({ ok: true })
})
teacherCardRoutes.delete('/card-quizzes/:id', async (c) => {
  await deleteQuiz(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

teacherCardRoutes.get('/classes/:id/cards', async (c) => c.json(await classCards(getDb(c.env), c.req.param('id'))))
teacherCardRoutes.get('/card-games', async (c) => c.json(await recentGames(getDb(c.env), c.req.query('classId') || undefined)))
teacherCardRoutes.post('/card-games', async (c) => {
  const { quizId, classId } = await parseBody(c, startGameSchema)
  return c.json({ id: await startGame(getDb(c.env), quizId, classId, now()) })
})
teacherCardRoutes.get('/card-games/:id', async (c) => c.json(await gameState(getDb(c.env), c.req.param('id'))))
teacherCardRoutes.post('/card-games/:id/scans', async (c) => {
  const { qIndex, scans } = await parseBody(c, scanBatchSchema)
  return c.json(await recordScans(getDb(c.env), c.req.param('id'), qIndex, scans, now()))
})
teacherCardRoutes.post('/card-games/:id/reveal', async (c) => {
  await reveal(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
teacherCardRoutes.post('/card-games/:id/goto', async (c) => {
  const { index } = await parseBody(c, z.object({ index: z.number().int().min(0) }))
  await goTo(getDb(c.env), c.req.param('id'), index)
  return c.json({ ok: true })
})
teacherCardRoutes.delete('/card-games/:id', async (c) => c.json(await deleteGame(getDb(c.env), c.req.param('id'))))
teacherCardRoutes.get('/card-games/:id/result', async (c) => c.json(await gameResult(getDb(c.env), c.req.param('id'))))
teacherCardRoutes.post('/card-games/:id/end', async (c) => c.json(await endGame(getDb(c.env), c.req.param('id'), await parseBody(c, endGameSchema), now())))

/** นักเรียนตอบเกมการ์ดในเครื่องตัวเอง (iPad/มือถือ) แทนการชูการ์ด */
export const studentCardRoutes = new Hono<AppEnv>()
studentCardRoutes.use('*', requireStudent)
const me = (c: { get: (k: 'session') => SessionInfo }) => c.get('session') as Extract<SessionInfo, { kind: 'student' }>
studentCardRoutes.get('/active', async (c) => c.json(await activeGameFor(getDb(c.env), me(c).classId, now())))
studentCardRoutes.get('/:id', async (c) => c.json(await studentGameView(getDb(c.env), c.req.param('id'), me(c), now())))
studentCardRoutes.put('/:id/answer', async (c) => {
  const { qIndex, answer } = await parseBody(c, deviceAnswerSchema)
  return c.json(await answerOnDevice(getDb(c.env), c.req.param('id'), me(c), qIndex, answer, now()))
})
