from __future__ import annotations

import numpy as np
import pandas as pd

from backtest import compute_metrics, passes_gate, run_backtest
from config import Config


def make_market() -> tuple[dict[str, pd.DataFrame], pd.Series]:
    idx = pd.date_range("2019-01-02", periods=1100, freq="B")
    data = {}
    for i in range(12):
        trend = np.linspace(0, 10 + i * 3, len(idx))
        data[f"T{i}"] = 20 + i + trend
    data["SPY"] = 100 + np.linspace(0, 40, len(idx))
    close = pd.DataFrame(data, index=idx)
    open_px = close.shift(1).fillna(close.iloc[0])
    sectors = pd.Series({col: "A" if n % 2 == 0 else "B" for n, col in enumerate(close.columns)})
    return {"Close": close, "Open": open_px}, sectors


def test_run_backtest_outputs_required_objects() -> None:
    prices, sectors = make_market()
    result = run_backtest(prices, sectors, Config(top_n=4, min_stocks_per_sector=5), "2020-01-01", "2022-12-31")
    assert not result.equity_curve.empty
    assert not result.weights_history.empty
    assert not result.trades.empty
    assert "excess_cagr" in result.metrics
    assert result.metrics["survivorship_warning"] is True


def test_cost_sensitivity_lower_with_higher_slippage() -> None:
    prices, sectors = make_market()
    low = run_backtest(prices, sectors, Config(top_n=4, min_stocks_per_sector=5, slippage_bps=0), "2020-01-01", "2022-12-31")
    high = run_backtest(prices, sectors, Config(top_n=4, min_stocks_per_sector=5, slippage_bps=100), "2020-01-01", "2022-12-31")
    assert high.equity_curve.iloc[-1] < low.equity_curve.iloc[-1]


def test_compute_metrics_known_mdd() -> None:
    idx = pd.date_range("2020-01-31", periods=4, freq="ME")
    equity = pd.Series([1.0, 1.2, 0.9, 1.3], index=idx)
    bench = pd.Series([100, 110, 105, 120], index=idx)
    metrics = compute_metrics(equity, bench, pd.Series([0.1, 0.2], index=idx[:2]))
    assert round(metrics["mdd"], 2) == -0.25
    assert metrics["avg_turnover"] == 0.15000000000000002


def test_passes_gate_uses_config_thresholds() -> None:
    cfg = Config(pass_excess_cagr=0.03, pass_max_mdd=-0.35)
    good = {"excess_cagr": 0.04, "sharpe_delta": 0.1, "mdd": -0.2}
    bad = {"excess_cagr": 0.01, "sharpe_delta": 0.1, "mdd": -0.2}
    assert passes_gate(good, good, cfg)
    assert not passes_gate(good, bad, cfg)
