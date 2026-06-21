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

import bisect
import csv
import io
import re
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd

_BASE = "https://raw.githubusercontent.com/fja05680/sp500/master"
HIST_URL = f"{_BASE}/S%26P%20500%20Historical%20Components%20%26%20Changes.csv"
CHANGES_URL = f"{_BASE}/sp500_changes_since_2019.csv"
_HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36"}

# Delisted tickers in the dataset carry a "-YYYYMM" removal suffix (e.g. AAMRQ-201312).
_SUFFIX_RE = re.compile(r"-\d{6}$")

Checkpoint = tuple[pd.Timestamp, frozenset]
_CACHE: list[Checkpoint] | None = None
_CACHE_FAILED = False


def _normalize(ticker: str) -> str:
    base = _SUFFIX_RE.sub("", ticker.strip().upper())
    return base.replace(".", "-")


def _fetch(url: str, cache_path: Path) -> str:
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    req = Request(url, headers=_HEADERS)
    with urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(text, encoding="utf-8")
    return text


def _build_checkpoints(hist_text: str, changes_text: str) -> list[Checkpoint]:
    checkpoints: list[Checkpoint] = []
    for row in list(csv.reader(io.StringIO(hist_text)))[1:]:
        if len(row) < 2 or not row[0].strip():
            continue
        members = frozenset(_normalize(t) for t in row[1].split(",") if t.strip())
        checkpoints.append((pd.Timestamp(row[0]), members))
    checkpoints.sort(key=lambda c: c[0])
    if not checkpoints:
        return []

    # Roll the final snapshot forward with the date-stamped add/remove changes.
    members = set(checkpoints[-1][1])
    last_date = checkpoints[-1][0]
    changes: list[tuple[pd.Timestamp, list[str], list[str]]] = []
    for row in list(csv.reader(io.StringIO(changes_text)))[1:]:
        if len(row) < 3 or not row[0].strip():
            continue
        adds = [_normalize(t) for t in row[1].split(",") if t.strip()]
        rems = [_normalize(t) for t in row[2].split(",") if t.strip()]
        changes.append((pd.Timestamp(row[0]), adds, rems))
    changes.sort(key=lambda c: c[0])
    for date, adds, rems in changes:
        if date <= last_date:
            continue
        members = (members - set(rems)) | set(adds)
        checkpoints.append((date, frozenset(members)))
    return checkpoints


def load_membership(cache_dir: str = "data/cache") -> list[Checkpoint] | None:
    """Return sorted (date, members) checkpoints, or None if data can't be loaded.

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
        checkpoints = _build_checkpoints(hist, changes)
        if not checkpoints:
            _CACHE_FAILED = True
            return None
        _CACHE = checkpoints
        return _CACHE
    except Exception:  # noqa: BLE001 — PIT data is an enhancement; degrade gracefully
        _CACHE_FAILED = True
        return None


def members_asof(checkpoints: list[Checkpoint], date) -> frozenset | None:
    """Members as of `date` = the latest checkpoint on or before it."""
    if not checkpoints:
        return None
    ts = pd.Timestamp(date)
    dates = [c[0] for c in checkpoints]
    pos = bisect.bisect_right(dates, ts) - 1
    if pos < 0:
        return None
    return checkpoints[pos][1]


def _reset_cache_for_tests() -> None:
    global _CACHE, _CACHE_FAILED
    _CACHE = None
    _CACHE_FAILED = False
