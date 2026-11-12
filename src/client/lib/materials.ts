import { ApiClientError } from '../api'

export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return { label: 'PDF', cls: 'bg-red-100 text-red-700' }
  if (ext === 'doc' || ext === 'docx') return { label: 'DOC', cls: 'bg-blue-100 text-blue-700' }
  if (ext === 'ppt' || ext === 'pptx') return { label: 'PPT', cls: 'bg-orange-100 text-orange-700' }
  return { label: 'รูป', cls: 'bg-green-100 text-green-700' }
}

/** จัดกลุ่มตามหัวข้อ (ไม่มีหัวข้อ = "ทั่วไป") เรียงหัวข้อตามที่เพิ่มล่าสุด */
export function groupByTopic<T extends { topic: string }>(items: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = it.topic || 'ทั่วไป'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(it)
  }
  return [...m]
}

/** วันที่สอนแบบไทย เช่น "พฤ. 12 พ.ย. 69" */
export const lessonDateLabel = (d: string) =>
  d ? new Date(`${d}T12:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }) : 'ไม่ระบุวันที่'

/** จัดกลุ่มเอกสารที่จดในห้องตามวันที่สอน (รายการเรียงมาแล้ว) */
export function groupByDate<T extends { lessonDate: string }>(items: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = lessonDateLabel(it.lessonDate)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(it)
  }
  return [...m]
}

export type UploadMeta = { title: string; topic: string; kind: 'blank' | 'notes'; lessonDate: string; notify: boolean; classIds: string[] }

export async function uploadMaterial(file: File, meta: UploadMeta): Promise<string[]> {
  const qs = new URLSearchParams({
    title: meta.title,
    topic: meta.topic,
    kind: meta.kind,
    lessonDate: meta.kind === 'notes' ? meta.lessonDate : '',
    notify: meta.kind === 'notes' && meta.notify ? '1' : '0',
    classIds: meta.classIds.join(','),
    name: file.name,
  })
  let res: Response
  try {
    res = await fetch(`/api/teacher/materials?${qs}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/octet-stream' }, body: file })
  } catch {
    throw new ApiClientError('network_error', 'อัปโหลดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 0)
  }
  const data = (await res.json().catch(() => null)) as { ids?: string[]; error?: { code: string; message: string } } | null
  if (!res.ok || !data?.ids) throw new ApiClientError(data?.error?.code ?? 'unknown', data?.error?.message ?? 'อัปโหลดไม่สำเร็จ', res.status)
  return data.ids
}
