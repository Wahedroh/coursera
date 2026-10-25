import { Hono } from 'hono'
import { parseZipgradeCsv } from '../../shared/roster/parse'
import { MAX_CSV_CHARS, rosterApplySchema, rosterPreviewSchema } from '../../shared/schemas'
import { requireTeacher } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { applyImport, listClasses, previewImport } from './service'

export const rosterRoutes = new Hono<AppEnv>()
rosterRoutes.use('*', requireTeacher)

function parseCsvOrThrow(csv: string, strict: boolean) {
  if (csv.length > MAX_CSV_CHARS) throw apiError('too_large', 'ไฟล์ใหญ่เกินไป (ไม่เกิน 1MB)', 413)
  const parsed = parseZipgradeCsv(csv)
  if (strict && parsed.rows.length === 0 && parsed.errors.some((e) => e.line === 1)) {
    throw apiError('invalid_csv', parsed.errors[0].message, 400)
  }
  return parsed
}

rosterRoutes.post('/roster/preview', async (c) => {
  const { csv } = await parseBody(c, rosterPreviewSchema)
  const { rows, errors } = parseCsvOrThrow(csv, false)
  return c.json({ preview: await previewImport(getDb(c.env), rows), errors })
})

rosterRoutes.post('/roster/apply', async (c) => {
  const { csv, deactivateMissing } = await parseBody(c, rosterApplySchema)
  const { rows } = parseCsvOrThrow(csv, true)
  return c.json(await applyImport(getDb(c.env), rows, { deactivateMissing }))
})

rosterRoutes.get('/classes', async (c) => c.json(await listClasses(getDb(c.env))))
