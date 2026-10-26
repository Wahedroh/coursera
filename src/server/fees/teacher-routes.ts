import { Hono } from 'hono'
import { bulkChargeSchema, chargeInputSchema, createFeeItemsSchema, feeItemInputSchema } from '../../shared/fees'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { addCharges, createFeeItems, deleteFeeItem, getFeeSheet, listFeeItems, removeCharge, saveCharge, updateFeeItem } from './service'

export const teacherFeeRoutes = new Hono<AppEnv>()
teacherFeeRoutes.use('*', requireTeacher)

teacherFeeRoutes.post('/fee-items', async (c) => {
  const { classIds, ...input } = await parseBody(c, createFeeItemsSchema)
  return c.json({ ids: await createFeeItems(getDb(c.env), classIds, input, now()) })
})
teacherFeeRoutes.get('/classes/:id/fee-items', async (c) => c.json(await listFeeItems(getDb(c.env), c.req.param('id'))))
teacherFeeRoutes.get('/fee-items/:id', async (c) => c.json(await getFeeSheet(getDb(c.env), c.req.param('id'))))
teacherFeeRoutes.put('/fee-items/:id', async (c) => {
  await updateFeeItem(getDb(c.env), c.req.param('id'), await parseBody(c, feeItemInputSchema))
  return c.json({ ok: true })
})
teacherFeeRoutes.delete('/fee-items/:id', async (c) => {
  await deleteFeeItem(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
teacherFeeRoutes.post('/fee-items/:id/charges/bulk', async (c) => {
  const { studentIds } = await parseBody(c, bulkChargeSchema)
  return c.json({ added: await addCharges(getDb(c.env), c.req.param('id'), studentIds, now()) })
})
teacherFeeRoutes.put('/fee-items/:id/charges/:studentId', async (c) => {
  await saveCharge(getDb(c.env), c.req.param('id'), c.req.param('studentId'), await parseBody(c, chargeInputSchema), now())
  return c.json({ ok: true })
})
teacherFeeRoutes.delete('/fee-items/:id/charges/:studentId', async (c) => {
  await removeCharge(getDb(c.env), c.req.param('id'), c.req.param('studentId'))
  return c.json({ ok: true })
})
