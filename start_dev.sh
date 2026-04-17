#!/bin/bash
# 개발 모드: Flask 백엔드 + Vite HMR (소스 변경 즉시 반영)
# 접속: http://localhost:5173
cd "$(dirname "$0")"

# 기존 프로세스 정리
lsof -ti :5050 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null
sleep 1

# Flask 백엔드
echo "🔧 Flask 백엔드 시작 (port 5050)..."
venv/bin/python3 app.py &> logs/dashboard.log &
echo $! > dashboard.pid

# Vite 개발 서버 (HMR)
echo "⚡ Vite 개발 서버 시작 (port 5173)..."
echo ""
echo "  → http://localhost:5173 에서 접속"
echo "  → 소스 수정하면 즉시 반영됨"
echo "  → Ctrl+C로 종료"
echo ""
cd frontend && npm run dev
