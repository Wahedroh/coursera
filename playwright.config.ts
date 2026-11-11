import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  // ไม่ให้ service worker (แอป/แจ้งเตือน) ควบคุมหน้า — ไม่งั้น page.route ดักคำขอไม่ได้บางครั้ง (เทสต์ผ่านบ้างไม่ผ่านบ้าง)
  use: { baseURL: 'http://localhost:5173', ...devices['Pixel 7'], serviceWorkers: 'block' },
  webServer: {
    command: 'node scripts/e2e-setup.mjs && E2E=1 npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
