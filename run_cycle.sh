#!/bin/bash
# 크립토 AI 트레이더 - 1사이클 실행 (하이브리드)
# launchd (com.migmig.crypto-trader-cycle): StartInterval 120초(2분) 주기
#
# 흐름:
#   1. collector.py   → 시세/캔들/호가 수집
#   2. analyzer.py    → 기술지표 계산
#   3. signals.py     → 규칙 기반 신호(buy_strong/buy/hold/sell/sell_strong) 산출
#                       signals.json 생성. has_non_hold 플래그 포함
#   4a. has_non_hold=true  → Claude 호출 (signals.json 맥락으로 검증/서술/거부)
#   4b. has_non_hold=false → signals.json을 action.json으로 복사 (AI 스킵, 비용 0)
#   5. executor.py    → action.json 집행

set -e
cd "$(dirname "$0")"
mkdir -p logs market_data action_history

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

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

# Step 3: 알고리즘 신호
echo ""
echo "🔎 Step 3: 알고리즘 신호 계산"
$PYTHON signals.py

# Step 4: 분기 — 신호에 따라 AI 호출 여부 결정
HAS_NON_HOLD=$($PYTHON -c "import json; print('1' if json.load(open('signals.json')).get('has_non_hold') else '0')")
FORCE_AI=$($PYTHON -c "import json; c=json.load(open('config.json')); print('1' if c.get('hybrid',{}).get('always_call_ai') else '0')" 2>/dev/null || echo "0")

if [ "$HAS_NON_HOLD" = "1" ] || [ "$FORCE_AI" = "1" ]; then
  echo ""
  echo "🧠 Step 4: AI 판단 (has_non_hold=$HAS_NON_HOLD, force=$FORCE_AI)"
  claude -p "
지금 시각: $TIMESTAMP

signals.json에 알고리즘이 계산한 per_coin 스냅샷, conditions_checked, triggers_next_cycle,
그리고 제안 actions가 들어 있다. market_data/latest.json 원본도 함께 검토해.

임무:
1. signals.json의 알고리즘 판단을 검토하고 (동의/거부/수정) 최종 action.json을 작성해.
2. CLAUDE.md의 새 스키마(per_coin / conditions_checked / triggers_next_cycle) 필드를 유지해.
   signals.json의 같은 필드를 기반으로 작성하되, 네 판단에 맞게 보강하거나 정정해도 좋다.
3. market_summary는 1~2문장으로 짧게, risk_assessment는 '낮음|중간|높음 - 한 줄 근거' 형식.
4. 각 action의 reason은 구체적 수치 근거 포함.
5. source: \"ai\" 로 표기.

중요:
- 확실한 신호가 아니면 관망으로 내려라. 안전장치(CLAUDE.md) 위반 금지.
- 기존 긴 문단형 market_summary는 쓰지 말 것. 구조화된 필드가 본문이다.
- signals.json에 이미 제안된 actions가 부적절하다고 판단하면 actions를 비워도 된다.
" --dangerously-skip-permissions
else
  echo ""
  echo "💤 Step 4: 전 종목 hold — AI 호출 스킵 (알고리즘 결과 사용)"
  cp signals.json action.json
fi

# Step 5: 매매 실행
echo ""
echo "💹 Step 5: 매매 실행"
$PYTHON executor.py

echo ""
echo "✅ 사이클 완료: $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════"
