/** โควตารายวันของแพ็กเกจฟรี Cloudflare (นับทั้งบัญชี · รีเซ็ตเที่ยงคืน UTC = 07:00 น. เวลาไทย) */
export const CF_FREE_LIMITS = {
  kvRead: 100_000,
  kvWrite: 1_000,
  kvDelete: 1_000,
  kvList: 1_000,
  kvStorageBytes: 1024 ** 3,
  workerRequests: 100_000,
  d1RowsRead: 5_000_000,
  d1RowsWritten: 100_000,
} as const

export type CloudflareUsage =
  | { configured: false }
  | {
      configured: true
      /** วันที่ (UTC) ของรอบโควตานี้ */
      date: string
      fetchedAt: number
      kv: { read: number; write: number; delete: number; list: number; storageBytes: number; keys: number }
      workers: { requests: number; byScript: { name: string; requests: number }[] }
      d1: { rowsRead: number; rowsWritten: number }
      error?: string
    }
