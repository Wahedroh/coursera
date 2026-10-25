// เตรียมสภาพแวดล้อม E2E: ฐานข้อมูล local แยก (.wrangler/e2e) และ .dev.vars ด้วยรหัสครู "teacher-pass"
import { execSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

rmSync('.wrangler/e2e', { recursive: true, force: true })
if (!existsSync('.dev.vars')) {
  const hash = execSync('node scripts/hash-password.mjs teacher-pass').toString().trim()
  writeFileSync('.dev.vars', `TEACHER_PASSWORD_HASH="${hash}"\nSESSION_SECRET="dev"\n`)
}
execSync('npx wrangler d1 migrations apply classroom --local --persist-to .wrangler/e2e', { stdio: 'inherit' })
