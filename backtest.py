"""Backtesting engine with costs, OOS helpers, and gate checks."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from config import Config
from scorer import build_portfolio

SURVIVORSHIP_WARNING_TEXT = (
    "Current S&P500 constituents used. Survivorship bias can overstate results; "
    "SPY-relative excess return can also be inflated. Backtest pass only grants "
    "paper-test eligibility, not live-trading eligibility. OOS is consumed once viewed."
)


@dataclass(frozen=True)
class BacktestResult:
    """Container for equity, weights, trades, turnover, and metrics."""

    equity_curve: pd.Series
    weights_history: pd.DataFrame
    trades: pd.DataFrame
    turnover: pd.Series
    metrics: dict[str, Any]


def _as_price_frame(prices: pd.DataFrame | dict[str, pd.DataFrame], field: str) -> pd.DataFrame:
    if isinstance(prices, dict):
        if field not in prices:
            raise ValueError(f"missing price field: {field}")
        return prices[field].sort_index()
    return prices.sort_index()


def _rebalance_dates(index: pd.DatetimeIndex, start: str, end: str) -> pd.DatetimeIndex:
    dates = pd.DatetimeIndex(index[(index >= pd.Timestamp(start)) & (index <= pd.Timestamp(end))]).sort_values()
    if len(dates) < 3:
        raise ValueError("not enough dates for backtest")
    month_ends = pd.Series(dates, index=dates).resample("ME").last().dropna()
    return pd.DatetimeIndex(month_ends.values)


def _next_date(index: pd.DatetimeIndex, date: pd.Timestamp) -> pd.Timestamp | None:
    pos = index.searchsorted(date, side="right")
    if pos >= len(index):
        return None
    return index[pos]


def _period_return(close: pd.DataFrame, start_date: pd.Timestamp, end_date: pd.Timestamp) -> pd.Series:
    start_prices = close.loc[start_date]
    end_prices = close.loc[end_date]
    return (end_prices / start_prices - 1.0).replace([np.inf, -np.inf], np.nan).fillna(0.0)


def run_backtest(
    prices: pd.DataFrame | dict[str, pd.DataFrame],
    sectors: pd.Series,
    cfg: Config,
    start: str,
    end: str,
    universe_asof: Callable[[pd.Timestamp], frozenset | None] | None = None,
) -> BacktestResult:
    """Run monthly rebalance; signal uses data through t, execution starts t+1 open.

    ``universe_asof`` optionally returns the index members eligible at each
    rebalance date (point-in-time), so the strategy can't hold a stock before it
    was actually in the index. Dates where it yields too few names fall back to
    the full available universe rather than trade an unrealistically thin set.
    """
    close = _as_price_frame(prices, "Close")
    open_px = _as_price_frame(prices, "Open")
    common_index = close.index.intersection(open_px.index).sort_values()
    close = close.loc[common_index]
    open_px = open_px.loc[common_index]
    rebal_dates = _rebalance_dates(common_index, start, end)

    equity = 1.0
    equity_points: list[tuple[pd.Timestamp, float]] = []
    old_weights = pd.Series(dtype="float64")
    weights_rows: list[pd.Series] = []
    trade_rows: list[dict[str, Any]] = []
    turnover_values: list[tuple[pd.Timestamp, float]] = []

    for rebal_date in rebal_dates:
        exec_date = _next_date(common_index, rebal_date)
        if exec_date is None:
            break
        next_rebal_candidates = rebal_dates[rebal_dates > rebal_date]
        if len(next_rebal_candidates) == 0:
            end_date = common_index[common_index <= pd.Timestamp(end)][-1]
        else:
            next_exec = _next_date(common_index, next_rebal_candidates[0])
            end_date = next_exec if next_exec is not None else common_index[-1]
        if end_date <= exec_date:
            continue

        history = close.loc[:rebal_date]
        if universe_asof is not None:
            members = universe_asof(rebal_date)
            if members:
                eligible = [c for c in history.columns if c in members]
                if len(eligible) >= cfg.top_n:
                    history = history[eligible]
        portfolio = build_portfolio(history, sectors, cfg)
        new_weights = portfolio["weight"].copy()
        all_tickers = old_weights.index.union(new_weights.index)
        old_aligned = old_weights.reindex(all_tickers, fill_value=0.0)
        new_aligned = new_weights.reindex(all_tickers, fill_value=0.0)
        turnover = float((new_aligned - old_aligned).abs().sum() / 2.0)
        cost = turnover * cfg.total_cost_bps / 10000.0

        returns = _period_return(open_px, exec_date, end_date).reindex(new_weights.index).fillna(0.0)
        gross_return = float((new_weights * returns).sum())
        net_return = gross_return - cost
        equity *= 1.0 + net_return
        equity_points.append((end_date, equity))
        turnover_values.append((rebal_date, turnover))

        weights_snapshot = new_weights.copy()
        weights_snapshot.name = rebal_date
        weights_rows.append(weights_snapshot)
        trade_rows.append(
            {
                "rebalance_date": rebal_date,
                "execution_date": exec_date,
                "period_end": end_date,
                "gross_return": gross_return,
                "cost": cost,
                "net_return": net_return,
                "turnover": turnover,
                "n_holdings": len(new_weights),
            }
        )
        old_weights = new_weights

    if not equity_points:
        raise ValueError("backtest produced no periods")

    equity_curve = pd.Series(dict(equity_points)).sort_index()
    weights_history = pd.DataFrame(weights_rows).fillna(0.0)
    trades = pd.DataFrame(trade_rows)
    turnover_series = pd.Series(dict(turnover_values)).sort_index()
    benchmark = close["SPY"] if "SPY" in close.columns else close.mean(axis=1)
    metrics = compute_metrics(equity_curve, benchmark.loc[equity_curve.index[0] : equity_curve.index[-1]], turnover_series)
    metrics["survivorship_warning"] = True
    metrics["survivorship_warning_text"] = SURVIVORSHIP_WARNING_TEXT
    metrics["paper_only_gate"] = True
    return BacktestResult(equity_curve, weights_history, trades, turnover_series, metrics)


def _cagr(series: pd.Series) -> float:
    clean = series.dropna()
    if len(clean) < 2 or clean.iloc[0] <= 0:
        return float("nan")
    years = (clean.index[-1] - clean.index[0]).days / 365.25
    if years <= 0:
        return float("nan")
    return float((clean.iloc[-1] / clean.iloc[0]) ** (1 / years) - 1)


def _max_drawdown(series: pd.Series) -> float:
    clean = series.dropna()
    running_max = clean.cummax()
    drawdown = clean / running_max - 1.0
    return float(drawdown.min())


def compute_metrics(equity_curve: pd.Series, benchmark: pd.Series, turnover: pd.Series) -> dict[str, float]:
    """Compute CAGR, vol, Sharpe, MDD, excess CAGR, and avg turnover."""
    equity = equity_curve.sort_index().dropna()
    bench = benchmark.sort_index().reindex(equity.index).ffill().dropna()
    bench = bench / bench.iloc[0]
    bench = bench.reindex(equity.index).ffill()
    monthly_returns = equity.pct_change(fill_method=None).dropna()
    bench_returns = bench.pct_change(fill_method=None).dropna()
    cagr = _cagr(equity)
    bench_cagr = _cagr(bench)
    vol = float(monthly_returns.std(ddof=0) * np.sqrt(12)) if len(monthly_returns) else float("nan")
    bench_vol = float(bench_returns.std(ddof=0) * np.sqrt(12)) if len(bench_returns) else float("nan")
    sharpe = float((monthly_returns.mean() * 12) / vol) if vol and np.isfinite(vol) else float("nan")
    bench_sharpe = float((bench_returns.mean() * 12) / bench_vol) if bench_vol and np.isfinite(bench_vol) else float("nan")
    return {
        "cagr": cagr,
        "benchmark_cagr": bench_cagr,
        "excess_cagr": cagr - bench_cagr,
        "volatility": vol,
        "benchmark_volatility": bench_vol,
        "sharpe": sharpe,
        "benchmark_sharpe": bench_sharpe,
        "sharpe_delta": sharpe - bench_sharpe,
        "mdd": _max_drawdown(equity),
        "benchmark_mdd": _max_drawdown(bench),
        "avg_turnover": float(turnover.mean()) if len(turnover) else 0.0,
    }


def compare_versions(
    prices: pd.DataFrame | dict[str, pd.DataFrame],
    sectors: pd.Series,
    base_cfg: Config,
    variants: list[dict[str, Any]],
) -> pd.DataFrame:
    """Compare up to three variants; returns metrics by variant."""
    if len(variants) > 3:
        raise ValueError("compare_versions limited to 2-3 variants to avoid overfitting")
    rows: list[dict[str, Any]] = []
    for idx, variant in enumerate(variants):
        cfg = Config(**{**base_cfg.__dict__, **variant})
        result = run_backtest(prices, sectors, cfg, start="2000-01-01", end=str(_as_price_frame(prices, "Close").index[-1].date()))
        rows.append({"variant": idx, **variant, **result.metrics})
    return pd.DataFrame(rows)


def oos_check(prices: pd.DataFrame | dict[str, pd.DataFrame], sectors: pd.Series, cfg: Config, split_date: str) -> dict[str, Any]:
    """Run development and OOS periods split by date; OOS is consumed once viewed."""
    close = _as_price_frame(prices, "Close")
    split = pd.Timestamp(split_date)
    start = str(close.index[0].date())
    end = str(close.index[-1].date())
    dev_end = str(close.index[close.index < split][-1].date())
    oos_start = str(close.index[close.index >= split][0].date())
    dev = run_backtest(prices, sectors, cfg, start=start, end=dev_end)
    oos = run_backtest(prices, sectors, cfg, start=oos_start, end=end)
    return {
        "development": dev.metrics,
        "oos": oos.metrics,
        "oos_consumed_warning": "OOS viewed. Do not tune strategy against it without new validation period.",
    }


def passes_gate(metrics: dict[str, Any], oos_metrics: dict[str, Any], cfg: Config) -> bool:
    """Return True only when backtest and OOS meet paper-eligibility thresholds."""
    for data in (metrics, oos_metrics):
        if data.get("excess_cagr", float("-inf")) < cfg.pass_excess_cagr:
            return False
        if data.get("sharpe_delta", float("-inf")) <= cfg.pass_sharpe_delta:
            return False
        if data.get("mdd", float("-inf")) < cfg.pass_max_mdd:
            return False
    return True


def save_equity_plot(equity_curve: pd.Series, benchmark: pd.Series, path: str | Path) -> None:
    """Save equity-vs-benchmark plot to path."""
    import matplotlib.pyplot as plt  # lazy: the API never plots, keep it off the hot path

    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    bench = benchmark.reindex(equity_curve.index).ffill()
    bench = bench / bench.iloc[0]
    ax = equity_curve.plot(label="strategy")
    bench.plot(ax=ax, label="benchmark")
    ax.legend()
    ax.set_title("Backtest equity curve")
    ax.figure.savefig(out)
    plt.close(ax.figure)


if __name__ == "__main__":
    idx = pd.date_range("2020-01-02", periods=900, freq="B")
    close = pd.DataFrame({f"T{i}": 20 + i + np.linspace(0, i + 5, len(idx)) for i in range(12)}, index=idx)
    close["SPY"] = 100 + np.linspace(0, 20, len(idx))
    open_px = close.shift(1).fillna(close.iloc[0])
    sectors = pd.Series({col: "A" if n % 2 == 0 else "B" for n, col in enumerate(close.columns)})
    cfg = Config(top_n=4, min_stocks_per_sector=5)
    result = run_backtest({"Close": close, "Open": open_px}, sectors, cfg, "2021-01-01", "2023-05-01")
    print(result.metrics)
