"""Data adapter: universe, prices, caching, and quality checks."""
from __future__ import annotations

import hashlib
import json
from io import StringIO
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import pandas as pd

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "Chrome/125.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
OHLC_FIELDS = ("Open", "High", "Low", "Close", "Volume")


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper().replace(".", "-")


def _cache_key(tickers: list[str], start: str, end: str, kind: str) -> str:
    payload = json.dumps({"tickers": sorted(tickers), "start": start, "end": end, "kind": kind}, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _read_html_with_headers(url: str) -> list[pd.DataFrame]:
    """Read an HTML table using browser-like headers to avoid bot 403s."""
    req = Request(url, headers=HTTP_HEADERS)
    with urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    return pd.read_html(StringIO(html))


def get_universe(source: str = "SP500") -> pd.DataFrame:
    """Return universe DataFrame with columns ['ticker', 'sector']."""
    if source.upper() != "SP500":
        raise ValueError(f"unsupported universe: {source}")
    table = _read_html_with_headers(SP500_URL)[0]
    symbol_col = next((col for col in table.columns if str(col).lower() == "symbol"), None)
    sector_col = next((col for col in table.columns if "sector" in str(col).lower()), None)
    if symbol_col is None or sector_col is None:
        raise ValueError("Wikipedia S&P500 table missing Symbol/Sector columns")
    universe = pd.DataFrame(
        {
            "ticker": table[symbol_col].astype(str).map(_normalize_ticker),
            "sector": table[sector_col].astype(str).str.strip(),
        }
    ).dropna()
    universe = universe[(universe["ticker"] != "") & (universe["sector"] != "")]
    return universe.drop_duplicates("ticker").reset_index(drop=True)


def _download_yfinance(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    import yfinance as yf

    data = yf.download(
        tickers,
        start=start,
        end=end,
        auto_adjust=True,
        progress=False,
        group_by="column",
        threads=True,
    )
    if data.empty:
        raise ValueError("yfinance returned empty data")
    return data


def _extract_field(data: pd.DataFrame, field: str, tickers: list[str]) -> pd.DataFrame:
    if isinstance(data.columns, pd.MultiIndex):
        if field not in data.columns.get_level_values(0):
            raise ValueError(f"missing field from yfinance data: {field}")
        out = data[field].copy()
    else:
        if field not in data.columns:
            raise ValueError(f"missing field from yfinance data: {field}")
        out = data[[field]].rename(columns={field: tickers[0]}).copy()
    out.columns = [_normalize_ticker(str(col)) for col in out.columns]
    out.index = pd.to_datetime(out.index).tz_localize(None)
    return out.sort_index()


def get_ohlcv(
    tickers: list[str],
    start: str,
    end: str,
    cache_dir: str = "data/cache",
    use_cache: bool = True,
    fields: tuple[str, ...] = OHLC_FIELDS,
) -> dict[str, pd.DataFrame]:
    """Return OHLCV dict of DataFrames keyed by field; uses cache when available.

    Pass a subset via ``fields`` to only materialize what the caller needs. The
    backtest/scoring path only reads Open and Close, so loading the full universe
    with ``fields=("Open", "Close")`` cuts price-frame memory by ~60% and keeps a
    500-ticker live backtest from OOM-killing the worker (which surfaces as 502).
    """
    unknown = set(fields) - set(OHLC_FIELDS)
    if unknown:
        raise ValueError(f"unknown OHLCV field(s): {sorted(unknown)}")
    clean_tickers = [_normalize_ticker(t) for t in tickers]
    cache_path = Path(cache_dir)
    cache_path.mkdir(parents=True, exist_ok=True)
    key = _cache_key(clean_tickers, start, end, "ohlcv")
    cached_files = {field: cache_path / f"{key}_{field.lower()}.csv" for field in fields}
    if use_cache and all(path.exists() for path in cached_files.values()):
        return {
            field: pd.read_csv(path, index_col=0, parse_dates=True).rename_axis(None, axis=1)
            for field, path in cached_files.items()
        }

    raw = _download_yfinance(clean_tickers, start, end)
    frames = {field: _extract_field(raw, field, clean_tickers) for field in fields}
    del raw  # release the large intermediate frame before returning/caching
    for field, frame in frames.items():
        frame.to_csv(cached_files[field])
    return frames


def get_prices(
    tickers: list[str],
    start: str,
    end: str,
    cache_dir: str = "data/cache",
    use_cache: bool = True,
) -> pd.DataFrame:
    """Return adjusted-close daily prices, index=dates, columns=tickers."""
    ohlcv = get_ohlcv(tickers, start, end, cache_dir=cache_dir, use_cache=use_cache)
    return ohlcv["Close"]


def validate_prices(
    prices: pd.DataFrame,
    requested: list[str],
    sectors: pd.Series | dict[str, str] | None = None,
    min_stocks_per_sector: int = 5,
) -> dict[str, Any]:
    """Return quality report dict for adjusted-close price matrix."""
    requested_clean = [_normalize_ticker(t) for t in requested]
    received = [_normalize_ticker(str(c)) for c in prices.columns]
    missing = sorted(set(requested_clean) - set(received))
    report: dict[str, Any] = {
        "n_requested": len(requested_clean),
        "n_received": len(received),
        "coverage_ratio": (len(received) / len(requested_clean)) if requested_clean else 0.0,
        "missing_tickers": missing,
        "nan_ratio_per_ticker": prices.isna().mean().sort_values(ascending=False).head(10).to_dict()
        if not prices.empty
        else {},
        "nonpositive_prices": {},
        "extreme_moves": {},
        "sectors_below_min": {},
    }
    if prices.empty:
        report["empty"] = True
        return report

    nonpositive = (prices <= 0).sum()
    report["nonpositive_prices"] = nonpositive[nonpositive > 0].to_dict()

    returns = prices.pct_change(fill_method=None)
    extreme = (returns.abs() > 0.50).sum()
    report["extreme_moves"] = extreme[extreme > 0].to_dict()

    if sectors is not None:
        sector_series = pd.Series(sectors)
        if set(sector_series.index) != set(received):
            sector_series.index = [_normalize_ticker(str(idx)) for idx in sector_series.index]
        counts = sector_series.reindex(received).dropna().value_counts()
        below = counts[counts < min_stocks_per_sector]
        report["sectors_below_min"] = below.to_dict()
    return report


if __name__ == "__main__":
    demo = ["AAPL", "MSFT", "SPY"]
    px = get_prices(demo, "2024-01-01", "2024-02-01")
    print(px.tail())
    print(validate_prices(px, demo))
