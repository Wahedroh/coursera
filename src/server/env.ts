export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  ASSETS: Fetcher
  TEACHER_PASSWORD_HASH: string
  SESSION_SECRET: string
}

export type SessionInfo =
  | { sessionId: string; kind: 'teacher' }
  | { sessionId: string; kind: 'student'; studentId: string; classId: string }

export type AppEnv = { Bindings: Env; Variables: { session?: SessionInfo } }
