from __future__ import annotations

import numpy as np
import pandas as pd

from config import Config
from scorer import build_portfolio, combined_score, inverse_vol_weights, rank_and_select, sector_zscore


def test_sector_zscore_has_zero_sector_mean() -> None:
    values = pd.Series({"A": 1.0, "B": 2.0, "C": 3.0, "D": 10.0, "E": 20.0, "F": 30.0})
    sectors = pd.Series({"A": "X", "B": "X", "C": "X", "D": "Y", "E": "Y", "F": "Y"})
    z = sector_zscore(values, sectors, min_per_sector=3)
    assert abs(z.loc[["A", "B", "C"]].mean()) < 1e-12
    assert abs(z.loc[["D", "E", "F"]].mean()) < 1e-12


def test_inverse_vol_weights_sum_to_one_and_positive() -> None:
    weights = inverse_vol_weights(pd.Index(["A", "B"]), pd.Series({"A": 0.2, "B": 0.4}))
    assert abs(weights.sum() - 1.0) < 1e-12
    assert (weights > 0).all()
    assert weights["A"] > weights["B"]


def test_rank_and_select_respects_trend_gate() -> None:
    scores = pd.Series({"A": 3.0, "B": 2.0, "C": 1.0})
    trend = pd.Series({"A": False, "B": True, "C": True})
    selected = rank_and_select(scores, 2, trend)
    assert list(selected) == ["B", "C"]


def test_combined_score_nan_if_used_factor_nan() -> None:
    score = combined_score({"x": pd.Series({"A": 1.0, "B": np.nan})}, {"x": 1.0})
    assert score["A"] == 1.0
    assert pd.isna(score["B"])


def test_build_portfolio_outputs_weights_and_sectors() -> None:
    idx = pd.date_range("2023-01-02", periods=320, freq="B")
    prices = pd.DataFrame({f"T{i}": np.linspace(10 + i, 20 + i * 2, len(idx)) for i in range(10)}, index=idx)
    sectors = pd.Series({f"T{i}": "A" if i < 5 else "B" for i in range(10)})
    portfolio = build_portfolio(prices, sectors, Config(top_n=4, min_stocks_per_sector=5))
    assert len(portfolio) == 4
    assert abs(portfolio["weight"].sum() - 1.0) < 1e-12
    assert set(portfolio.columns) == {"score", "weight", "sector"}


def test_build_portfolio_caps_position_and_sector_weights() -> None:
    idx = pd.date_range("2023-01-02", periods=320, freq="B")
    prices = pd.DataFrame(
        {
            "A1": np.linspace(10, 40, len(idx)),
            "A2": np.linspace(10, 35, len(idx)),
            "A3": np.linspace(10, 30, len(idx)),
            "B1": np.linspace(10, 28, len(idx)),
            "B2": np.linspace(10, 26, len(idx)),
            "B3": np.linspace(10, 24, len(idx)),
            "C1": np.linspace(10, 22, len(idx)),
            "C2": np.linspace(10, 21, len(idx)),
            "C3": np.linspace(10, 20, len(idx)),
        },
        index=idx,
    )
    sectors = pd.Series({c: c[0] for c in prices.columns})
    cfg = Config(
        top_n=9,
        min_stocks_per_sector=3,
        max_position_weight=0.20,
        max_sector_weight=0.40,
    )

    portfolio = build_portfolio(prices, sectors, cfg)

    assert portfolio["weight"].max() <= 0.20 + 1e-12
    assert portfolio.groupby("sector")["weight"].sum().max() <= 0.40 + 1e-12
    assert abs(portfolio["weight"].sum() - 1.0) < 1e-12
