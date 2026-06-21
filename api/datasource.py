"""Load market data for the API.

Two explicit modes:
- "live": real data via the yfinance adapter. The real path. If it fails,
  the error is raised and surfaced to the UI — we never silently fake success.
- "demo": synthetic offline data so the UI can render without network. Every
  response built from demo data is flagged is_demo=True so the UI can shout it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

from data.adapter import get_ohlcv, get_universe, validate_prices

BENCHMARK = "SPY"


@dataclass
class MarketData:
    """OHLCV frames + sector map + provenance/quality metadata."""

    ohlcv: dict[str, pd.DataFrame]
    sectors: pd.Series
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def close(self) -> pd.DataFrame:
        return self.ohlcv["Close"]


# --------------------------------------------------------------------------- #
# Live: real yfinance data through the existing adapter                        #
# --------------------------------------------------------------------------- #
def _load_live(cfg: Any, start: str, end: str, max_tickers: int | None) -> MarketData:
    universe = get_universe(cfg.universe)
    tickers = universe["ticker"].tolist()
    if max_tickers is not None and max_tickers > 0:
        tickers = tickers[:max_tickers]
    request_tickers = sorted(set(tickers) | {BENCHMARK})

    # Raises on failure (e.g. no network / yfinance empty). Caller surfaces it.
    # Backtest + scorer only consume Open/Close; skipping High/Low/Volume keeps
    # the full-universe live load from exhausting free-tier memory (OOM -> 502).
    ohlcv = get_ohlcv(request_tickers, start, end, cache_dir=cfg.cache_dir, fields=("Open", "Close"))
    # float32 halves the price matrices (and every per-rebalance copy the factor
    # code makes), which is the difference that keeps the full universe under the
    # free-tier memory ceiling. Price math is ratio-based, so f32 precision is fine.
    ohlcv = {field: frame.astype("float32") for field, frame in ohlcv.items()}

    # Drop tickers Yahoo returned no usable data for at all (bad/renamed symbols
    # from the Wikipedia table, or failed fetches — e.g. ALB/FDXF/Q showing up
    # 100% NaN). They can never be selected anyway, but leaving them in pollutes
    # the universe count and the quality report. Partial-history names (recent
    # listings) are kept — the factor code already ignores their NaN stretch.
    close = ohlcv["Close"]
    dropped_no_data = [
        col for col in close.columns
        if col != BENCHMARK and int(close[col].notna().sum()) == 0
    ]
    if dropped_no_data:
        ohlcv = {field: frame.drop(columns=dropped_no_data, errors="ignore") for field, frame in ohlcv.items()}
        tickers = [t for t in tickers if t not in dropped_no_data]

    sectors = pd.Series(
        universe.set_index("ticker")["sector"].to_dict(), name="sector"
    )
    sectors.loc[BENCHMARK] = "Benchmark"

    report = validate_prices(
        ohlcv["Close"], tickers, sectors, cfg.min_stocks_per_sector
    )
    meta = {
        "mode": "live",
        "is_demo": False,
        "source": "yfinance + Wikipedia GICS",
        "universe_requested": len(tickers),
        "dropped_no_data": dropped_no_data,
        "validate": report,
        "warnings": [],
    }
    if dropped_no_data:
        meta["warnings"].append(
            f"데이터가 전혀 없는 종목 {len(dropped_no_data)}개 제외: {', '.join(dropped_no_data[:8])}"
            + ("…" if len(dropped_no_data) > 8 else "")
        )
    if report.get("coverage_ratio", 1.0) < 0.9:
        meta["warnings"].append(
            f"데이터 커버리지 {report['coverage_ratio']:.0%} — 요청 종목 중 일부를 못 받았습니다."
        )
    if report.get("extreme_moves"):
        meta["warnings"].append(
            f"비정상 급등락(>50%/일) 감지 종목 {len(report['extreme_moves'])}개 — 데이터 품질 점검 필요."
        )
    return MarketData(ohlcv, sectors, meta)


# --------------------------------------------------------------------------- #
# Demo: synthetic offline data. ALWAYS flagged is_demo=True.                    #
# --------------------------------------------------------------------------- #
_DEMO_SECTORS = [
    "Information Technology",
    "Health Care",
    "Financials",
    "Consumer Discretionary",
    "Industrials",
    "Energy",
    "Consumer Staples",
    "Utilities",
]


def _load_demo(cfg: Any, start: str, end: str, max_tickers: int | None) -> MarketData:
    n = max_tickers or 48
    rng = np.random.default_rng(42)
    index = pd.bdate_range(start=start, end=end)
    if len(index) < 300:
        index = pd.bdate_range(end=end, periods=max(300, len(index)))

    columns: list[str] = []
    sector_map: dict[str, str] = {}
    close = pd.DataFrame(index=index, dtype="float64")
    for i in range(n):
        ticker = f"DEMO{i:02d}"
        columns.append(ticker)
        sector_map[ticker] = _DEMO_SECTORS[i % len(_DEMO_SECTORS)]
        drift = rng.normal(0.0004, 0.0004)
        vol = rng.uniform(0.008, 0.025)
        steps = rng.normal(drift, vol, len(index))
        close[ticker] = 50.0 * np.exp(np.cumsum(steps))

    spy_steps = rng.normal(0.0003, 0.009, len(index))
    close[BENCHMARK] = 100.0 * np.exp(np.cumsum(spy_steps))
    sector_map[BENCHMARK] = "Benchmark"

    open_px = close.shift(1)
    open_px.iloc[0] = close.iloc[0]
    # Only Open/Close are consumed downstream; mirror the live path's lean,
    # float32 load so demo and live exercise the same memory profile.
    ohlcv = {"Open": open_px.astype("float32"), "Close": close.astype("float32")}
    sectors = pd.Series(sector_map, name="sector")
    meta = {
        "mode": "demo",
        "is_demo": True,
        "source": "SYNTHETIC — 실제 시장 데이터 아님",
        "universe_requested": n,
        "validate": {"coverage_ratio": 1.0, "n_received": n + 1, "missing_tickers": []},
        "warnings": ["⚠️ 데모(합성) 데이터입니다. 실제 시장이 아니며 결과에 아무 의미 없습니다."],
    }
    return MarketData(ohlcv, sectors, meta)


def load_market_data(
    cfg: Any,
    start: str,
    end: str,
    mode: str = "live",
    max_tickers: int | None = None,
) -> MarketData:
    """Dispatch to live or demo loader. Unknown mode is a hard error."""
    if mode == "live":
        return _load_live(cfg, start, end, max_tickers)
    if mode == "demo":
        return _load_demo(cfg, start, end, max_tickers)
    raise ValueError(f"unknown data mode: {mode!r} (expected 'live' or 'demo')")


def today_str() -> str:
    return date.today().isoformat()
