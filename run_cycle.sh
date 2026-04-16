#!/bin/bash
# 크립토 AI 트레이더 - 1사이클 실행
# 크론: */5 * * * * cd ~/crypto-ai-trader && bash run_cycle.sh >> logs/cron.log 2>&1

set -e
cd "$(dirname "$0")"
mkdir -p logs market_data action_history

# PATH 설정 (크론 환경용)
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# 가상환경 Python 사용
PYTHON="$(dirname "$0")/venv/bin/python3"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo ""
echo "══════════════════════════════════════════"
echo "  🤖 AI 트레이더 사이클 시작: $TIMESTAMP"
echo "══════════════════════════════════════════"

# Step 1: 데이터 수집
echo ""
echo "📡 Step 1: 시장 데이터 수집"
$PYTHON collector.py

# Step 2: 기술지표 분석
echo ""
echo "📊 Step 2: 기술지표 분석"
$PYTHON analyzer.py

# Step 3: Claude Code에게 판단 요청
echo ""
echo "🧠 Step 3: AI 매매 판단"
claude -p "
지금 시각: $TIMESTAMP

1. market_data/latest.json을 읽어서 각 코인의 현재가와 기술지표를 파악해.
2. state.json을 읽어서 현재 보유 현금, 보유 코인, 수익 상황을 파악해.
3. config.json의 안전장치 규칙을 확인해.
4. CLAUDE.md의 매매 판단 기준에 따라 분석하고 판단을 내려.
5. 판단 결과를 action.json으로 저장해.

중요:
- 확실한 신호가 아니면 관망해. 무리한 매매는 하지 마.
- 판단 근거(reason)를 반드시 상세히 써.
- action.json 형식은 CLAUDE.md에 정의된 대로 따라.
" --dangerously-skip-permissions

# Step 4: 매매 실행
echo ""
echo "💹 Step 4: 매매 실행"
$PYTHON executor.py

echo ""
echo "✅ 사이클 완료: $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════"
