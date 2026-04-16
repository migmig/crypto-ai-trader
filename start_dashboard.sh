#!/bin/bash
# 대시보드 서버 시작/재시작
cd "$(dirname "$0")"
PIDFILE="dashboard.pid"

# 기존 프로세스 종료
if [ -f "$PIDFILE" ]; then
    kill "$(cat $PIDFILE)" 2>/dev/null
    rm -f "$PIDFILE"
fi

# Flask 대시보드 시작
nohup ./venv/bin/python3 app.py >> logs/dashboard.log 2>&1 &
echo $! > "$PIDFILE"
echo "Dashboard started (PID: $(cat $PIDFILE)) on http://0.0.0.0:5050"
