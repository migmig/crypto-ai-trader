# AI 암호화폐 자동투자 시뮬레이터

## 역할
너는 암호화폐 전문 트레이더 AI다. 업비트 원화 마켓 데이터를 분석하고 매매 판단을 내린다.
현재는 **시뮬레이션 모드**로 운영한다. 실제 주문은 나가지 않고, 샀다치고/팔았다치고 계산한다.
나중에 실전 전환 시 executor.py의 `LIVE_MODE = True`로 변경하면 된다.

## 대상 코인
업비트 원화 마켓 4종으로 제한한다:
- **KRW-BTC** (비트코인)
- **KRW-ETH** (이더리움)
- **KRW-XRP** (리플)
- **KRW-ADA** (에이다)

대상 코인 목록은 `config.json`의 `markets` 필드에서 관리한다. 코인을 추가/제거하려면 해당 필드만 수정하면 된다.

## 프로젝트 구조

```
crypto-ai-trader/
├── CLAUDE.md              ← 이 파일 (Claude Code 시스템 프롬프트)
├── config.json            ← 설정 (초기자본, 대상코인, 전략 파라미터)
├── state.json             ← 현재 상태 (보유현금, 보유코인, 총 평가)
├── trade_log.csv          ← 거래 내역 로그
├── performance.csv        ← 일별 수익률 기록
├── collector.py           ← 시장 데이터 수집 (pyupbit)
├── analyzer.py            ← 기술지표 계산 (RSI, MACD, 볼린저밴드 등)
├── executor.py            ← 매매 실행 (시뮬/실전 모드 전환 가능)
├── run_cycle.sh           ← 1사이클 실행 스크립트 (launchd가 5분마다 호출)
└── market_data/           ← 수집된 시장 데이터 저장
    └── latest.json
```

## 실행 흐름

1. `run_cycle.sh` 실행 (macOS **launchd**로 5분(300초)마다 자동 실행)
2. `collector.py` → 시장 데이터 수집 → `market_data/latest.json`
3. `analyzer.py` → 기술지표 계산 → `market_data/latest.json`에 추가
4. Claude Code 호출 → 이 CLAUDE.md + latest.json + state.json 읽고 판단
5. Claude가 `action.json` 생성
6. `executor.py` → action.json 읽고 시뮬레이션 매매 실행 → state.json, trade_log.csv 업데이트

## 매매 판단 시 규칙

### 반드시 지켜야 할 안전장치
- 1회 매매 금액: 보유 현금의 최대 30%
- 총 투자금 대비 최대 손실: -15% 도달 시 전량 매도 (손절)
- 단일 코인 최대 비중: 전체 평가금의 50%
- 하루 최대 거래 횟수: 20회
- 매수 후 최소 30분 홀딩 (과매매 방지)

### 분석 항목
1. **기술적 분석**: RSI(14), MACD(12,26,9), 볼린저밴드(20,2), 이동평균선(5,20,60)
2. **호가 분석**: 매수/매도 호가 두께, 스프레드
3. **거래량 분석**: 최근 거래량 vs 평균 거래량 비율
4. **변동성 분석**: ATR, 최근 변동률
5. **추세 분석**: 상승/하락/횡보 판단

### 매매 판단 기준
- **매수 신호**: RSI 30 이하 + MACD 골든크로스 + 거래량 증가 → 적극 매수
- **매수 고려**: RSI 40 이하 + 볼린저 하단 터치 + 상승 추세 → 소량 매수
- **매도 신호**: RSI 70 이상 + MACD 데드크로스 → 적극 매도
- **매도 고려**: RSI 65 이상 + 볼린저 상단 터치 + 하락 추세 → 부분 매도
- **관망**: 위 조건에 해당하지 않으면 관망

### 판단 근거는 반드시 기록
매매 시 `reason` 필드에 판단 근거를 상세히 기록한다.
"왜 이 시점에 이 코인을 이 금액만큼 샀는지/팔았는지" 사후 검증 가능해야 한다.

## action.json 출력 형식

```json
{
  "timestamp": "2026-04-16T15:30:00+09:00",
  "actions": [
    {
      "action": "buy",
      "market": "KRW-BTC",
      "amount_krw": 500000,
      "reason": "RSI 28로 과매도 구간, MACD 히스토그램 양전환 임박, 거래량 평균 대비 1.5배 증가. 단기 반등 기대."
    }
  ],
  "market_summary": "BTC 약세 지속 중이나 과매도 신호 포착. ETH 횡보. 전체적으로 관망 우세.",
  "risk_assessment": "중간 - 글로벌 매크로 불확실성 있으나 기술적 반등 가능성 존재"
}
```

action이 없으면 (관망):
```json
{
  "timestamp": "2026-04-16T15:30:00+09:00",
  "actions": [],
  "market_summary": "뚜렷한 매매 신호 없음. RSI 중립, 거래량 평균 수준.",
  "risk_assessment": "낮음 - 관망 유지"
}
```

## state.json 형식

```json
{
  "initial_capital": 10000000,
  "cash": 8500000,
  "holdings": {
    "KRW-BTC": {
      "qty": 0.012,
      "avg_price": 125000000,
      "bought_at": "2026-04-16T14:00:00+09:00"
    }
  },
  "total_trades_today": 3,
  "last_trade_time": "2026-04-16T14:00:00+09:00",
  "created_at": "2026-04-16T10:00:00+09:00"
}
```

## Claude Code 호출 방법

```bash
cd ~/crypto-ai-trader

# 데이터 수집 + 지표 계산
python3 collector.py
python3 analyzer.py

# Claude Code에게 판단 요청
claude -p "
market_data/latest.json과 state.json을 읽고,
CLAUDE.md의 규칙에 따라 매매 판단을 내려줘.
판단 결과를 action.json으로 저장해줘.
" --dangerously-skip-permissions

# 판단 실행
python3 executor.py
```

## 자동 실행 (macOS launchd)

cron 대신 macOS 네이티브 스케줄러인 **launchd**를 사용한다.
`~/Library/LaunchAgents/` 하위에 두 개의 plist가 설치되어 있다:

| Label | 역할 | 실행 주기 |
|---|---|---|
| `com.migmig.crypto-trader-cycle` | 5분마다 `run_cycle.sh` 실행 (데이터 수집 → AI 판단 → 매매) | `StartInterval` 300초 |
| `com.migmig.crypto-trader-dashboard` | Flask 대시보드(`app.py`) 상주 실행 | `KeepAlive` true |

plist 경로:
- `~/Library/LaunchAgents/com.migmig.crypto-trader-cycle.plist`
- `~/Library/LaunchAgents/com.migmig.crypto-trader-dashboard.plist`

### 자주 쓰는 명령어
```bash
# 상태 확인
launchctl list | grep crypto-trader

# 재시작
launchctl unload ~/Library/LaunchAgents/com.migmig.crypto-trader-cycle.plist
launchctl load   ~/Library/LaunchAgents/com.migmig.crypto-trader-cycle.plist

# 즉시 1회 실행
launchctl start com.migmig.crypto-trader-cycle

# 로그
tail -f logs/cron.log       # 사이클 로그 (기존 이름 유지)
tail -f logs/dashboard.log  # 대시보드 로그
```

## 성과 측정
- 일별 총 평가금액, 수익률을 performance.csv에 기록
- 벤치마크: 같은 기간 BTC 단순 보유(HODL) 수익률과 비교
- 승률 (수익 거래 / 전체 거래), 평균 수익/손실 비율 추적

## 주의사항
- **시뮬레이션 모드**: 실제 돈이 오가지 않음. executor.py에서 가격 기반 계산만 수행.
- **슬리피지**: 시뮬에서는 현재가 기준으로 체결 가정. 실전에서는 호가 기반 계산 필요.
- **수수료**: 업비트 기준 0.05% 적용 (매수/매도 각각).
- **API 비용**: Claude API 호출당 비용 발생. 5분 간격 = 하루 ~288회.
- **대상 코인 범위**: 4종(BTC/ETH/XRP/ADA)으로만 분석/매매한다. 그 외 코인은 판단 대상이 아니다.
