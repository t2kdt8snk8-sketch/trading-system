"""Configuration knobs for the trading system."""
from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any


def _bool_env(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on", "y"}


def _coerce(value: str, target_type: type[Any]) -> Any:
    if target_type is bool:
        return _bool_env(value)
    if target_type is int:
        return int(value)
    if target_type is float:
        return float(value)
    return value


@dataclass(frozen=True)
class Config:
    """All operator-controlled settings used by scoring and backtesting."""

    universe: str = "SP500"
    signal: str = "risk_adjusted_momentum"
    momentum_lookback_months: int = 12
    momentum_skip_months: int = 1
    vol_window_days: int = 63
    sector_neutral: bool = True
    min_stocks_per_sector: int = 5
    top_n: int = 20
    weighting: str = "inverse_vol"
    trend_gate: bool = False
    trend_ma_days: int = 200
    rebalance: str = "M"
    # Restrict each rebalance to the stocks actually in the index on that date
    # (point-in-time membership), instead of today's constituents. Curbs the
    # biggest survivorship/look-ahead inflation: buying future index members
    # (e.g. TSLA pre-2020) before they were ever in the S&P 500.
    point_in_time: bool = True
    slippage_bps: float = 7.5
    commission_bps: float = 0.0
    oos_split_date: str = "2021-01-01"
    cache_dir: str = "data/cache"
    pass_excess_cagr: float = 0.03
    pass_max_mdd: float = -0.35
    pass_sharpe_delta: float = 0.0

    @classmethod
    def load(cls, env_file: str | Path | None = None) -> "Config":
        """Create Config, overriding fields from .env/env vars named TRADING_<FIELD>."""
        values: dict[str, str] = {}
        if env_file:
            path = Path(env_file)
            if path.exists():
                for line in path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, raw_value = line.split("=", 1)
                    values[key.strip()] = raw_value.strip().strip('"').strip("'")

        cfg = cls()
        updates: dict[str, Any] = {}
        annotations = cls.__annotations__
        for field_name, field_type in annotations.items():
            env_name = f"TRADING_{field_name.upper()}"
            raw = os.getenv(env_name, values.get(env_name))
            if raw is not None:
                updates[field_name] = _coerce(raw, field_type)
        return replace(cfg, **updates)

    @property
    def total_cost_bps(self) -> float:
        """Round-trip model input per side: slippage plus commission in bps."""
        return self.slippage_bps + self.commission_bps


if __name__ == "__main__":
    print(Config.load())
