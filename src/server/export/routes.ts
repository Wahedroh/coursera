import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { todayBangkok } from '../../shared/attendance'
import type { ClassExport } from '../../shared/export'
import { gradebook } from '../assignments/service'
import { attendanceRange } from '../attendance/service'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import { feeCharges, feeItems } from '../db/schema'
import type { AppEnv } from '../env'
import { apiError } from '../http'
import { classGrades } from '../grades/service'
import { scoreBook } from '../scores/service'
import { termWindow } from '../terms/service'
import { OPEN_END } from '../../shared/terms'

export const teacherExportRoutes = new Hono<AppEnv>()
teacherExportRoutes.use('*', requireTeacher)

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** ?term= เทอม (ว่าง = เทอมปัจจุบัน) · ?from=&to= ช่วงวันเช็กชื่อ (ว่าง = ทั้งเทอม) */
teacherExportRoutes.get('/classes/:id/export', async (c) => {
  const db = getDb(c.env)
  const id = c.req.param('id')
  const w = await termWindow(db, c.req.query('term') || undefined)
  const from = c.req.query('from') || todayBangkok(w.start)
  const to = c.req.query('to') || todayBangkok(w.end === OPEN_END ? now() : w.end - 1)
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw apiError('invalid_request', 'ช่วงวันที่ไม่ถูกต้อง', 400)
  const gb = await gradebook(db, id, w)
  const items = await db.select({ id: feeItems.id, title: feeItems.title, amount: feeItems.amount }).from(feeItems).where(eq(feeItems.classId, id)).orderBy(feeItems.createdAt)
  const charges = items.length
    ? await db
        .select({ itemId: feeCharges.itemId, studentId: feeCharges.studentId, amount: feeCharges.amount, paid: feeCharges.paid })
        .from(feeCharges)
        .innerJoin(feeItems, eq(feeItems.id, feeCharges.itemId))
        .where(eq(feeItems.classId, id))
    : []
  const out: ClassExport = {
    gradebook: gb,
    scoreBook: await scoreBook(db, id, w),
    grades: await classGrades(db, id, w),
    attendance: await attendanceRange(db, id, from, to),
    fees: { items, charges },
    from,
    to,
    term: w.term.name,
  }
  return c.json(out)
})
