export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      credentials: 'include',
      headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiClientError('network_error', 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string } } | null)?.error
    throw new ApiClientError(err?.code ?? 'unknown', err?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่', res.status)
  }
  return data as T
}

export type Me =
  | { kind: 'teacher' }
  | { kind: 'student'; student: { id: string; zipgradeId: string; title: string | null; firstName: string; lastName: string; className: string } }

export const fullName = (s: { title: string | null; firstName: string; lastName: string }) =>
  `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim()
