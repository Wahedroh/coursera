import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/client',
  plugins: [cloudflare({
      configPath: '../../wrangler.jsonc',
      // E2E ใช้ฐานข้อมูล local แยก ไม่ทับข้อมูลที่ใช้ทดลองเอง
      ...(process.env.E2E ? { persistState: { path: '../../.wrangler/e2e' } } : {}),
    }), react(), tailwindcss()],
  build: { outDir: '../../dist', emptyOutDir: true },
})
