import { ApiClientError } from '../api'

export type UploadKind = 'submission' | 'attachment' | 'annotation'

export async function uploadImage(blob: Blob, kind: UploadKind, submissionId?: string): Promise<string> {
  const qs = new URLSearchParams({ kind, ...(submissionId ? { submissionId } : {}) })
  let res: Response
  try {
    res = await fetch(`/api/files?${qs}`, { method: 'POST', credentials: 'include', headers: { 'content-type': blob.type }, body: blob })
  } catch {
    throw new ApiClientError('network_error', 'อัปโหลดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 0)
  }
  const data = (await res.json().catch(() => null)) as { key?: string; error?: { code: string; message: string } } | null
  if (!res.ok || !data?.key) throw new ApiClientError(data?.error?.code ?? 'unknown', data?.error?.message ?? 'อัปโหลดไม่สำเร็จ', res.status)
  return data.key
}

export const fileUrl = (key: string) => `/api/files/${key}`
