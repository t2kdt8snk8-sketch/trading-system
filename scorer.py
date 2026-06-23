"""Scoring and portfolio construction functions."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from factors import above_ma, momentum, risk_adjusted_momentum, volatility


def sector_zscore(values: pd.Series, sectors: pd.Series, min_per_sector: int = 5) -> pd.Series:
    """Return within-sector z-score; small/zero-std sectors become NaN."""
    aligned = pd.DataFrame({"value": values, "sector": sectors.reindex(values.index)}).dropna()
    out = pd.Series(np.nan, index=values.index, dtype="float64")
    for sector, group in aligned.groupby("sector"):
        if len(group) < min_per_sector:
            continue
        std = group["value"].std(ddof=0)
        if not np.isfinite(std) or std == 0:
            continue
        out.loc[group.index] = (group["value"] - group["value"].mean()) / std
    out.name = values.name or "sector_zscore"
    return out


def combined_score(factor_z: dict[str, pd.Series], weights: dict[str, float]) -> pd.Series:
    """Return weighted sum of factor z-scores; NaN in any used factor => NaN."""
    if not factor_z:
        raise ValueError("factor_z is empty")
    index = next(iter(factor_z.values())).index
    total = pd.Series(0.0, index=index, dtype="float64")
    valid = pd.Series(True, index=index, dtype="bool")
    for name, series in factor_z.items():
        weight = weights.get(name, 0.0)
        aligned = series.reindex(index)
        valid &= aligned.notna()
        total = total + aligned.fillna(0.0) * weight
    total[~valid] = np.nan
    total.name = "score"
    return total


def inverse_vol_weights(selected: pd.Index, vol: pd.Series) -> pd.Series:
    """Return normalized inverse-volatility weights for selected tickers."""
    selected_vol = vol.reindex(selected).replace(0.0, np.nan)
    inv = 1.0 / selected_vol
    inv = inv.replace([np.inf, -np.inf], np.nan).dropna()
    if inv.empty or inv.sum() <= 0:
        raise ValueError("cannot compute inverse-vol weights")
    weights = inv / inv.sum()
    weights.name = "weight"
    return weights


def _cap_and_redistribute(
    weights: pd.Series,
    position_cap: float | None,
    sectors: pd.Series | None = None,
    sector_cap: float | None = None,
) -> pd.Series:
    """Apply position/sector caps and redistribute leftover weight.

    If a cap is impossible for a small selected universe, relax it only to the
    minimum feasible level so tests and small demo runs can still sum to 100%.
    """
    capped = weights.astype("float64").copy()
    capped = capped / capped.sum()
    if capped.empty:
        return capped

    if position_cap is not None and np.isfinite(position_cap) and position_cap > 0:
        position_cap = max(float(position_cap), 1.0 / len(capped))
    else:
        position_cap = None

    sector_map = sectors.reindex(capped.index).fillna("Unknown") if sectors is not None else None
    if sector_cap is not None and np.isfinite(sector_cap) and sector_cap > 0 and sector_map is not None:
        sector_cap = max(float(sector_cap), 1.0 / max(int(sector_map.nunique()), 1))
    else:
        sector_cap = None

    for _ in range(len(capped) * 4):
        before = capped.copy()

        if position_cap is not None:
            capped = capped.clip(upper=position_cap)

        if sector_cap is not None and sector_map is not None:
            for _, idx in sector_map.groupby(sector_map).groups.items():
                sector_idx = pd.Index(idx)
                total = float(capped.reindex(sector_idx).sum())
                if total > sector_cap:
                    capped.loc[sector_idx] *= sector_cap / total

        residual = 1.0 - float(capped.sum())
        if residual <= 1e-12:
            break

        room = pd.Series(np.inf, index=capped.index, dtype="float64")
        if position_cap is not None:
            room = np.minimum(room, (position_cap - capped).clip(lower=0.0))
        if sector_cap is not None and sector_map is not None:
            for _, idx in sector_map.groupby(sector_map).groups.items():
                sector_idx = pd.Index(idx)
                sector_room = max(sector_cap - float(capped.reindex(sector_idx).sum()), 0.0)
                room.loc[sector_idx] = np.minimum(room.loc[sector_idx], sector_room)

        candidates = room > 1e-12
        if not candidates.any():
            break

        base = weights.reindex(capped.index).where(candidates, 0.0).clip(lower=0.0)
        if base.sum() <= 0:
            base = pd.Series(1.0, index=capped.index).where(candidates, 0.0)
        add = residual * base / base.sum()
        add = np.minimum(add, room).fillna(0.0)
        capped = capped + add

        if (capped - before).abs().max() < 1e-12:
            break

    capped = capped / capped.sum()
    capped.name = "weight"
    return capped


def rank_and_select(scores: pd.Series, top_n: int, trend_ok: pd.Series | None = None) -> pd.Index:
    """Return top_n tickers by score, optionally filtered by trend gate."""
    eligible = scores.dropna()
    if trend_ok is not None:
        eligible = eligible[trend_ok.reindex(eligible.index).fillna(False)]
    return pd.Index(eligible.sort_values(ascending=False).head(top_n).index)


def _factor_for_signal(prices: pd.DataFrame, cfg: Any, vol: pd.Series | None = None) -> pd.Series:
    if cfg.signal == "risk_adjusted_momentum":
        return risk_adjusted_momentum(prices, cfg, vol=vol)
    if cfg.signal == "pure_momentum":
        return momentum(prices, cfg.momentum_lookback_months, cfg.momentum_skip_months)
    raise ValueError(f"unsupported signal: {cfg.signal}")


def build_portfolio(prices: pd.DataFrame, sectors: pd.Series, cfg: Any) -> pd.DataFrame:
    """Build portfolio DataFrame columns ['score','weight','sector'] from prices/sectors."""
    # Volatility feeds both the risk-adjusted score and inverse-vol weighting, so
    # compute it once (only when actually needed) and share it across both.
    needs_vol = cfg.signal == "risk_adjusted_momentum" or cfg.weighting == "inverse_vol"
    vol = volatility(prices, cfg.vol_window_days) if needs_vol else None

    raw_factor = _factor_for_signal(prices, cfg, vol=vol)
    factor = sector_zscore(raw_factor, sectors, cfg.min_stocks_per_sector) if cfg.sector_neutral else raw_factor
    scores = combined_score({cfg.signal: factor}, {cfg.signal: 1.0})
    trend_ok = above_ma(prices, cfg.trend_ma_days) if cfg.trend_gate else None
    selected = rank_and_select(scores, cfg.top_n, trend_ok=trend_ok)
    if cfg.weighting == "inverse_vol":
        weights = inverse_vol_weights(selected, vol)
    else:
        weights = pd.Series(1 / len(selected), index=selected)
    weights = _cap_and_redistribute(
        weights,
        getattr(cfg, "max_position_weight", None),
        sectors=sectors,
        sector_cap=getattr(cfg, "max_sector_weight", None),
    )
    portfolio = pd.DataFrame(
        {
            "score": scores.reindex(weights.index),
            "weight": weights,
            "sector": sectors.reindex(weights.index),
        }
    ).sort_values("score", ascending=False)
    return portfolio


def save_portfolio(df: pd.DataFrame, path: str | Path) -> None:
    """Write portfolio DataFrame to CSV path, creating parents."""
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=True)


if __name__ == "__main__":
    from config import Config

    idx = pd.date_range("2023-01-02", periods=320, freq="B")
    prices = pd.DataFrame({f"T{i}": np.linspace(10 + i, 20 + i * 2, len(idx)) for i in range(10)}, index=idx)
    sectors = pd.Series({f"T{i}": "A" if i < 5 else "B" for i in range(10)})
    print(build_portfolio(prices, sectors, Config(top_n=4)))
