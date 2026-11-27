import { Hono } from 'hono'
import { todayBangkok } from '../../shared/attendance'
import { todoInputSchema, todoUpdateSchema } from '../../shared/teacherWeek'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { createTodo, deleteTodo, teacherUpcoming, updateTodo } from './service'

export const teacherWeekRoutes = new Hono<AppEnv>()
teacherWeekRoutes.use('*', requireTeacher)
teacherWeekRoutes.get('/upcoming', async (c) => c.json(await teacherUpcoming(getDb(c.env), todayBangkok(now()))))
teacherWeekRoutes.post('/todos', async (c) => c.json({ id: await createTodo(getDb(c.env), await parseBody(c, todoInputSchema), now()) }, 201))
teacherWeekRoutes.put('/todos/:id', async (c) => {
  await updateTodo(getDb(c.env), c.req.param('id'), await parseBody(c, todoUpdateSchema), now())
  return c.json({ ok: true })
})
teacherWeekRoutes.delete('/todos/:id', async (c) => {
  await deleteTodo(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
