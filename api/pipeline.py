"""Orchestration: load data, call backend, serialize to JSON-safe dicts.

This layer is intentionally thin. All real logic lives in the backend modules
(factors/scorer/backtest). We only glue data in and shape results out.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from backtest import passes_gate, run_backtest
from config import Config
from data.constituents import load_membership, members_asof
from scorer import build_portfolio

from api.datasource import BENCHMARK, MarketData, load_market_data, today_str

# 12-1 momentum needs ~13 months of prior prices before the first rebalance.
# Load this many extra calendar days before the backtest start as warmup.
WARMUP_DAYS = 500


# --------------------------------------------------------------------------- #
# JSON helpers                                                                  #
# --------------------------------------------------------------------------- #
def _num(x: Any) -> float | None:
    """Return a JSON-safe float, or None for NaN/inf/non-numeric."""
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return f if np.isfinite(f) else None


def _series_records(s: pd.Series) -> list[dict[str, Any]]:
    out = []
    for idx, val in s.items():
        ts = pd.Timestamp(idx)
        out.append({"date": ts.date().isoformat(), "value": _num(val)})
    return out


def _clean_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for k, v in metrics.items():
        if isinstance(v, (int, float, np.floating, np.integer)):
            cleaned[k] = _num(v)
        else:
            cleaned[k] = v
    return cleaned


def config_from_overrides(overrides: dict[str, Any] | None) -> Config:
    """Build Config from defaults, applying only known fields from overrides."""
    base = Config()
    if not overrides:
        return base
    valid = {k: v for k, v in overrides.items() if k in base.__dict__ and v is not None}
    return Config(**{**base.__dict__, **valid})


def _load_with_warmup(
    cfg: Config, start: str, end: str, mode: str, max_tickers: int | None
) -> MarketData:
    """Load prices from (start - warmup) so the first rebalance has history."""
    data_start = (pd.Timestamp(start) - pd.Timedelta(days=WARMUP_DAYS)).date().isoformat()
    return load_market_data(cfg, data_start, end, mode=mode, max_tickers=max_tickers)


def _point_in_time_resolver(cfg: Config, mode: str, meta: dict[str, Any]):
    """Build a date->members resolver for live backtests; record status in meta.

    Demo data has synthetic tickers with no index membership, so PIT is skipped
    there. If the membership data can't be loaded, degrade to the full universe
    (still better than crashing) and say so in meta.
    """
    status: dict[str, Any] = {"enabled": bool(cfg.point_in_time and mode == "live")}
    if not status["enabled"]:
        status["note"] = "데모 데이터 또는 비활성화 — 시점별 구성종목 미적용."
        meta["point_in_time"] = status
        return None

    checkpoints = load_membership(cfg.cache_dir)
    if not checkpoints:
        status.update(
            applied=False,
            note="시점별 구성종목 데이터를 불러오지 못해 전체 유니버스로 진행(생존편향 보정 미적용).",
        )
        meta.setdefault("warnings", []).append(status["note"])
        meta["point_in_time"] = status
        return None

    status.update(
        applied=True,
        coverage="1996~현재",
        note=(
            "각 리밸런싱에 그 시점 S&P500 구성종목만 후보로 사용 — '미래 승자 선취'(예: 편입 전 테슬라) 제거. "
            "단, 상장폐지된 과거 종목의 가격은 무료 데이터에 없어 '패자 누락'은 남아 있음."
        ),
    )
    meta["point_in_time"] = status
    return lambda date: members_asof(checkpoints, date)


# --------------------------------------------------------------------------- #
# Endpoints' work                                                              #
# --------------------------------------------------------------------------- #
def run_portfolio(
    overrides: dict[str, Any] | None,
    mode: str = "live",
    max_tickers: int | None = None,
    lookback_days: int = 750,
) -> dict[str, Any]:
    """Today's target portfolio from the latest available prices."""
    cfg = config_from_overrides(overrides)
    end = today_str()
    start = (pd.Timestamp(end) - pd.Timedelta(days=lookback_days)).date().isoformat()
    data = load_market_data(cfg, start, end, mode=mode, max_tickers=max_tickers)

    close = data.close.drop(columns=[BENCHMARK], errors="ignore")
    portfolio = build_portfolio(close, data.sectors, cfg)

    holdings = [
        {
            "ticker": str(idx),
            "score": _num(row["score"]),
            "weight": _num(row["weight"]),
            "sector": None if pd.isna(row["sector"]) else str(row["sector"]),
        }
        for idx, row in portfolio.iterrows()
    ]
    by_sector = (
        portfolio.groupby("sector")["weight"].sum().sort_values(ascending=False)
    )
    sector_weights = [
        {"sector": str(k), "weight": _num(v)} for k, v in by_sector.items()
    ]
    return {
        "as_of": close.index[-1].date().isoformat(),
        "config": cfg.__dict__,
        "holdings": holdings,
        "sector_weights": sector_weights,
        "meta": data.meta,
    }


def run_backtest_ep(
    overrides: dict[str, Any] | None,
    start: str,
    end: str | None = None,
    mode: str = "live",
    max_tickers: int | None = None,
) -> dict[str, Any]:
    """Full-period backtest with equity curve, metrics, and gate sub-checks."""
    cfg = config_from_overrides(overrides)
    end = end or today_str()
    data = _load_with_warmup(cfg, start, end, mode, max_tickers)

    universe_asof = _point_in_time_resolver(cfg, mode, data.meta)
    result = run_backtest(
        data.ohlcv, data.sectors, cfg, start=start, end=end, universe_asof=universe_asof
    )
    equity = result.equity_curve.sort_index()
    norm_equity = equity / equity.iloc[0]

    close = data.close
    bench_raw = close[BENCHMARK] if BENCHMARK in close.columns else close.mean(axis=1)
    bench = bench_raw.reindex(equity.index).ffill()
    bench = bench / bench.iloc[0]

    metrics = _clean_metrics(result.metrics)
    gate_checks = _gate_checks(metrics, cfg)
    trades_tail = result.trades.tail(12).to_dict(orient="records")
    for row in trades_tail:
        for key, val in list(row.items()):
            if isinstance(val, pd.Timestamp):
                row[key] = val.date().isoformat()
            elif isinstance(val, (float, np.floating)):
                row[key] = _num(val)

    return {
        "period": {"start": start, "end": end},
        "config": cfg.__dict__,
        "metrics": metrics,
        "gate_checks": gate_checks,
        "equity_curve": _series_records(norm_equity),
        "benchmark_curve": _series_records(bench),
        "recent_trades": trades_tail,
        "meta": data.meta,
    }


def run_compare_ep(
    base_overrides: dict[str, Any] | None,
    variants: list[dict[str, Any]],
    start: str,
    end: str | None = None,
    mode: str = "live",
    max_tickers: int | None = None,
) -> dict[str, Any]:
    """Compare 2-3 strategy variants over the same data."""
    if len(variants) > 3:
        raise ValueError("버전 비교는 과최적화 방지를 위해 2~3개로 제한합니다.")
    base_cfg = config_from_overrides(base_overrides)
    end = end or today_str()
    data = _load_with_warmup(base_cfg, start, end, mode, max_tickers)
    universe_asof = _point_in_time_resolver(base_cfg, mode, data.meta)

    rows = []
    for i, variant in enumerate(variants):
        cfg = Config(**{**base_cfg.__dict__, **variant})
        result = run_backtest(
            data.ohlcv, data.sectors, cfg, start=start, end=end, universe_asof=universe_asof
        )
        metrics = _clean_metrics(result.metrics)
        rows.append({"variant": i, **variant, **metrics})
    return {
        "period": {"start": start, "end": end},
        "variants": rows,
        "meta": data.meta,
    }


def run_oos_ep(
    overrides: dict[str, Any] | None,
    start: str,
    end: str | None = None,
    mode: str = "live",
    max_tickers: int | None = None,
) -> dict[str, Any]:
    """Development vs out-of-sample split, plus the pass/fail gate verdict."""
    cfg = config_from_overrides(overrides)
    end = end or today_str()
    data = _load_with_warmup(cfg, start, end, mode, max_tickers)

    close = data.close
    split = pd.Timestamp(cfg.oos_split_date)
    before = close.index[close.index < split]
    after = close.index[close.index >= split]
    if len(before) == 0 or len(after) == 0:
        raise ValueError(
            f"분할일 {cfg.oos_split_date}이 데이터 기간 밖입니다. 시작일/분할일을 확인하세요."
        )
    dev_end = before[-1].date().isoformat()
    oos_start = after[0].date().isoformat()

    universe_asof = _point_in_time_resolver(cfg, mode, data.meta)
    dev_res = run_backtest(
        data.ohlcv, data.sectors, cfg, start=start, end=dev_end, universe_asof=universe_asof
    )
    oos_res = run_backtest(
        data.ohlcv, data.sectors, cfg, start=oos_start, end=end, universe_asof=universe_asof
    )
    dev = _clean_metrics(dev_res.metrics)
    oos = _clean_metrics(oos_res.metrics)
    gate = passes_gate(dev_res.metrics, oos_res.metrics, cfg)
    return {
        "split_date": cfg.oos_split_date,
        "config": cfg.__dict__,
        "development": dev,
        "oos": oos,
        "passes_gate": bool(gate),
        "dev_checks": _gate_checks(dev, cfg),
        "oos_checks": _gate_checks(oos, cfg),
        "oos_consumed_warning": "OOS를 확인했습니다. 이 기간에 맞춰 전략을 수정하면 그 OOS는 소모된 것이며, 새 검증 기간 없이는 다시 합격 판정하지 마세요.",
        "meta": data.meta,
    }


def _gate_checks(metrics: dict[str, Any], cfg: Config) -> list[dict[str, Any]]:
    """Break the gate into visible sub-checks so a FAIL shows exactly why."""
    excess = metrics.get("excess_cagr")
    sharpe_delta = metrics.get("sharpe_delta")
    mdd = metrics.get("mdd")
    return [
        {
            "label": "SPY 대비 초과수익(CAGR)",
            "value": excess,
            "threshold": cfg.pass_excess_cagr,
            "op": ">=",
            "pass": excess is not None and excess >= cfg.pass_excess_cagr,
            "format": "pct",
        },
        {
            "label": "샤프 개선(전략-SPY)",
            "value": sharpe_delta,
            "threshold": cfg.pass_sharpe_delta,
            "op": ">",
            "pass": sharpe_delta is not None and sharpe_delta > cfg.pass_sharpe_delta,
            "format": "num",
        },
        {
            "label": "최대낙폭(MDD)",
            "value": mdd,
            "threshold": cfg.pass_max_mdd,
            "op": ">=",
            "pass": mdd is not None and mdd >= cfg.pass_max_mdd,
            "format": "pct",
        },
    ]


def config_meta() -> dict[str, Any]:
    """Defaults + which knobs the UI should expose."""
    cfg = Config()
    return {
        "defaults": cfg.__dict__,
        "editable": [
            "signal",
            "top_n",
            "sector_neutral",
            "trend_gate",
            "weighting",
            "slippage_bps",
            "commission_bps",
            "oos_split_date",
            "pass_excess_cagr",
            "pass_max_mdd",
            "pass_sharpe_delta",
        ],
        "signal_options": ["risk_adjusted_momentum", "pure_momentum"],
        "weighting_options": ["inverse_vol", "equal"],
    }
