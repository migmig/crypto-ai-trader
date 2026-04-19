# ─────────────────────────────────────────────────
# AI 암호화폐 자동투자 시뮬레이터 — Makefile
# ─────────────────────────────────────────────────
# `make help` 로 전체 타겟 확인.
# ─────────────────────────────────────────────────

.DEFAULT_GOAL := help
SHELL := /bin/zsh

ROOT      := $(shell pwd)
VENV      := $(ROOT)/venv
PY        := $(VENV)/bin/python3
PIP       := $(VENV)/bin/pip
FRONTEND  := $(ROOT)/frontend
SIM       := $(ROOT)/simulations
GO_GRID   := $(SIM)/go-grid
GO_CF     := $(SIM)/go-cyclefreq
GO_C4H    := $(SIM)/go-cycle4h
GO_LS     := $(SIM)/go-longshort
GO_SRV    := $(SIM)/go-server

LAUNCHD   := $(HOME)/Library/LaunchAgents
DAEMONS   := com.migmig.crypto-trader-collect \
             com.migmig.crypto-trader-cycle \
             com.migmig.crypto-trader-dashboard \
             com.migmig.crypto-trader-playground

# ─── 색상 ────────────────────────────────────
C_RESET := \033[0m
C_BOLD  := \033[1m
C_CYAN  := \033[36m
C_GREEN := \033[32m
C_YELLOW:= \033[33m

# ─────────────────────────────────────────────────
# help — 기본 타겟
# ─────────────────────────────────────────────────
.PHONY: help
help: ## 이 목록 출력
	@printf "$(C_BOLD)AI 암호화폐 자동투자 시뮬레이터$(C_RESET)\n\n"
	@printf "$(C_CYAN)사용법:$(C_RESET) make <target>\n\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_.-]+:.*?## / { \
		printf "  $(C_GREEN)%-22s$(C_RESET) %s\n", $$1, $$2 \
	}' $(MAKEFILE_LIST)

# ─────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────
.PHONY: install
install: install-py install-frontend install-go ## 전체 의존성 설치 (Python venv + npm + Go)
	@printf "$(C_GREEN)✅ 설치 완료$(C_RESET)\n"

.PHONY: install-py
install-py: ## Python venv + 패키지
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) install -q --upgrade pip
	@$(PIP) install -q pyupbit pandas numpy matplotlib flask supabase
	@printf "$(C_CYAN)→ Python:$(C_RESET) $(VENV)\n"

.PHONY: install-frontend
install-frontend: ## npm install (프런트엔드)
	@cd $(FRONTEND) && npm install --silent
	@printf "$(C_CYAN)→ Frontend:$(C_RESET) node_modules ready\n"

.PHONY: install-go
install-go: ## Go 백테스트 바이너리 4종 빌드
	@cd $(GO_GRID) && go build -o go-grid .
	@cd $(GO_CF) && go build -o go-cyclefreq .
	@cd $(GO_C4H) && go build -o go-cycle4h .
	@cd $(GO_LS) && go build -o go-longshort .
	@cd $(GO_SRV) && go build -o go-server .
	@printf "$(C_CYAN)→ Go binaries:$(C_RESET) 5개 빌드 완료\n"

.PHONY: env
env: ## .env 템플릿 복사 (기존 없을 때만)
	@test -f .env || cp .env.example .env
	@test -f $(FRONTEND)/.env.local || printf "VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n" > $(FRONTEND)/.env.local
	@printf "$(C_YELLOW)→ .env / frontend/.env.local 확인/편집 필요$(C_RESET)\n"

# ─────────────────────────────────────────────────
# Build / Run
# ─────────────────────────────────────────────────
.PHONY: build
build: ## 프런트엔드 빌드 → static/dist
	@cd $(FRONTEND) && npm run build

.PHONY: dev-frontend
dev-frontend: ## vite 개발 서버 (hot reload)
	@cd $(FRONTEND) && npm run dev

.PHONY: run-cycle
run-cycle: ## 매매 사이클 1회 수동 실행
	@bash run_cycle.sh

.PHONY: run-collect
run-collect: ## 데이터 수집 1회 수동 실행
	@bash run_collect.sh

# ─────────────────────────────────────────────────
# Simulations
# ─────────────────────────────────────────────────
.PHONY: sim-01
sim-01: ## 2/5 BTC 포지션
	@cd $(SIM)/scripts && $(PY) 01_feb5_position.py

.PHONY: sim-02
sim-02: ## 완화안 11종
	@cd $(SIM)/scripts && $(PY) 02_mitigation_variants.py

.PHONY: sim-03
sim-03: ## 다중 지평 (30/60/90/120/150일)
	@cd $(SIM)/scripts && $(PY) 03_multi_horizon.py

.PHONY: sim-04
sim-04: ## 적응형 사이즈
	@cd $(SIM)/scripts && $(PY) 04_adaptive_sizing.py

.PHONY: sim-05
sim-05: ## Go 그리드 (100룰)
	@cd $(GO_GRID) && ./go-grid

.PHONY: sim-06
sim-06: ## 인터벌 비교 (15m/1h/4h/1d)
	@cd $(SIM)/scripts && $(PY) 06_interval_compare.py

.PHONY: sim-07
sim-07: ## 일봉 다중 지평 (15~1080일)
	@cd $(SIM)/scripts && $(PY) 07_daily_horizons.py

.PHONY: sim-08
sim-08: ## 체크 주기 비교 (일봉 + 15m 체결)
	@cd $(GO_CF) && ./go-cyclefreq

.PHONY: sim-09
sim-09: ## 4시간봉 주기 비교
	@cd $(GO_C4H) && ./go-cycle4h

.PHONY: sim-10
sim-10: ## 공매도 포함 (8년)
	@cd $(GO_LS) && ./go-longshort

.PHONY: sim-11
sim-11: ## 공매도 × 5지평
	@cd $(SIM)/scripts && $(PY) 11_longshort_horizons.py

.PHONY: sims-charts
sims-charts: ## 모든 시뮬 차트 PNG 재생성
	@cd $(SIM)/scripts && $(PY) make_charts.py

.PHONY: sims-all
sims-all: sim-01 sim-02 sim-03 sim-04 sim-05 sim-06 sim-07 sim-08 sim-09 sim-10 sim-11 sims-charts ## 모든 시뮬 순차 실행

# ─────────────────────────────────────────────────
# Data
# ─────────────────────────────────────────────────
.PHONY: data-day
data-day: ## 일봉 데이터 캐시 (3500일)
	@cd $(SIM)/scripts && $(PY) 05_fetch_year_data.py --days 3500 --interval day

.PHONY: data-4h
data-4h: ## 4시간봉 데이터 캐시 (3000일)
	@cd $(SIM)/scripts && $(PY) 05_fetch_year_data.py --days 3000 --interval minute240

.PHONY: data-1h
data-1h: ## 1시간봉 데이터 캐시 (730일)
	@cd $(SIM)/scripts && $(PY) 05_fetch_year_data.py --days 730 --interval minute60

.PHONY: data-30m
data-30m: ## 30분봉 데이터 캐시 (730일)
	@cd $(SIM)/scripts && $(PY) 05_fetch_year_data.py --days 730 --interval minute30

.PHONY: data-15m
data-15m: ## 15분봉 데이터 캐시 (730일)
	@cd $(SIM)/scripts && $(PY) 05_fetch_year_data.py --days 730 --interval minute15

.PHONY: data-all
data-all: data-day data-4h data-1h data-30m data-15m ## 전체 인터벌 데이터 받기

# ─────────────────────────────────────────────────
# Supabase
# ─────────────────────────────────────────────────
.PHONY: db-push
db-push: ## 보류 중인 migration 원격 DB에 적용
	@supabase db push

.PHONY: db-migrate-local
db-migrate-local: ## 로컬 CSV/JSON/SQLite → Postgres 이주
	@$(PY) db.py --migrate

.PHONY: db-state
db-state: ## Postgres state 테이블 현황
	@$(PY) db.py --state

.PHONY: func-deploy
func-deploy: ## Edge Function 'summary' 배포
	@supabase functions deploy summary --no-verify-jwt

# ─────────────────────────────────────────────────
# Daemons (launchd)
# ─────────────────────────────────────────────────
.PHONY: daemons-status
daemons-status: ## launchd 서비스 상태 확인
	@launchctl list | grep crypto-trader || echo "(no daemons loaded)"

.PHONY: daemons-reload
daemons-reload: ## 모든 daemon unload → load
	@for d in $(DAEMONS); do \
		launchctl unload $(LAUNCHD)/$$d.plist 2>/dev/null || true; \
		launchctl load $(LAUNCHD)/$$d.plist 2>/dev/null && echo "  ✓ $$d"; \
	done

.PHONY: daemons-stop
daemons-stop: ## 모든 daemon 중단
	@for d in $(DAEMONS); do \
		launchctl unload $(LAUNCHD)/$$d.plist 2>/dev/null && echo "  ✓ unloaded $$d"; \
	done

.PHONY: daemons-start
daemons-start: ## 모든 daemon 시작
	@for d in $(DAEMONS); do \
		launchctl load $(LAUNCHD)/$$d.plist 2>/dev/null && echo "  ✓ loaded $$d"; \
	done

.PHONY: logs
logs: ## 사이클 로그 tail
	@tail -f logs/cron.log logs/collect.log 2>/dev/null

.PHONY: logs-dashboard
logs-dashboard: ## 대시보드 로그 tail
	@tail -f logs/dashboard.log 2>/dev/null

.PHONY: logs-playground
logs-playground: ## Go playground 서버 로그 tail
	@tail -f logs/playground.log 2>/dev/null

# ─────────────────────────────────────────────────
# State / Reset
# ─────────────────────────────────────────────────
.PHONY: reset
reset: ## 계좌·이력·로그 초기화 (백업 후)
	@STAMP=$$(date +%Y%m%d_%H%M%S); \
	DIR=backups/make_reset_$$STAMP; \
	mkdir -p $$DIR; \
	for f in state.json trade_log.csv performance.csv history.db history.db-journal action.json signals.json; do \
		[ -f $$f ] && mv $$f $$DIR/ && echo "  ✓ $$f → $$DIR/"; \
	done; \
	[ -d action_history ] && mv action_history $$DIR/ && mkdir action_history; \
	printf '{"initial_capital":10000000,"cash":10000000,"holdings":{},"total_trades_today":0,"last_trade_time":null,"today_date":null,"created_at":"%s"}' "$$(date -u +%Y-%m-%dT%H:%M:%SZ)" > state.json; \
	echo "  ✓ state.json 재생성"

.PHONY: clean
clean: ## Python 캐시·빌드 산출물 정리 (데이터/state 보존)
	@find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@rm -f $(GO_GRID)/go-grid $(GO_CF)/go-cyclefreq $(GO_C4H)/go-cycle4h $(GO_LS)/go-longshort $(GO_SRV)/go-server
	@printf "$(C_GREEN)✅ clean$(C_RESET)\n"

# ─────────────────────────────────────────────────
# Git helpers
# ─────────────────────────────────────────────────
.PHONY: status
status: ## git status + launchd + 포트
	@echo "── git ──"; git status -sb | head -20
	@echo; echo "── daemons ──"; launchctl list | grep crypto-trader || echo "(none)"
	@echo; echo "── ports ──"; lsof -iTCP:5050 -sTCP:LISTEN -P 2>/dev/null | tail -1 || echo "5050 free"; \
		lsof -iTCP:5051 -sTCP:LISTEN -P 2>/dev/null | tail -1 || echo "5051 free"
