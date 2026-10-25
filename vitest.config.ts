import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            TEACHER_PASSWORD_HASH: 'pbkdf2-sha256$100000$/knLWP0ZF61fbkV9ukJ9OA==$0fPm3yZWNV/s2l++wE67w57aYKw5wIAwoB4tLbmLdDk=', // = "teacher-pass"
            SESSION_SECRET: 'test-secret',
          },
        },
      }),
    ],
    test: { setupFiles: ['./tests/apply-migrations.ts'], include: ['tests/**/*.test.ts'] },
  }
})
