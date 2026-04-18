#!/bin/bash
# 데이터 수집만 — 2분마다 launchd(com.migmig.crypto-trader-collect)가 호출.
# 매매는 run_cycle.sh가 1시간마다 처리 (신호는 일봉 기반이라 고빈도 불필요).

set -e
cd "$(dirname "$0")"
mkdir -p logs market_data

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
PYTHON="$(dirname "$0")/venv/bin/python3"

# 로그 로테이션
LOG_FILE="logs/collect.log"
if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)" -gt 512000 ]; then
  gzip -c "$LOG_FILE" > "logs/collect_$(date '+%Y%m%d_%H%M%S').log.gz"
  : > "$LOG_FILE"
  find logs -name 'collect_*.log.gz' -mtime +7 -delete 2>/dev/null || true
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] 📡 데이터 수집"
$PYTHON collector.py
$PYTHON analyzer.py
echo "[$(date '+%H:%M:%S')] ✅ 완료"
