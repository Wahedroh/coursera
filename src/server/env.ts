export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  ASSETS: Fetcher
  TEACHER_PASSWORD_HASH: string
  SESSION_SECRET: string
}

export type AppEnv = { Bindings: Env; Variables: { session?: unknown } }
