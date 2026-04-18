#!/bin/bash
# 크립토 AI 트레이더 - 매매 사이클 (일봉 기반 v5)
# launchd (com.migmig.crypto-trader-cycle): StartInterval 3600초(1시간) 주기
#
# 데이터 수집은 run_collect.sh가 2분마다 처리 (별도 plist).
# 여기선 매매 신호·AI·실행만 수행. latest.json이 오래됐으면 fallback 수집.
#
# 흐름:
#   1. 데이터 신선도 체크 (fallback: collector+analyzer)
#   2. signals.py     → 일봉 규칙 기반 신호 → signals.json
#   3a. has_non_hold=true  → Claude 호출 → action.json
#   3b. has_non_hold=false → signals.json → action.json 복사 (AI 스킵)
#   4. executor.py    → action.json 집행

set -e
cd "$(dirname "$0")"
mkdir -p logs market_data action_history

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PYTHON="$(dirname "$0")/venv/bin/python3"

# 로그 로테이션: 500KB 초과 시 일자별 gz 압축 후 리셋 (최근 7일 보관)
LOG_FILE="logs/cron.log"
if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)" -gt 512000 ]; then
  gzip -c "$LOG_FILE" > "logs/cron_$(date '+%Y%m%d_%H%M%S').log.gz"
  : > "$LOG_FILE"
  find logs -name 'cron_*.log.gz' -mtime +7 -delete 2>/dev/null || true
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo ""
echo "══════════════════════════════════════════"
echo "  🤖 AI 트레이더 매매 사이클: $TIMESTAMP"
echo "══════════════════════════════════════════"

# Step 0: 데이터 신선도 체크 — latest.json 없거나 10분 초과면 fallback 수집
DATA_FILE="market_data/latest.json"
if [ ! -f "$DATA_FILE" ] || [ "$(( $(date +%s) - $(stat -f%m "$DATA_FILE" 2>/dev/null || stat -c%Y "$DATA_FILE" 2>/dev/null) ))" -gt 600 ]; then
  echo "📡 Step 0: 데이터 오래됨/없음 → fallback 수집"
  $PYTHON collector.py
  $PYTHON analyzer.py
fi

# Step 1: 알고리즘 신호
echo ""
echo "🔎 Step 1: 알고리즘 신호 계산 (일봉 기반)"
$PYTHON signals.py

# Step 2: 분기 — 신호에 따라 AI 호출 여부 결정
HAS_NON_HOLD=$($PYTHON -c "import json; print('1' if json.load(open('signals.json')).get('has_non_hold') else '0')")
FORCE_AI=$($PYTHON -c "import json; c=json.load(open('config.json')); print('1' if c.get('hybrid',{}).get('always_call_ai') else '0')" 2>/dev/null || echo "0")

if [ "$HAS_NON_HOLD" = "1" ] || [ "$FORCE_AI" = "1" ]; then
  echo ""
  echo "🧠 Step 2: AI 판단 (has_non_hold=$HAS_NON_HOLD, force=$FORCE_AI)"
  claude -p --model claude-opus-4-7 "
지금 시각: $TIMESTAMP

signals.json에 알고리즘이 계산한 per_coin 스냅샷, conditions_checked, triggers_next_cycle,
제안 actions가 들어 있다. market_data/latest.json 원본(ticker, candles_15m/1h/1d, orderbook)도 함께 본다.
state.json에서 현재 보유 현황을 확인한다.

임무: 알고리즘 신호를 단순 통과시키지 말고, 아래 4가지 종합 판단을 적용해 actions를 결정해.

1. **크로스 코인 상관 점검**
   - BTC가 일봉 기준 명확한 약세(change_pct 음수 + RSI 하락 + MA 아래)면 알트 매수신호는 보수적으로 거부 또는 규모 축소.
   - 반대로 BTC가 강세 흐름에서 알트 매수신호가 같이 뜨면 신뢰도 가산.

2. **다중 시간프레임 종합**
   - 알고리즘 판단은 이제 일봉 중심. 15m/1h는 실시간 컨텍스트용 보조 지표.
   - 일봉 매수신호여도 15m/1h에 강한 반대 흐름(급락 진행 중 등)이면 진입 타이밍 연기 가능.
   - 일봉 매도신호여도 최근 1h 반등 강하면 타이밍 늦출 수 있음.

3. **호가/유동성 점검**
   - latest.json의 orderbook(매수·매도 호가 두께, 스프레드)을 확인해 체결 가능성과 슬리피지 위험을 평가.
   - 스프레드가 비정상적으로 넓거나 한쪽 호가벽이 얇으면 진입 보류 또는 규모 축소.

4. **포트폴리오 밸런싱**
   - state.json holdings를 평가금액 기준으로 환산. 단일 코인 비중이 이미 30%+면 추가 매수 거부(50% 안전장치 도달 전이라도).
   - 동시 다종목 매수신호 시, 이미 보유 중이지 않은 코인을 우선해 분산 효과 강화.

5. 알고리즘 actions를 거부/수정/추가할 권한이 있다. 위 4가지 점검 결과를 reason에 명시해.
   예: '[AI] BTC 1d 약세(-2.1%, RSI 38)로 SOL buy_strong 거부' 같은 식.

출력 스키마:
- CLAUDE.md의 v2 스키마(per_coin / conditions_checked / triggers_next_cycle) 유지.
- per_coin은 signals.json 값 그대로 복사 가능, 단 네 판단 핵심 코인엔 짧은 노트 추가 가능.
- market_summary는 1~2문장(BTC 컨텍스트 + 핵심 코인 액션 한 줄).
- risk_assessment는 '낮음|중간|높음 - 한 줄 근거' 형식.
- 각 action의 reason 앞엔 [AI] 표기. 구체적 수치 근거 필수.
- source: \"ai\".
- 안전장치(CLAUDE.md) 위반 금지. 확신 없으면 관망.
" --dangerously-skip-permissions
else
  echo ""
  echo "💤 Step 2: 전 종목 hold — AI 호출 스킵 (알고리즘 결과 사용)"
  cp signals.json action.json
fi

# Step 3: 매매 실행
echo ""
echo "💹 Step 3: 매매 실행"
$PYTHON executor.py

echo ""
echo "✅ 사이클 완료: $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════"
