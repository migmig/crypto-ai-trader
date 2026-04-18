"""시뮬 결과 CSV들을 읽어 매트플롯립 차트 PNG로 저장."""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
CHARTS = ROOT / "charts"
CHARTS.mkdir(parents=True, exist_ok=True)

plt.rcParams["axes.grid"] = True
plt.rcParams["grid.alpha"] = 0.25
plt.rcParams["axes.spines.top"] = False
plt.rcParams["axes.spines.right"] = False
# 한글 폰트 (mac 기본)
for f in ["AppleGothic", "NanumGothic", "Apple SD Gothic Neo"]:
    try:
        plt.rcParams["font.family"] = f
        break
    except Exception:
        pass
plt.rcParams["axes.unicode_minus"] = False


def chart_02_mitigation():
    df = pd.read_csv(RESULTS / "02_mitigation_variants.csv")
    df = df.sort_values("pnl_pct")
    fig, ax = plt.subplots(figsize=(10, 6))
    colors = ["#10b981" if v >= 0 else ("#f59e0b" if v > -10 else "#ef4444") for v in df["pnl_pct"]]
    ax.barh(df["variant"], df["pnl_pct"], color=colors)
    ax.axvline(0, color="#374151", linewidth=0.8)
    ax.set_xlabel("수익률 (%)")
    ax.set_title("시뮬 02 — 2/5 BTC 포지션 완화안 비교 (단일 포지션)")
    for i, v in enumerate(df["pnl_pct"]):
        ax.text(v + (0.3 if v >= 0 else -0.3), i, f"{v:+.1f}%",
                va="center", ha="left" if v >= 0 else "right", fontsize=9)
    plt.tight_layout()
    out = CHARTS / "02_mitigation_variants.png"
    plt.savefig(out, dpi=140)
    plt.close()
    print(f"  → {out.name}")


def chart_03_horizon():
    df = pd.read_csv(RESULTS / "03_multi_horizon.csv")
    horizons = [c for c in df.columns if c.startswith("d") and c[1:].isdigit()]
    h_labels = [c[1:] + "일" for c in horizons]

    fig, ax = plt.subplots(figsize=(11, 6))
    x = range(len(horizons))
    width = 0.8 / len(df)
    for i, row in df.iterrows():
        values = [row[h] for h in horizons]
        offset = (i - (len(df) - 1) / 2) * width
        xs = [xi + offset for xi in x]
        color = "#60a5fa"
        if row["variant"] == "단순 홀딩":
            color = "#9ca3af"
        elif row["variant"] == "현재 룰 (-15% 전량)":
            color = "#10b981"
        elif "F2" in row["variant"]:
            color = "#f59e0b"
        ax.bar(xs, values, width, label=row["variant"], color=color, alpha=0.85)

    ax.axhline(0, color="#374151", linewidth=0.8)
    ax.set_xticks(list(x))
    ax.set_xticklabels(h_labels)
    ax.set_ylabel("수익률 (%)")
    ax.set_title("시뮬 03 — 지평별 룰 성능 (단일 포지션, BTC 150일)")
    ax.legend(loc="lower left", fontsize=8, ncol=2)
    plt.tight_layout()
    out = CHARTS / "03_multi_horizon.png"
    plt.savefig(out, dpi=140)
    plt.close()
    print(f"  → {out.name}")


def chart_03_avg():
    df = pd.read_csv(RESULTS / "03_multi_horizon.csv")
    df = df.sort_values("avg")
    fig, ax = plt.subplots(figsize=(9, 5))
    colors = ["#10b981" if v >= 0 else ("#f59e0b" if v > -5 else "#ef4444") for v in df["avg"]]
    ax.barh(df["variant"], df["avg"], color=colors)
    ax.axvline(0, color="#374151", linewidth=0.8)
    ax.set_xlabel("5개 지평 평균 수익률 (%)")
    ax.set_title("시뮬 03 — 전 구간 평균 (정렬: 나쁜 순 → 좋은 순)")
    for i, v in enumerate(df["avg"]):
        ax.text(v + (0.1 if v >= 0 else -0.1), i, f"{v:+.2f}%",
                va="center", ha="left" if v >= 0 else "right", fontsize=9)
    plt.tight_layout()
    out = CHARTS / "03_multi_horizon_avg.png"
    plt.savefig(out, dpi=140)
    plt.close()
    print(f"  → {out.name}")


def chart_05_grid_top():
    df = pd.read_csv(RESULTS / "05_grid_top.csv")
    df = df.head(20)  # 상위 20만
    fig, ax = plt.subplots(figsize=(10, 7))
    # 색상: 현재 룰 노란색, 상위권 녹색
    colors = []
    for _, r in df.iterrows():
        if "현재" in str(r.get("backstop_pct", "")):
            colors.append("#f59e0b")
        else:
            colors.append("#10b981" if r["avg_pnl_pct"] > -20 else "#ef4444")
    labels = [f"#{int(r['rank']):>3} b{r['backstop_pct']} t{r['trailing_pct']} mp{r['min_profit']}"
              for _, r in df.iterrows()]
    ax.barh(labels, df["avg_pnl_pct"], color=colors)
    ax.axvline(0, color="#374151", linewidth=0.8)
    ax.set_xlabel("평균 수익률 (%) — 10개 코인")
    ax.set_title("시뮬 05 — Go 그리드 서치 상위 20 룰 (1년치, 10 코인 × 100 룰 = 1000 백테스트)")
    ax.invert_yaxis()
    for i, v in enumerate(df["avg_pnl_pct"]):
        ax.text(v - 0.3, i, f"{v:+.1f}%", va="center", ha="right", fontsize=8, color="white")
    plt.tight_layout()
    out = CHARTS / "05_grid_top.png"
    plt.savefig(out, dpi=140)
    plt.close()
    print(f"  → {out.name}")


def chart_05_per_coin():
    df = pd.read_csv(RESULTS / "05_grid_per_coin.csv")
    coins = [c.replace("KRW-", "") for c in df["coin"]]
    x = range(len(coins))
    width = 0.26
    fig, ax = plt.subplots(figsize=(11, 6))
    ax.bar([xi - width for xi in x], df["hold_pnl_pct"], width, label="단순 홀딩", color="#9ca3af")
    ax.bar(list(x), df["current_rule_pnl_pct"], width, label="현재 룰", color="#f59e0b")
    ax.bar([xi + width for xi in x], df["best_rule_pnl_pct"], width, label="코인별 최적 룰", color="#10b981")
    ax.axhline(0, color="#374151", linewidth=0.8)
    ax.set_xticks(list(x))
    ax.set_xticklabels(coins, rotation=30)
    ax.set_ylabel("수익률 (%)")
    ax.set_title("시뮬 05 — 코인별 비교: 단순 홀딩 vs 현재 룰 vs 최적 룰 (1년치)")
    ax.legend(loc="lower right")
    for i, (h, c, b) in enumerate(zip(df["hold_pnl_pct"], df["current_rule_pnl_pct"], df["best_rule_pnl_pct"])):
        for xi, v in [(i - width, h), (i, c), (i + width, b)]:
            ax.text(xi, v + (1 if v >= 0 else -1), f"{v:+.0f}", ha="center",
                    va="bottom" if v >= 0 else "top", fontsize=7, color="#d1d5db")
    plt.tight_layout()
    out = CHARTS / "05_grid_per_coin.png"
    plt.savefig(out, dpi=140)
    plt.close()
    print(f"  → {out.name}")


def chart_04_sizing():
    df = pd.read_csv(RESULTS / "04_adaptive_sizing.csv")
    df = df.sort_values("avg")
    fig, ax = plt.subplots(figsize=(9, 5))
    colors = ["#ef4444" if v < -1.5 else ("#f59e0b" if v < -1 else "#10b981") for v in df["avg"]]
    ax.barh(df["strategy"], df["avg"], color=colors)
    ax.axvline(0, color="#374151", linewidth=0.8)
    ax.set_xlabel("5개 지평 평균 수익률 (%)")
    ax.set_title("시뮬 04 — 적응형 사이즈 전략 (풀 백테스트, ₩10M 초기)")
    for i, v in enumerate(df["avg"]):
        ax.text(v + (0.05 if v >= 0 else -0.05), i, f"{v:+.2f}%",
                va="center", ha="left" if v >= 0 else "right", fontsize=9)
    plt.tight_layout()
    out = CHARTS / "04_adaptive_sizing.png"
    plt.savefig(out, dpi=140)
    plt.close()
    print(f"  → {out.name}")


def chart_06_interval_compare():
    df = pd.read_csv(RESULTS / "06_interval_compare.csv")
    intervals = df["label"].tolist()
    x = range(len(intervals))
    width = 0.4
    fig, ax = plt.subplots(figsize=(10, 5.5))
    # avg_pnl는 문자열로 %가 없음 (숫자)
    ax.bar([xi - width/2 for xi in x], df["best_avg_pnl"].astype(float), width,
           label="최적 룰 평균", color="#10b981")
    ax.bar([xi + width/2 for xi in x], df["current_rule_avg_pnl"].astype(float), width,
           label="현재 룰 평균", color="#f59e0b")
    ax.axhline(0, color="#374151", linewidth=0.8)
    ax.set_xticks(list(x))
    ax.set_xticklabels(intervals)
    ax.set_ylabel("10코인 평균 수익률 (%)")
    ax.set_title("시뮬 06 — 인터벌별 최적 룰 vs 현재 룰 (2년치 × 10코인 × 100룰)")
    ax.legend()
    for i, (b, c) in enumerate(zip(df["best_avg_pnl"].astype(float), df["current_rule_avg_pnl"].astype(float))):
        ax.text(i - width/2, b + (1 if b >= 0 else -1), f"{b:+.1f}%", ha="center",
                va="bottom" if b >= 0 else "top", fontsize=9, color="#d1d5db")
        ax.text(i + width/2, c + (1 if c >= 0 else -1), f"{c:+.1f}%", ha="center",
                va="bottom" if c >= 0 else "top", fontsize=9, color="#d1d5db")
    plt.tight_layout()
    out = CHARTS / "06_interval_compare.png"
    plt.savefig(out, dpi=140)
    plt.close()
    print(f"  → {out.name}")


if __name__ == "__main__":
    for fn in [chart_02_mitigation, chart_03_horizon, chart_03_avg, chart_04_sizing,
               chart_05_grid_top, chart_05_per_coin, chart_06_interval_compare]:
        try:
            fn()
        except FileNotFoundError as e:
            print(f"  skip {fn.__name__}: {e}")
