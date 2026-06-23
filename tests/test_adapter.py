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


def test_download_tolerates_failed_batch(monkeypatch, tmp_path) -> None:
    """One rate-limited batch must not sink the whole download; it's skipped and
    a partial result is returned but not cached."""
    monkeypatch.setattr(adapter.time, "sleep", lambda *_: None)
    monkeypatch.setattr(adapter, "DOWNLOAD_CHUNK", 1)
    dates = pd.date_range("2024-01-01", periods=3)

    def fake_download(tickers, start, end):
        if tickers[0] == "BBB":
            raise ValueError("yfinance returned empty data")
        cols = pd.MultiIndex.from_product(
            [["Open", "High", "Low", "Close", "Volume"], tickers]
        )
        return pd.DataFrame(1.0, index=dates, columns=cols)

    monkeypatch.setattr(adapter, "_download_yfinance", fake_download)
    frames = adapter.get_ohlcv(
        ["AAA", "BBB", "CCC"], "2024-01-01", "2024-01-05",
        cache_dir=str(tmp_path), fields=("Open", "Close"),
    )
    assert set(frames) == {"Open", "Close"}
    assert "AAA" in frames["Close"].columns and "CCC" in frames["Close"].columns
    assert "BBB" not in frames["Close"].columns  # failed batch tolerated, not fatal
    key = adapter._cache_key(["AAA", "BBB", "CCC"], "2024-01-01", "2024-01-05", "ohlcv")
    assert not (tmp_path / f"{key}_close.csv").exists()  # partial download not cached


def test_get_universe_parses_symbol_and_sector(monkeypatch) -> None:
    fake = pd.DataFrame({"Symbol": ["BRK.B", "AAPL"], "GICS Sector": ["Financials", "Information Technology"]})
    monkeypatch.setattr(adapter, "_read_html_with_headers", lambda url: [fake])
    universe = adapter.get_universe()
    assert list(universe.columns) == ["ticker", "sector"]
    assert universe.loc[0, "ticker"] == "BRK-B"
    assert universe["sector"].isna().sum() == 0
