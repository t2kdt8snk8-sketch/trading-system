"""Pure factor calculations for price matrices."""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

TRADING_DAYS_PER_MONTH = 21
TRADING_DAYS_PER_YEAR = 252


def _slice_asof(prices: pd.DataFrame, asof: pd.Timestamp | None) -> pd.DataFrame:
    if prices.empty:
        raise ValueError("prices is empty")
    # Factor functions only read the frame, so normalize the index lazily instead
    # of always copying+sorting. On already-clean data (tz-naive, sorted
    # DatetimeIndex) this does zero copies — and in a backtest this runs ~800
    # times, so the old unconditional copy+sort was a major source of churn.
    frame = prices
    index = frame.index
    if not isinstance(index, pd.DatetimeIndex):
        index = pd.to_datetime(index)
        frame = frame.set_axis(index, axis=0)
    if index.tz is not None:
        index = index.tz_localize(None)
        frame = frame.set_axis(index, axis=0)
    if not index.is_monotonic_increasing:
        frame = frame.sort_index()
    if asof is not None:
        cutoff = pd.Timestamp(asof)
        if cutoff.tzinfo is not None:
            cutoff = cutoff.tz_localize(None)
        frame = frame.loc[frame.index <= cutoff]
    if frame.empty:
        raise ValueError("no prices available at or before asof")
    return frame


def momentum(
    prices: pd.DataFrame,
    lookback_m: int = 12,
    skip_m: int = 1,
    asof: pd.Timestamp | None = None,
) -> pd.Series:
    """Return 12-1 momentum using trading-day approximation; index=tickers."""
    frame = _slice_asof(prices, asof)
    lookback_days = lookback_m * TRADING_DAYS_PER_MONTH
    skip_days = skip_m * TRADING_DAYS_PER_MONTH
    needed = lookback_days + 1
    if len(frame) <= needed:
        return pd.Series(np.nan, index=frame.columns, dtype="float64")
    recent = frame.iloc[-skip_days] if skip_days > 0 else frame.iloc[-1]
    past = frame.iloc[-lookback_days]
    out = recent / past - 1.0
    out = out.replace([np.inf, -np.inf], np.nan)
    out.name = "momentum"
    return out


def volatility(
    prices: pd.DataFrame,
    window_d: int = 63,
    asof: pd.Timestamp | None = None,
) -> pd.Series:
    """Return annualized daily-return standard deviation; index=tickers."""
    frame = _slice_asof(prices, asof)
    returns = frame.pct_change(fill_method=None).tail(window_d)
    vol = returns.std(skipna=True) * math.sqrt(TRADING_DAYS_PER_YEAR)
    vol = vol.replace(0.0, np.nan).replace([np.inf, -np.inf], np.nan)
    vol.name = "volatility"
    return vol


def risk_adjusted_momentum(
    prices: pd.DataFrame, cfg: Any, vol: pd.Series | None = None
) -> pd.Series:
    """Return momentum divided by annualized volatility; index=tickers.

    ``vol`` may be passed in to reuse an already-computed volatility (the inverse-
    vol weighting needs the same Series), avoiding a duplicate full computation.
    """
    mom = momentum(prices, cfg.momentum_lookback_months, cfg.momentum_skip_months)
    if vol is None:
        vol = volatility(prices, cfg.vol_window_days)
    out = mom / vol
    out = out.replace([np.inf, -np.inf], np.nan)
    out.name = "risk_adjusted_momentum"
    return out


def above_ma(
    prices: pd.DataFrame,
    ma_days: int = 200,
    asof: pd.Timestamp | None = None,
) -> pd.Series:
    """Return bool Series for latest price above moving average at asof."""
    frame = _slice_asof(prices, asof)
    if len(frame) < ma_days:
        return pd.Series(False, index=frame.columns, dtype="bool")
    latest = frame.iloc[-1]
    ma = frame.tail(ma_days).mean()
    return (latest > ma).fillna(False)


if __name__ == "__main__":
    idx = pd.date_range("2023-01-01", periods=320, freq="B")
    demo = pd.DataFrame({"UP": np.linspace(10, 20, len(idx)), "FLAT": 10.0}, index=idx)
    print(momentum(demo).dropna())
    print(volatility(demo))
    print(above_ma(demo))
