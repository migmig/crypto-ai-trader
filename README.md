# 🤖 AI 암호화폐 자동투자 시뮬레이터

Claude Code를 AI 투자 판단 엔진으로 사용하는 암호화폐 자동매매 시뮬레이터.

## 빠른 시작

```bash
# 1. 의존성 설치
pip install pyupbit --break-system-packages

# 2. 수동 1사이클 실행
cd ~/crypto-ai-trader
python3 collector.py        # 데이터 수집
python3 analyzer.py         # 지표 계산
# Claude Code가 판단
claude -p "market_data/latest.json과 state.json을 읽고 CLAUDE.md 규칙에 따라 매매 판단 후 action.json 저장" --dangerously-skip-permissions
python3 executor.py         # 시뮬레이션 매매 실행

# 3. 또는 한방에 실행
bash run_cycle.sh

# 4. 자동화 (5분마다)
crontab -e
# 아래 줄 추가:
# */5 * * * * cd ~/crypto-ai-trader && bash run_cycle.sh >> logs/cron.log 2>&1
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
