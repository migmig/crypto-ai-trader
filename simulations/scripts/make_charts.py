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


if __name__ == "__main__":
    for fn in [chart_02_mitigation, chart_03_horizon, chart_03_avg, chart_04_sizing]:
        try:
            fn()
        except FileNotFoundError as e:
            print(f"  skip {fn.__name__}: {e}")
