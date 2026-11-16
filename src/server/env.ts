export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  BACKUPS: R2Bucket
  ASSETS: Fetcher
  TEACHER_PASSWORD_HASH: string
  SESSION_SECRET: string
  /** ดูการใช้งานทั้งบัญชี Cloudflare (ไม่ตั้งก็ได้) — token แบบ Account Analytics: Read เท่านั้น */
  CF_ACCOUNT_ID?: string
  CF_ANALYTICS_TOKEN?: string
}

export type SessionInfo =
  | { sessionId: string; kind: 'teacher' }
  | { sessionId: string; kind: 'student'; studentId: string; classId: string }

export type AppEnv = { Bindings: Env; Variables: { session?: SessionInfo } }
