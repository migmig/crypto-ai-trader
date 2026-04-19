#!/usr/bin/env bash
# Codespaces / devcontainer 생성 후 1회 실행.
# Python venv + npm + Go 바이너리 + Supabase CLI 세팅.
set -euo pipefail

say() { printf "\033[36m==>\033[0m %s\n" "$*"; }
ok()  { printf "\033[32m✓\033[0m %s\n" "$*"; }

# ─── Supabase CLI (Go binary, apt 패키지로 미제공) ────────────
if ! command -v supabase >/dev/null 2>&1; then
  say "Supabase CLI 설치 중"
  SB_VERSION=$(curl -s https://api.github.com/repos/supabase/cli/releases/latest | grep -oE '"tag_name": "v[^"]+' | cut -d\" -f4 | sed 's/^v//')
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) SB_ARCH="amd64" ;;
    aarch64|arm64) SB_ARCH="arm64" ;;
    *) SB_ARCH="amd64" ;;
  esac
  curl -fsSL "https://github.com/supabase/cli/releases/download/v${SB_VERSION}/supabase_linux_${SB_ARCH}.tar.gz" -o /tmp/supabase.tar.gz
  tar -xzf /tmp/supabase.tar.gz -C /tmp
  sudo mv /tmp/supabase /usr/local/bin/supabase
  rm -f /tmp/supabase.tar.gz
  ok "supabase $(supabase --version)"
fi

# ─── Python venv + deps ──────────────────────────────────
say "Python venv + 패키지"
if [ ! -d venv ]; then
  python3 -m venv venv
fi
./venv/bin/pip install --quiet --upgrade pip
./venv/bin/pip install --quiet pyupbit pandas numpy matplotlib flask supabase
ok "venv/bin/python3"

# ─── Frontend ─────────────────────────────────────────────
say "Frontend npm install"
(cd frontend && npm install --silent --no-fund --no-audit)
ok "frontend/node_modules"

# ─── Go binaries (5개) ────────────────────────────────────
say "Go 백테스트 바이너리 빌드"
for d in simulations/go-grid simulations/go-cyclefreq simulations/go-cycle4h \
         simulations/go-longshort simulations/go-server; do
  (cd "$d" && go build -o "$(basename "$d")" .)
  ok "$d"
done

# ─── .env 템플릿 (없으면 복사, 있으면 유지) ────────────────────
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  ok ".env 생성 — Codespaces Secrets 로 SUPABASE_* 설정 권장"
fi
if [ ! -f frontend/.env.local ]; then
  cat > frontend/.env.local <<'EOF'
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
EOF
  ok "frontend/.env.local 템플릿"
fi

# ─── data / logs 디렉터리 ────────────────────────────────
mkdir -p logs simulations/data market_data action_history

echo
echo "─────────────────────────────────────────────"
echo "✅ devcontainer 세팅 완료"
echo "─────────────────────────────────────────────"
echo "주요 명령:"
echo "  make help                 — 전체 타겟 목록"
echo "  make data-day             — 일봉 2년치 받기"
echo "  make run-cycle            — 매매 사이클 1회"
echo "  make dev-frontend         — vite dev (포트 5173)"
echo "  bash run_collect.sh       — 데이터 수집 1회"
echo
echo "주의:"
echo "  - launchd(macOS 전용) 없이 주기 실행 필요 시 GitHub Actions/외부 cron 사용"
echo "  - Codespaces Secrets: Settings → Codespaces → Repository secrets"
echo "─────────────────────────────────────────────"
