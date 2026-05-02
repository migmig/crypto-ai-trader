import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 0.0.0.0 — LAN/외부에서도 접근 가능
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5050',
    },
    // 외부 도메인(migmig02.myds.me:8173) 호스트 헤더 허용
    allowedHosts: ['migmig02.myds.me', '.myds.me'],
    // HMR 웹소켓이 외부 도메인 경유로 연결되도록
    hmr: {
      clientPort: 8173,
      host: 'migmig02.myds.me',
    },
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  },
})
