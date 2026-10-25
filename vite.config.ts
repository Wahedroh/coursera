import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/client',
  plugins: [cloudflare({ configPath: '../../wrangler.jsonc' }), react(), tailwindcss()],
  build: { outDir: '../../dist', emptyOutDir: true },
})
