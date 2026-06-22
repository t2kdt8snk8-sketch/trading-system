# CLAUDE.md

AI-assisted S&P 500 stock-scoring and backtesting system: a Python engine
(factor scoring + backtester) exposed through a FastAPI backend that also serves
a static Next.js UI. Runs on a free-tier host (Render), where memory is tight, so
the data and compute paths are kept lean.

## Commands

```bash
pip install -e ".[api,dev]"              # install with api + dev extras
python -m pytest -q                      # run tests (from repo root)
uvicorn api.main:app --reload            # serve API + UI locally
cd web && npm install && npm run build   # build the static UI into web/out
cd web && npx tsc --noEmit               # typecheck the frontend
```

## Data flow

universe + prices → factors → scores → portfolio → backtest → JSON → UI

## Layout

Backend / engine:
- `config.py` — `Config` dataclass holding every operator knob; env-overridable via `TRADING_<FIELD>`.
- `data/adapter.py` — universe (Wikipedia S&P 500) and OHLCV prices (yfinance), with an on-disk CSV cache. Downloads in 50-ticker batches.
- `data/constituents.py` — point-in-time S&P 500 membership as per-ticker intervals, from the `fja05680/sp500` dataset.
- `factors.py` — pure factor calculations (12-1 momentum, volatility, moving-average gate).
- `scorer.py` — `build_portfolio`: factor → within-sector z-score → rank/select → weights.
- `backtest.py` — `run_backtest`: monthly rebalance with costs; signal uses data through t and executes at t+1 open (no look-ahead); produces equity curve, metrics, and gate checks.

API:
- `api/datasource.py` — `_load_live` (real data) and `_load_demo` (synthetic, always flagged `is_demo`) returning `MarketData` (OHLCV dict + sectors + quality meta). Prices are loaded as float32, Open/Close only.
- `api/pipeline.py` — glue between the API and the engine; loads data, runs the engine, serializes JSON-safe results.
- `api/main.py` — FastAPI routes, the backtest job system, and the static-UI mount.

Frontend (`web/`, Next.js static export):
- `lib/api.ts` — fetch helpers and job polling.
- `lib/types.ts`, `lib/format.ts`, `lib/metrics.ts` — types and display helpers.
- `components/BacktestView.tsx` — the backtest tearsheet (KPIs, charts, reality-check card, exports).

## How backtests run

Long backtests are submitted as jobs (`POST /api/backtest/jobs`) and polled
(`GET /api/jobs/{id}`); job state is mirrored to disk so it survives a worker
restart. `/api/portfolio`, `/api/oos`, and `/api/compare` are synchronous.

## Survivorship bias

Backtests use point-in-time index membership (`config.point_in_time`, on for live
runs), so each rebalance only holds stocks that were in the index on that date.
Delisted companies' prices are absent from the free data source, so that residual
bias remains; the UI's reality-check card shows an adjustable, clearly-labeled
survivorship haircut as an interpretation aid, separate from the computed metrics.

## Tests

`tests/` mirrors the modules (`test_adapter`, `test_factors`, `test_scorer`,
`test_backtest`) and runs without network access using synthetic data.
