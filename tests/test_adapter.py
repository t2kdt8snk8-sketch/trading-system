from __future__ import annotations

import pandas as pd

from data import adapter


def test_validate_prices_flags_bad_data() -> None:
    prices = pd.DataFrame(
        {
            "AAA": [10.0, 20.0, 0.0, 21.0],
            "BBB": [5.0, None, 5.2, 5.3],
        },
        index=pd.date_range("2024-01-01", periods=4),
    )
    report = adapter.validate_prices(prices, ["AAA", "BBB", "CCC"])
    assert report["n_requested"] == 3
    assert report["n_received"] == 2
    assert report["coverage_ratio"] == 2 / 3
    assert report["missing_tickers"] == ["CCC"]
    assert report["nonpositive_prices"]["AAA"] == 1
    assert report["extreme_moves"]["AAA"] >= 1


def test_cache_hit_skips_download(monkeypatch, tmp_path) -> None:
    tickers = ["AAA", "BBB"]
    dates = pd.date_range("2024-01-01", periods=3)
    for field in adapter.OHLC_FIELDS:
        frame = pd.DataFrame({"AAA": [1, 2, 3], "BBB": [4, 5, 6]}, index=dates)
        key = adapter._cache_key(tickers, "2024-01-01", "2024-01-05", "ohlcv")
        frame.to_csv(tmp_path / f"{key}_{field.lower()}.csv")

    def fail_download(*args, **kwargs):
        raise AssertionError("network should not be called")

    monkeypatch.setattr(adapter, "_download_yfinance", fail_download)
    frames = adapter.get_ohlcv(tickers, "2024-01-01", "2024-01-05", cache_dir=str(tmp_path))
    assert set(frames) == set(adapter.OHLC_FIELDS)
    assert list(frames["Close"].columns) == ["AAA", "BBB"]


def test_get_universe_parses_symbol_and_sector(monkeypatch) -> None:
    fake = pd.DataFrame({"Symbol": ["BRK.B", "AAPL"], "GICS Sector": ["Financials", "Information Technology"]})
    monkeypatch.setattr(adapter, "_read_html_with_headers", lambda url: [fake])
    universe = adapter.get_universe()
    assert list(universe.columns) == ["ticker", "sector"]
    assert universe.loc[0, "ticker"] == "BRK-B"
    assert universe["sector"].isna().sum() == 0
