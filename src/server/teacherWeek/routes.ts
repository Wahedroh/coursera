import { Hono } from 'hono'
import { dateSchema, todayBangkok } from '../../shared/attendance'
import { todoInputSchema, todoUpdateSchema } from '../../shared/teacherWeek'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { createTodo, deleteTodo, teacherWeek, updateTodo } from './service'

export const teacherWeekRoutes = new Hono<AppEnv>()
teacherWeekRoutes.use('*', requireTeacher)
teacherWeekRoutes.get('/week', async (c) => {
  const d = dateSchema.safeParse(c.req.query('date'))
  return c.json(await teacherWeek(getDb(c.env), d.success ? d.data : todayBangkok(now())))
})
teacherWeekRoutes.post('/todos', async (c) => c.json({ id: await createTodo(getDb(c.env), await parseBody(c, todoInputSchema), now()) }, 201))
teacherWeekRoutes.put('/todos/:id', async (c) => {
  await updateTodo(getDb(c.env), c.req.param('id'), await parseBody(c, todoUpdateSchema), now())
  return c.json({ ok: true })
})
teacherWeekRoutes.delete('/todos/:id', async (c) => {
  await deleteTodo(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
