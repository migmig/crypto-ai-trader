#!/usr/bin/env python3
"""AI 암호화폐 트레이더 - 웹 대시보드"""

import json
import csv
import os
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, jsonify, send_from_directory

BASE_DIR = Path(__file__).parent
DIST_DIR = BASE_DIR / "static" / "dist"
app = Flask(__name__, static_folder=str(DIST_DIR / "assets"), static_url_path="/assets")

pyupbit = None

def _get_pyupbit():
    global pyupbit
    if pyupbit is None:
        try:
            import pyupbit as _pu
            pyupbit = _pu
        except ImportError:
            pass
    return pyupbit


def load_json(filename):
    path = BASE_DIR / filename
    if path.exists():
        return json.loads(path.read_text())
    return None


def load_csv(filename):
    path = BASE_DIR / filename
    if not path.exists():
        return []
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def get_current_prices(markets):
    """현재가 조회 (pyupbit 또는 latest.json fallback)"""
    prices = {}
    pu = _get_pyupbit()
    try:
        if pu:
            for m in markets:
                p = pu.get_current_price(m)
                if p:
                    prices[m] = p
            if prices:
                return prices
    except Exception:
        pass
    # fallback
    data = load_json("market_data/latest.json")
    if data:
        for m in markets:
            mdata = data.get("markets", {}).get(m, {})
            ticker = mdata.get("ticker", {})
            if "trade_price" in ticker:
                prices[m] = ticker["trade_price"]
    return prices


@app.route("/")
@app.route("/history")
def index():
    return send_from_directory(str(DIST_DIR), "index.html")


@app.route("/favicon.svg")
def favicon():
    return send_from_directory(str(DIST_DIR), "favicon.svg", mimetype="image/svg+xml")


@app.route("/api/status")
def api_status():
    state = load_json("state.json") or {}
    config = load_json("config.json") or {}
    action = load_json("action.json") or {}
    data = load_json("market_data/latest.json") or {}

    # 현재가 조회
    holdings = state.get("holdings", {})
    markets = list(holdings.keys())
    all_markets = config.get("markets", [])
    prices = get_current_prices(all_markets)

    # 보유 코인 평가
    holdings_detail = []
    holdings_value = 0
    for market, h in holdings.items():
        if h.get("qty", 0) <= 0:
            continue
        current_price = prices.get(market, h.get("avg_price", 0))
        value = h["qty"] * current_price
        cost = h["qty"] * h.get("avg_price", 0)
        pl = value - cost
        pl_pct = (pl / cost * 100) if cost > 0 else 0
        holdings_value += value
        holdings_detail.append({
            "market": market,
            "coin": market.replace("KRW-", ""),
            "qty": h["qty"],
            "avg_price": h.get("avg_price", 0),
            "current_price": current_price,
            "value": round(value),
            "cost": round(cost),
            "pl": round(pl),
            "pl_pct": round(pl_pct, 2),
            "bought_at": h.get("bought_at", ""),
        })

    cash = state.get("cash", 0)
    total = cash + holdings_value
    initial = state.get("initial_capital", 10000000)
    total_pl = total - initial
    total_pl_pct = (total_pl / initial * 100) if initial > 0 else 0

    # 지금 즉시 전량 매도 시 순수령액 (현금 + 보유 평가 × (1 - 수수료율))
    fee_rate = float(config.get("fee_rate", 0.0005))
    liquidation_fee = holdings_value * fee_rate
    liquidation_value = cash + holdings_value - liquidation_fee
    liquidation_pl = liquidation_value - initial
    liquidation_pl_pct = (liquidation_pl / initial * 100) if initial > 0 else 0

    # 누적 수수료/거래량 집계 (trade_log.csv)
    all_trades = load_csv("trade_log.csv")
    total_fee = 0.0
    total_volume = 0.0
    buy_count = 0
    sell_count = 0
    for t in all_trades:
        try:
            total_fee += float(t.get("fee", 0) or 0)
            total_volume += float(t.get("amount_krw", 0) or 0)
            if t.get("action") == "buy":
                buy_count += 1
            elif t.get("action") == "sell":
                sell_count += 1
        except Exception:
            continue
    fee_pct = (total_fee / total_volume * 100) if total_volume > 0 else 0
    # 수수료가 손익에서 차지하는 비중 (손실 시에는 별 의미 없지만 정보성)
    fee_vs_initial_pct = (total_fee / initial * 100) if initial > 0 else 0

    # 시장 데이터 요약
    market_summary = []
    for m in all_markets:
        mdata = data.get("markets", {}).get(m, {})
        ticker = mdata.get("ticker", {})
        ind = mdata.get("indicators", {})
        market_summary.append({
            "market": m,
            "coin": m.replace("KRW-", ""),
            "price": prices.get(m, ticker.get("trade_price", 0)),
            "change_rate": ticker.get("signed_change_rate", 0),
            "volume_24h": ticker.get("acc_trade_price_24h", 0),
            "rsi_15m": ind.get("rsi_15m"),
            "rsi_1h": ind.get("rsi_1h"),
            "macd_hist": (ind.get("macd_15m") or {}).get("histogram"),
            "trend": ind.get("trend", "-"),
            "volume_ratio": ind.get("volume_ratio_15m"),
        })

    return jsonify({
        "cash": cash,
        "holdings_value": round(holdings_value),
        "total": round(total),
        "initial_capital": initial,
        "total_pl": round(total_pl),
        "total_pl_pct": round(total_pl_pct, 2),
        "liquidation_value": round(liquidation_value),
        "liquidation_pl": round(liquidation_pl),
        "liquidation_pl_pct": round(liquidation_pl_pct, 2),
        "liquidation_fee": round(liquidation_fee),
        "total_fee": round(total_fee),
        "total_volume": round(total_volume),
        "fee_pct": round(fee_pct, 3),
        "fee_vs_initial_pct": round(fee_vs_initial_pct, 2),
        "total_buy_count": buy_count,
        "total_sell_count": sell_count,
        "holdings": holdings_detail,
        "markets": market_summary,
        "total_trades_today": state.get("total_trades_today", 0),
        "last_trade_time": state.get("last_trade_time"),
        "last_action": {
            "source": action.get("source", ""),
            "market_summary": action.get("market_summary", ""),
            "risk_assessment": action.get("risk_assessment", ""),
            "actions": action.get("actions", []),
            "per_coin": action.get("per_coin", {}),
            "conditions_checked": action.get("conditions_checked", []),
            "triggers_next_cycle": action.get("triggers_next_cycle", []),
            "timestamp": action.get("timestamp", ""),
        },
        "collected_at": data.get("collected_at", ""),
        "analyzed_at": data.get("analyzed_at", ""),
    })


@app.route("/api/trades")
def api_trades():
    trades = load_csv("trade_log.csv")
    return jsonify(trades[-100:][::-1])  # 최근 100건, 최신순


@app.route("/api/performance")
def api_performance():
    perf = load_csv("performance.csv")
    return jsonify(perf[-500:])  # 최근 500건


@app.route("/api/judgments")
def api_judgments():
    """AI 판단 히스토리. SQLite 기반.
    쿼리 파라미터:
      offset, limit — 페이지네이션
      source — 'ai' | 'algo' (선택)
      filter — 'has_action' | 'hold_only' (선택)
      since, until — ISO timestamp 범위 (선택)
    """
    from flask import request
    from history_db import query_judgments
    offset = max(0, int(request.args.get("offset", 0)))
    limit = min(500, max(1, int(request.args.get("limit", 50))))
    source = request.args.get("source")
    f = request.args.get("filter")
    since = request.args.get("since")
    until = request.args.get("until")

    result = query_judgments(
        offset=offset,
        limit=limit,
        source=source if source in ("ai", "algo") else None,
        actions_only=(f == "has_action"),
        hold_only=(f == "hold_only"),
        since=since,
        until=until,
    )
    return jsonify(result)


@app.route("/api/judgments/stats")
def api_judgments_stats():
    """히스토리 전역 통계 (전체 수, AI/ALGO 분포, 액션 발생 수, 기간)."""
    from history_db import stats
    return jsonify(stats())


@app.route("/api/logs")
def api_logs():
    """사이클 로그 조회 (cron.log + 압축 아카이브)"""
    import gzip as gz
    logs_dir = BASE_DIR / "logs"
    lines = []

    # 1) 현재 cron.log
    current = logs_dir / "cron.log"
    if current.exists():
        try:
            lines.extend(current.read_text(errors="replace").splitlines())
        except Exception:
            pass

    # 2) gz 아카이브 (최근 3개)
    if len(lines) < 2000:
        archives = sorted(logs_dir.glob("cron_*.log.gz"), reverse=True)[:3]
        for arc in archives:
            try:
                with gz.open(arc, "rt", errors="replace") as f:
                    lines = f.read().splitlines() + lines
            except Exception:
                continue

    # 사이클 단위로 파싱
    cycles = []
    current_cycle = None
    for line in lines:
        if "사이클 시작:" in line:
            current_cycle = {"lines": [line], "timestamp": "", "status": "running"}
            # "AI 트레이더 사이클 시작: 2026-04-17 21:09:00"
            parts = line.split("사이클 시작:")
            if len(parts) > 1:
                current_cycle["timestamp"] = parts[1].strip()
        elif current_cycle is not None:
            current_cycle["lines"].append(line)
            if "사이클 완료:" in line:
                current_cycle["status"] = "ok"
                cycles.append(current_cycle)
                current_cycle = None
            elif "[ERROR]" in line or "Traceback" in line:
                current_cycle["status"] = "error"

    if current_cycle:
        cycles.append(current_cycle)

    # 최신순 200개, 각 사이클 본문은 결합
    cycles.reverse()
    result = []
    for c in cycles[:200]:
        # 요약 추출
        has_ai = any("Step 4: AI" in l for l in c["lines"])
        has_action = any("[SIM 매수]" in l or "[SIM 매도]" in l for l in c["lines"])
        has_hold = any("관망" in l for l in c["lines"])
        has_trailing = any("트레일링 손절" in l for l in c["lines"])
        has_stop = any("전체 손절" in l or "손절" in l for l in c["lines"] if "트레일링" not in l)

        tags = []
        if has_ai: tags.append("AI")
        if has_action: tags.append("TRADE")
        if has_trailing: tags.append("TRAILING")
        if has_stop: tags.append("STOPLOSS")
        if has_hold and not has_action: tags.append("HOLD")

        result.append({
            "timestamp": c["timestamp"],
            "status": c["status"],
            "tags": tags,
            "body": "\n".join(c["lines"]),
            "line_count": len(c["lines"]),
        })

    return jsonify(result)


@app.route("/logs")
@app.route("/charts")
@app.route("/simulations")
@app.route("/playground")
def spa_fallback():
    return send_from_directory(str(DIST_DIR), "index.html")


SIMULATIONS_DIR = BASE_DIR / "simulations"

_SIM_META = [
    {
        "id": "01_feb5_position",
        "title": "2/5 BTC 포지션 추적",
        "subtitle": "현재 룰이 하락 폭포수에서 어떻게 바닥에 손절하는가",
        "description": (
            "2026-02-05 00:00에 BTC ₩1M을 매수한 단일 포지션을 4/18까지 추적. "
            "각 룰 변형이 이 하나의 하락 사건을 어떻게 처리하는지 비교."
        ),
        "chart": None,
        "note": "현재 룰은 2/6 05:30 백스톱 발동으로 바닥권 매도. F2(익절+완화 백스톱)는 매도 0회로 단순 홀딩 복제.",
    },
    {
        "id": "02_mitigation_variants",
        "title": "완화안 11종 비교",
        "subtitle": "같은 포지션에 다양한 룰 적용 — 어느 조합이 효과 있나",
        "description": (
            "2/5 포지션에 백스톱 완화 / RSI 유예 / 부분 매도 / 익절 조건을 조합해 11종 룰 테스트. "
            "이 단계에서 'F2를 도입하면 된다'는 성급한 결론이 나올 뻔했음."
        ),
        "chart": "02_mitigation_variants.png",
        "note": "F시리즈가 홀딩(+2.92%)을 거의 완벽히 복제. 하지만 시뮬 03에서 이 결론이 뒤집힘.",
    },
    {
        "id": "03_multi_horizon",
        "title": "5개 시간 지평 비교",
        "subtitle": "단일 시나리오 튜닝의 함정 — 다른 시장 조건에서 뒤집힘",
        "description": (
            "30·60·90·120·150일 전 매수 시점에 같은 룰 적용. "
            "상승장(30/60일)에선 F시리즈 유리, 하락장(90~150일)에선 현재 룰이 -15%로 손실 제한."
        ),
        "chart": "03_multi_horizon_avg.png",
        "note": "현재 룰이 평균 -4.57%로 모든 변형안보다 우수. F2는 하락장에서 -25%까지 풀로 물림.",
    },
    {
        "id": "04_adaptive_sizing",
        "title": "적응형 매수 사이즈",
        "subtitle": "룰은 그대로, 신호 빈도에 따라 매수 비율만 조정",
        "description": (
            "₩10M 초기 자본 풀 백테스트. 매수 신호 빈도 n(최근 4시간)에 따라 사이즈 배수 조정. "
            "감쇠 전략 전부 실패, 역발상(빈도↑→사이즈↑)이 유일한 미세 우위."
        ),
        "chart": "04_adaptive_sizing.png",
        "note": "역발상 E가 평균 -0.82%로 승리하지만 현재 대비 +0.21%p로 개선 폭 작음. 실전 도입 전 추가 검증 필요.",
    },
    {
        "id": "09_cycle4h",
        "title": "4시간봉 신호 + 주기 비교 (최대 8년치)",
        "subtitle": "신호 기준을 4h로 당기면? 대신 체크 주기는 길게 가도 될까",
        "description": (
            "4시간봉 자체를 신호 프레임으로 채택한 경우. 코인당 최대 3000일(8.2년)치 4h 캔들로 시뮬. "
            "체크 주기 4/8/12/24/48h 비교. 일봉 대비 신호 빈도 6배 → 매매 횟수 급증."
        ),
        "chart": "09_cycle4h.png",
        "extra_tables": [
            {"title": "코인별 주기 상세", "csv": "09_cycle4h.csv"},
        ],
        "note": (
            "48시간 주기가 +113.17%로 최고 (최대낙폭 -27.82%). 24h도 +101%. "
            "그러나 4h(-52%)·8h(-52%) 낙폭이 극단적 — 4h 신호는 노이즈 과다로 과매매 유발. "
            "매수 횟수: 4h=2011회 vs 48h=345회. 주기가 길수록 노이즈 걸러냄. "
            "다만 직접 비교는 주의 — 각 코인 데이터 길이 다르고(8.2년~3년), 일봉 시뮬 08(+21%)과 다른 표본."
        ),
    },
    {
        "id": "08_cycle_freq",
        "title": "체크 주기 비교 (일봉 신호 + 15분 가격)",
        "subtitle": "일봉 기반인데 몇 분마다 체크하는 게 최적인가",
        "description": (
            "일봉 지표로 신호 계산 + 15분봉 가격으로 체결 + min_hold 24h 준수. "
            "체크 주기만 바꿔가며 (15m/30m/1h/2h/4h/8h/12h/24h) 효과 비교. "
            "2년치 × 10코인 × 8개 주기 = 80 백테스트."
        ),
        "chart": "08_cycle_freq.png",
        "extra_tables": [
            {"title": "코인별 주기 상세 (80행)", "csv": "08_cycle_freq.csv"},
        ],
        "note": (
            "8시간 주기가 최고 (+21.03%, 최대 낙폭 -14.38%). 현재 1시간(+16.04%) 대비 +5%p 개선. "
            "매수 횟수는 주기 무관 거의 동일(90~94회) — min_hold 24h가 제대로 작동 중. "
            "차이는 매도 타이밍·트레일링 반응 속도에서 발생. "
            "15분 주기도 생각보다 나쁘지 않음(+15.44%) — 과매매 안전장치가 작동. "
            "24시간은 반응 너무 느림(-19.78% 낙폭)."
        ),
    },
    {
        "id": "07_daily_horizons",
        "title": "일봉 기반 다중 지평 (15일 ~ 1080일)",
        "subtitle": "일봉으로 전환 후, 얼마나 긴 기간에 가장 좋은가",
        "description": (
            "시뮬 06에서 '일봉이 최선'이 드러남 → 이번엔 일봉으로 고정하고 지평만 바꿔 테스트. "
            "15/30/45/60/90/120/360/720/1080일 총 9개 지평 × 100룰 × 10코인 = 9,000 백테스트. "
            "최대 지평은 SUI 데이터 가용성(1081일)에 맞춰 1080일까지."
        ),
        "chart": "07_daily_horizons.png",
        "note": (
            "1080일(3년)에 현재 룰 +25.58%, 최적 룰 +45.55%. "
            "720일 +8.19% / +14.81%. 360일 -2.44% / +0.13%. "
            "짧은 지평(15~60일)은 일봉 신호 자체가 드물어 매매 거의 안 일어남(0.02%). "
            "긴 지평일수록 룰이 가치를 발휘 — 일봉은 '중장기' 프레임."
        ),
    },
    {
        "id": "06_interval_compare",
        "title": "캔들 인터벌 비교 (15m vs 1h vs 4h vs 1d)",
        "subtitle": "가장 중요한 결정은 룰 튜닝이 아니라 인터벌 선택이었다",
        "description": (
            "2년치 데이터를 15분 / 1시간 / 4시간 / 1일 캔들로 나눠 각각 100개 룰 그리드를 돌림. "
            "4 × 100 × 10 = 4,000 백테스트. 같은 매매 룰이 시간축에 따라 얼마나 달라지는지 측정."
        ),
        "chart": "06_interval_compare.png",
        "note": (
            "현재 룰을 15분봉에 쓸 때 -35.47%였던 게 1일봉으로 바꾸면 +9.61%로 45%p 반전. "
            "1일봉 최적 룰은 +16.70%. 15분봉은 노이즈 과다로 잦은 매매·수수료 누적이 주범. "
            "그동안 룰 완화/사이즈 조정에 쏟은 분석보다 '인터벌 변경' 한 번이 훨씬 큰 효과. "
            "다만 1일봉 운용은 실전 대응 속도가 느려지는 트레이드오프 있음 (급변 시 하루 뒤 반응)."
        ),
    },
    {
        "id": "05_grid_search",
        "title": "Go 그리드 서치 (2년치 × 10코인 × 100룰)",
        "subtitle": "대규모 파라미터 탐색 — 기간에 따라 최적 룰이 뒤집힘",
        "description": (
            "10개 코인 2년치 15분봉(코인당 70,080캔들)에 100가지 룰 조합을 모두 돌린 그리드 서치. "
            "Go 병렬 처리로 1,000 백테스트를 0.68초에 완료 (약 1,470 backtest/s). "
            "룰 그리드: backstop 5종 × trailing 4종 × min_profit 5종 = 100."
        ),
        "chart": "05_grid_top.png",
        "extra_charts": ["05_grid_per_coin.png"],
        "extra_tables": [
            {"title": "코인별 상세 (단순 홀딩 vs 현재 룰 vs 코인별 최적 룰)",
             "csv": "05_grid_per_coin.csv"},
        ],
        "note": (
            "현재 룰(backstop=-0.15, trailing=-0.07)은 73/100위, 평균 -35.47%. "
            "상위 룰 공통점: backstop 완화(-0.30) + trailing 느슨(-0.10) + min_profit 높음(+0.08) — 덜 매도하는 방향. "
            "XRP는 2년 홀딩 +190% 대상승 구간이라 현재 룰(-3.24%)이 이익 누름. "
            "BTC +18%, 나머지 알트 -30~-80%로 혼재. 기간에 따라 최적 룰이 극단적으로 달라져 단일 '정답' 없음."
        ),
    },
]


def _load_csv_rows(path: Path) -> list:
    rows = []
    if not path.exists():
        return rows
    with path.open() as f:
        for row in csv.DictReader(f):
            parsed = {}
            for k, v in row.items():
                try:
                    if v and v.replace(".", "", 1).replace("-", "", 1).isdigit():
                        parsed[k] = float(v)
                    else:
                        parsed[k] = v
                except Exception:
                    parsed[k] = v
            rows.append(parsed)
    return rows


@app.route("/api/simulations")
def api_simulations_list():
    """시뮬 목록 + 각 CSV를 JSON으로 변환."""
    result = []
    for meta in _SIM_META:
        # 기본 테이블: id에서 파일명 추론 — 별칭 있으면 그 쪽
        primary_csv = meta.get("primary_csv", f"{meta['id']}.csv")
        if meta["id"] == "05_grid_search":
            primary_csv = "05_grid_top.csv"
        elif meta["id"] == "08_cycle_freq":
            primary_csv = "08_cycle_freq_summary.csv"
        rows = _load_csv_rows(SIMULATIONS_DIR / "results" / primary_csv)
        extra_tables = []
        for t in meta.get("extra_tables", []):
            extra_tables.append({
                "title": t["title"],
                "rows": _load_csv_rows(SIMULATIONS_DIR / "results" / t["csv"]),
            })
        entry = {**meta, "rows": rows}
        if extra_tables:
            entry["extra_tables"] = extra_tables
        result.append(entry)
    return jsonify(result)


@app.route("/api/simulations/readme")
def api_simulations_readme():
    """README.md 원문."""
    readme = SIMULATIONS_DIR / "README.md"
    if readme.exists():
        return readme.read_text(encoding="utf-8"), 200, {"Content-Type": "text/plain; charset=utf-8"}
    return "", 404


@app.route("/simulations/charts/<path:filename>")
def sim_chart(filename):
    """차트 PNG 직접 서빙."""
    return send_from_directory(str(SIMULATIONS_DIR / "charts"), filename)


# ─────────────────────────────────────────────────────
# Playground proxy — Go 서버(127.0.0.1:5051)로 포워딩
# ─────────────────────────────────────────────────────
_PLAYGROUND_BASE = "http://127.0.0.1:5051"


@app.route("/api/playground/<path:subpath>", methods=["GET", "POST"])
def api_playground_proxy(subpath):
    import urllib.request
    import urllib.error
    from flask import request, Response
    url = f"{_PLAYGROUND_BASE}/{subpath}"
    try:
        if request.method == "POST":
            body = request.get_data()
            req = urllib.request.Request(url, data=body, method="POST",
                                         headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as r:
            return Response(r.read(), status=r.status,
                            content_type=r.headers.get("Content-Type", "application/json"))
    except urllib.error.URLError as e:
        return jsonify({"error": f"playground server unreachable: {e}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reset", methods=["POST"])
def api_reset():
    """계좌 상태 + 거래/판단 이력 초기화. 백업은 backups/ 하위로 이동.
    실제 매매에는 영향 없음 (시뮬레이션 모드 기준). 데이터 캐시·시뮬 결과는 보존."""
    import shutil
    from flask import request
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = BASE_DIR / "backups" / f"manual_{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)

    moved = []
    targets = [
        "state.json", "trade_log.csv", "performance.csv",
        "history.db", "history.db-journal",
        "action.json", "signals.json",
    ]
    for t in targets:
        p = BASE_DIR / t
        if p.exists():
            shutil.move(str(p), str(backup_dir / t))
            moved.append(t)

    # action_history 디렉터리: 전체 파일 백업 후 비움
    ahp = BASE_DIR / "action_history"
    if ahp.exists() and any(ahp.iterdir()):
        shutil.move(str(ahp), str(backup_dir / "action_history"))
        ahp.mkdir(parents=True, exist_ok=True)
        moved.append("action_history/")

    # 로그: 용량 큰 것만 비움 (압축본은 백업)
    logs_dir = BASE_DIR / "logs"
    if logs_dir.exists():
        (backup_dir / "logs").mkdir(exist_ok=True)
        for log in ["cron.log", "collect.log", "dashboard.log"]:
            lp = logs_dir / log
            if lp.exists():
                shutil.move(str(lp), str(backup_dir / "logs" / log))
                moved.append(f"logs/{log}")
        # gz 파일도 백업 디렉터리로 이동
        for gz in logs_dir.glob("*.log.gz"):
            shutil.move(str(gz), str(backup_dir / "logs" / gz.name))
            moved.append(f"logs/{gz.name}")

    # 새 state.json — 초기 자본만 설정
    initial_cap = 10_000_000
    try:
        cfg = json.loads((BASE_DIR / "config.json").read_text())
        initial_cap = cfg.get("initial_capital", initial_cap)
    except Exception:
        pass
    (BASE_DIR / "state.json").write_text(json.dumps({
        "initial_capital": initial_cap,
        "cash": initial_cap,
        "holdings": {},
        "total_trades_today": 0,
        "last_trade_time": None,
        "today_date": None,
        "created_at": datetime.now().isoformat(),
    }, ensure_ascii=False, indent=2))

    return jsonify({
        "ok": True,
        "backup": str(backup_dir.relative_to(BASE_DIR)),
        "moved": moved,
        "initial_capital": initial_cap,
    })


@app.route("/api/chart/coin/<market>")
def api_chart_coin(market):
    """코인별 차트: pyupbit 캔들 + 우리 매매 내역 오버레이.
    ?interval=minute15|minute30|minute60|minute240|day (default minute60)
    &count=200 (default)
    """
    from flask import request
    interval = request.args.get("interval", "minute60")
    if interval not in ("minute15", "minute30", "minute60", "minute240", "day"):
        interval = "minute60"
    try:
        count = min(500, max(10, int(request.args.get("count", 200))))
    except ValueError:
        count = 200

    pu = _get_pyupbit()
    candles = []
    if pu:
        try:
            df = pu.get_ohlcv(market, interval=interval, count=count)
            if df is not None:
                for ts, row in df.iterrows():
                    candles.append({
                        "t": ts.isoformat(),
                        "o": float(row["open"]),
                        "h": float(row["high"]),
                        "l": float(row["low"]),
                        "c": float(row["close"]),
                        "v": float(row["volume"]),
                    })
        except Exception as e:
            return jsonify({"error": str(e), "candles": [], "trades": []}), 500

    # 매매 내역 오버레이 (해당 코인, 캔들 범위 내)
    trades = []
    if candles:
        since = candles[0]["t"]
        trade_rows = load_csv("trade_log.csv")
        for t in trade_rows:
            if t.get("market") != market:
                continue
            if t.get("timestamp", "") < since:
                continue
            try:
                trades.append({
                    "t": t["timestamp"],
                    "action": t.get("action", ""),
                    "price": float(t.get("price", 0)),
                    "qty": float(t.get("qty", 0)),
                    "amount": float(t.get("amount_krw", 0)),
                })
            except Exception:
                continue

    return jsonify({
        "market": market,
        "interval": interval,
        "candles": candles,
        "trades": trades,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
