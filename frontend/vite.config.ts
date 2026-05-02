import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 0.0.0.0 — LAN(172.30.1.44:5173) + DSM 리버스 프록시 경로 모두 허용
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5050',
    },
    // 외부 도메인 호스트 헤더 허용 (DSM 리버스 프록시가 Host: migmig02.myds.me 그대로 전달)
    allowedHosts: ['migmig02.myds.me', '.myds.me', 'localhost', '172.30.1.44'],
    // HMR: clientPort/host 명시하지 않으면 Vite가 브라우저의 window.location 기준으로 자동 결정
    // → 같은 dev 서버를 LAN(http) / 외부(https) 양쪽에서 모두 정상 동작.
    // 단 DSM 프록시에 WebSocket Upgrade 헤더 등록 필수.
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  },
})
