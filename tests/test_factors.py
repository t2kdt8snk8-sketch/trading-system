from __future__ import annotations

import numpy as np
import pandas as pd

from config import Config
from factors import above_ma, momentum, risk_adjusted_momentum, volatility


def make_prices() -> pd.DataFrame:
    idx = pd.date_range("2023-01-02", periods=320, freq="B")
    return pd.DataFrame(
        {
            "UP": np.linspace(10, 30, len(idx)),
            "DOWN": np.linspace(30, 10, len(idx)),
            "ZIG": 20 + np.sin(np.arange(len(idx))) * 5,
        },
        index=idx,
    )


def test_momentum_ranks_up_above_down() -> None:
    mom = momentum(make_prices())
    assert mom["UP"] > 0
    assert mom["DOWN"] < 0
    assert mom["UP"] > mom["DOWN"]


def test_volatility_identifies_zigzag() -> None:
    vol = volatility(make_prices(), window_d=63)
    assert vol["ZIG"] > vol["UP"]


def test_asof_prevents_future_data_leak() -> None:
    prices = make_prices()
    early = momentum(prices, asof=pd.Timestamp("2024-01-15"))
    late = momentum(prices, asof=prices.index[-1])
    assert not early.equals(late)


def test_risk_adjusted_momentum_returns_nan_for_zero_vol() -> None:
    idx = pd.date_range("2023-01-02", periods=320, freq="B")
    prices = pd.DataFrame({"FLAT": 10.0}, index=idx)
    ram = risk_adjusted_momentum(prices, Config())
    assert pd.isna(ram["FLAT"])


def test_above_ma_flags_trend() -> None:
    gate = above_ma(make_prices(), ma_days=200)
    assert bool(gate["UP"])
    assert not bool(gate["DOWN"])
