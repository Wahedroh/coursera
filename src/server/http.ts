import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiError } from '../shared/errors'

export function apiError(code: string, message: string, status: ContentfulStatusCode): HTTPException {
  const body: ApiError = { error: { code, message } }
  return new HTTPException(status, { res: Response.json(body, { status }) })
}

export function onError(err: Error, c: Context): Response {
  if (err instanceof HTTPException) return err.getResponse()
  console.error(err)
  const body: ApiError = { error: { code: 'internal_error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' } }
  return c.json(body, 500)
}

export function getClientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown'
}
