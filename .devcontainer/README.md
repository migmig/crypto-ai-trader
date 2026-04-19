# devcontainer / Codespaces

이 레포는 GitHub Codespaces에서 바로 열어 개발·편집할 수 있습니다.

## 처음 여는 법

1. GitHub 레포 페이지 → **Code** 버튼 → **Codespaces** 탭 → **Create codespace on main**
2. 초기 빌드 ~3-5분 (Python + Node + Go + Supabase CLI + 프런트/Go 빌드)
3. 완료되면 VS Code in browser 가 열리고 `post-create.sh`가 자동 실행됨

## 포트 포워딩 (자동)

| 포트 | 용도 | 자동 동작 |
|---|---|---|
| 5050 | Flask Dashboard (`app.py`) | openPreview |
| 5051 | Go Playground Server | silent |
| 5173 | Vite Dev Server (`make dev-frontend`) | openBrowser |

## Codespaces Secrets 설정

민감 환경변수는 Codespace에 심어야 `remoteEnv`로 자동 주입됩니다.

**GitHub → Settings → Codespaces → Repository secrets** 에서:

| Name | 값 |
|---|---|
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` (anon JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role JWT |
| `SUPABASE_ACCESS_TOKEN` | `sbp_...` (PAT, CLI 명령용) |
| `ANTHROPIC_API_KEY` | Claude API 키 (선택) |

설정 후 codespace 재빌드 또는 `Rebuild container`.

## 자주 쓰는 명령 (Makefile)

```bash
make help             # 전체 타겟
make data-day         # 일봉 데이터 받기
make dev-frontend     # Vite dev 서버
make run-cycle        # 매매 사이클 1회 수동 실행
make sims-all         # 전체 시뮬 돌리기
make db-push          # Supabase migration 적용
make func-deploy      # Edge Function 배포
```

## 주의: launchd 미작동

macOS launchd는 Codespaces(Linux)에서 안 돌아갑니다. 즉 **자동 2분 수집 / 8시간 매매 사이클은 로컬 Mac에서만 작동**.

Codespaces에서 "운영"하려면 대안:

- GitHub Actions workflow (`.github/workflows/cycle.yml`)로 스케줄 실행
- Supabase scheduled function (beta)
- 외부 cron 서비스 (cron-job.org 등)로 Edge Function 호출

**이 레포는 기본적으로 개인용 시뮬레이터이니 Codespaces는 '개발 환경'으로만 쓰는 걸 권장합니다.**

## 수동 확인

devcontainer 세팅이 정상인지:

```bash
python3 --version           # 3.13
node --version              # lts
go version                  # 1.24
supabase --version
which make
ls venv/bin/python3         # 있어야 함
ls frontend/node_modules/   # 있어야 함
ls simulations/go-grid/go-grid  # 빌드됨
```
