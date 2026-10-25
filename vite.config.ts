import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/client',
  plugins: [cloudflare({
      configPath: '../../wrangler.jsonc',
      // ให้ตรงกับที่ `wrangler d1 migrations apply --local` เขียน (path อิงจาก root = src/client)
      // E2E ใช้ฐานข้อมูล local แยก ไม่ทับข้อมูลที่ใช้ทดลองเอง
      persistState: { path: process.env.E2E ? '../../.wrangler/e2e' : '../../.wrangler/state' },
    }), react(), tailwindcss()],
  build: { outDir: '../../dist', emptyOutDir: true },
})
