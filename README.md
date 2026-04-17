# 🤖 AI 암호화폐 자동투자 시뮬레이터

Claude Code를 AI 투자 판단 엔진으로 사용하는 암호화폐 자동매매 시뮬레이터.

## 대상 코인 (10종)

BTC · ETH · XRP · ADA · SOL · DOGE · AVAX · LINK · DOT · SUI

> 하이브리드 구조(알고리즘이 규칙 평가, non-hold 신호에만 AI 호출) 덕에 코인 수를 늘려도 AI 비용이 선형 증가하지 않는다. `config.json`의 `markets` 배열로 조정.

## 빠른 시작

```bash
# 1. 의존성 설치
pip install pyupbit --break-system-packages

# 2. 수동 1사이클 실행
cd ~/pywork/crypto-ai-trader
python3 collector.py        # 데이터 수집
python3 analyzer.py         # 지표 계산
# Claude Code가 판단
claude -p "market_data/latest.json과 state.json을 읽고 CLAUDE.md 규칙에 따라 매매 판단 후 action.json 저장" --dangerously-skip-permissions
python3 executor.py         # 시뮬레이션 매매 실행

# 3. 또는 한방에 실행
bash run_cycle.sh
```

## 자동 실행 (macOS launchd)

cron이 아닌 **launchd**로 5분마다 사이클을 실행하고, 대시보드를 상주시킨다.

| Label | 역할 | 주기 |
|---|---|---|
| `com.migmig.crypto-trader-cycle` | 5분마다 `run_cycle.sh` 실행 | `StartInterval` 300초 |
| `com.migmig.crypto-trader-dashboard` | Flask 대시보드(`app.py`) 상주 | `KeepAlive` true |

plist 위치: `~/Library/LaunchAgents/com.migmig.crypto-trader-*.plist`

```bash
# 상태 확인
launchctl list | grep crypto-trader

# 재시작 (설정 바꾼 뒤)
launchctl unload ~/Library/LaunchAgents/com.migmig.crypto-trader-cycle.plist
launchctl load   ~/Library/LaunchAgents/com.migmig.crypto-trader-cycle.plist

# 즉시 1회 실행
launchctl start com.migmig.crypto-trader-cycle

# 로그
tail -f logs/cron.log       # 사이클 로그
tail -f logs/dashboard.log  # 대시보드 로그
```

## 파일 구조

| 파일 | 역할 |
|---|---|
| `CLAUDE.md` | Claude Code 시스템 프롬프트 (전략, 규칙, 출력 형식) |
| `config.json` | 설정 (대상코인, 안전장치, 지표 파라미터) |
| `state.json` | 현재 상태 (현금, 보유코인) |
| `collector.py` | 업비트 시세/호가/캔들 수집 |
| `analyzer.py` | RSI, MACD, 볼린저밴드 등 기술지표 계산 |
| `executor.py` | 매매 실행 (시뮬/실전 전환 가능) |
| `run_cycle.sh` | 전체 사이클 실행 스크립트 |
| `trade_log.csv` | 거래 내역 |
| `performance.csv` | 일별 성과 기록 |

## 실전 전환

1. 업비트 API 키 발급
2. 환경변수 설정:
   ```bash
   export UPBIT_ACCESS_KEY="your-access-key"
   export UPBIT_SECRET_KEY="your-secret-key"
   ```
3. `executor.py`에서 `LIVE_MODE = True` 변경
4. `config.json`에서 `"mode": "live"` 변경

## 안전장치

- 1회 최대 매매: 보유 현금의 30%
- 총 손실 한도: -15% 도달 시 전량 매도
- 단일 코인 최대 비중: 50%
- 일일 최대 거래: 20회
- 최소 홀딩: 30분
- 매매마다 수수료 0.05% 반영
