"""Point-in-time S&P 500 membership.

Backtesting on *today's* constituents overstates results: stocks that were added
to the index only after a big run (e.g. TSLA, added Dec 2020 but trading since
2010) would be selectable years before they were ever members. Restricting each
rebalance to the stocks that were actually in the index on that date removes that
look-ahead.

Membership comes from the community-maintained `fja05680/sp500` dataset:
- a full snapshot file (every membership change 1996-01-02 .. 2019-01-11), and
- a date-stamped add/remove file that rolls the last snapshot forward to today.

This fixes the "future winners" half of survivorship bias. It does NOT recover
delisted losers' prices (those need a paid survivorship-free feed), so that
caveat remains — surfaced honestly in the UI.
"""
from __future__ import annotations

import csv
import io
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd

_BASE = "https://raw.githubusercontent.com/fja05680/sp500/master"
HIST_URL = f"{_BASE}/S%26P%20500%20Historical%20Components%20%26%20Changes.csv"
CHANGES_URL = f"{_BASE}/sp500_changes_since_2019.csv"
_HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36"}

# Delisted tickers in the dataset carry a "-YYYYMM" removal suffix (e.g. AAMRQ-201312).
_SUFFIX_RE = re.compile(r"-\d{6}$")
_FUTURE = pd.Timestamp("2100-01-01")

# Membership as per-ticker [start, end] intervals. Storing this instead of one
# full set per change keeps the whole table to a few hundred KB (vs ~180MB for
# 2700 snapshots of ~500 tickers each, which on its own pushed the free tier
# back into OOM territory).
Interval = tuple[pd.Timestamp, pd.Timestamp]
Membership = dict[str, list[Interval]]
_CACHE: Membership | None = None
_CACHE_FAILED = False


def _normalize(ticker: str) -> str:
    base = _SUFFIX_RE.sub("", ticker.strip().upper())
    return sys.intern(base.replace(".", "-"))


def _fetch(url: str, cache_path: Path) -> str:
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    req = Request(url, headers=_HEADERS)
    with urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(text, encoding="utf-8")
    return text


def _build_membership(hist_text: str, changes_text: str) -> Membership:
    """Turn full snapshots + a forward change log into per-ticker intervals.

    Snapshots are streamed one at a time (only the previous set is kept) so the
    build never materializes all ~2700 membership sets at once — that transient
    peak alone was ~180MB.
    """
    # Keep only the light raw (date, tickers) strings; ISO dates sort lexically.
    raw_rows: list[tuple[str, str]] = []
    for row in csv.reader(io.StringIO(hist_text)):
        if len(row) < 2 or not row[0].strip() or row[0].strip().lower() == "date":
            continue
        raw_rows.append((row[0].strip(), row[1]))
    raw_rows.sort(key=lambda r: r[0])
    if not raw_rows:
        return {}

    intervals: Membership = {}
    open_start: dict[str, pd.Timestamp] = {}
    prev: set[str] = set()
    prev_date: pd.Timestamp | None = None
    for date_str, tickers_str in raw_rows:
        date = pd.Timestamp(date_str)
        members = {_normalize(t) for t in tickers_str.split(",") if t.strip()}
        for t in members - prev:
            open_start[t] = date
        for t in prev - members:
            intervals.setdefault(t, []).append((open_start.pop(t), prev_date))
        prev, prev_date = members, date
    last_snapshot_date = prev_date

    # Roll forward with the dated add/remove change log.
    changes: list[tuple[pd.Timestamp, list[str], list[str]]] = []
    for row in csv.reader(io.StringIO(changes_text)):
        if len(row) < 3 or not row[0].strip() or row[0].strip().lower() == "date":
            continue
        adds = [_normalize(t) for t in row[1].split(",") if t.strip()]
        rems = [_normalize(t) for t in row[2].split(",") if t.strip()]
        changes.append((pd.Timestamp(row[0]), adds, rems))
    changes.sort(key=lambda c: c[0])
    for date, adds, rems in changes:
        if last_snapshot_date is not None and date <= last_snapshot_date:
            continue
        for t in rems:
            if t in open_start:
                intervals.setdefault(t, []).append((open_start.pop(t), date))
        for t in adds:
            open_start.setdefault(t, date)

    for t, start in open_start.items():
        intervals.setdefault(t, []).append((start, _FUTURE))
    return intervals


def load_membership(cache_dir: str = "data/cache") -> Membership | None:
    """Return per-ticker membership intervals, or None if data can't be loaded.

    Cached in memory for the process and on disk across runs. Failures degrade to
    None so the backtest can fall back to the full universe instead of crashing.
    """
    global _CACHE, _CACHE_FAILED
    if _CACHE is not None:
        return _CACHE
    if _CACHE_FAILED:
        return None
    try:
        cache = Path(cache_dir)
        hist = _fetch(HIST_URL, cache / "sp500_hist_components.csv")
        changes = _fetch(CHANGES_URL, cache / "sp500_changes_since_2019.csv")
        membership = _build_membership(hist, changes)
        if not membership:
            _CACHE_FAILED = True
            return None
        _CACHE = membership
        return _CACHE
    except Exception:  # noqa: BLE001 — PIT data is an enhancement; degrade gracefully
        _CACHE_FAILED = True
        return None


def members_asof(membership: Membership | None, date) -> frozenset | None:
    """Tickers whose membership interval covers `date`."""
    if not membership:
        return None
    ts = pd.Timestamp(date)
    return frozenset(
        ticker
        for ticker, intervals in membership.items()
        if any(start <= ts <= end for start, end in intervals)
    )


def _reset_cache_for_tests() -> None:
    global _CACHE, _CACHE_FAILED
    _CACHE = None
    _CACHE_FAILED = False
