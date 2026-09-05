import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const trafficLogPath = path.resolve(__dirname, '../traffic.log')

function appendTrafficLog(entry: string) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${entry}\n`
  try {
    fs.appendFileSync(trafficLogPath, line, 'utf-8')
  } catch (err) {
    console.error('Failed writing to traffic.log', err)
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            const method = req.method || 'GET'
            const url = req.url || ''
            const msg = `--> [CLIENT REQ] ${method} ${url}`
            console.log(`\x1b[36m${msg}\x1b[0m`)
            appendTrafficLog(msg)
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            const method = req.method || 'GET'
            const url = req.url || ''
            const status = proxyRes.statusCode || 0
            const statusColor = status >= 400 ? '\x1b[31m' : '\x1b[32m'
            const msg = `<-- [API RES] ${status} ${method} ${url}`
            console.log(`${statusColor}${msg}\x1b[0m`)
            appendTrafficLog(msg)
          })
          proxy.on('error', (err, req) => {
            const method = req.method || 'GET'
            const url = req.url || ''
            const msg = `x-- [PROXY ERROR] ${method} ${url}: ${err.message}`
            console.error(`\x1b[31m${msg}\x1b[0m`)
            appendTrafficLog(msg)
          })
        },
      },
    },
  },
})

