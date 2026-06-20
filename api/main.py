"""FastAPI app exposing the scoring/backtesting backend to the web UI.

Error policy: real-data failures are NOT swallowed. They return HTTP 502 with
the actual error message so the UI can show the problem loudly instead of
pretending it worked.
"""
from __future__ import annotations

import traceback
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from api import pipeline

app = FastAPI(title="Trading System API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://158.247.215.199:3000",
        "http://100.110.132.113:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PortfolioRequest(BaseModel):
    config: dict[str, Any] | None = None
    mode: str = "live"
    max_tickers: int | None = Field(default=None, ge=1)


class BacktestRequest(BaseModel):
    config: dict[str, Any] | None = None
    start: str = "2010-01-01"
    end: str | None = None
    mode: str = "live"
    max_tickers: int | None = Field(default=None, ge=1)


class CompareRequest(BaseModel):
    config: dict[str, Any] | None = None
    variants: list[dict[str, Any]]
    start: str = "2010-01-01"
    end: str | None = None
    mode: str = "live"
    max_tickers: int | None = Field(default=None, ge=1)


class OosRequest(BaseModel):
    config: dict[str, Any] | None = None
    start: str = "2010-01-01"
    end: str | None = None
    mode: str = "live"
    max_tickers: int | None = Field(default=None, ge=1)


def _guard(fn, *args, **kwargs):
    """Run a pipeline call; turn backend errors into a visible HTTP 502."""
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — surface everything to the UI
        raise HTTPException(
            status_code=502,
            detail={
                "error": str(exc),
                "type": type(exc).__name__,
                "trace": traceback.format_exc().splitlines()[-6:],
            },
        ) from exc


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    return pipeline.config_meta()


@app.post("/api/portfolio")
def post_portfolio(req: PortfolioRequest) -> dict[str, Any]:
    return _guard(pipeline.run_portfolio, req.config, mode=req.mode, max_tickers=req.max_tickers)


@app.post("/api/backtest")
def post_backtest(req: BacktestRequest) -> dict[str, Any]:
    return _guard(
        pipeline.run_backtest_ep, req.config, req.start, req.end, mode=req.mode, max_tickers=req.max_tickers
    )


@app.post("/api/compare")
def post_compare(req: CompareRequest) -> dict[str, Any]:
    return _guard(
        pipeline.run_compare_ep,
        req.config,
        req.variants,
        req.start,
        req.end,
        mode=req.mode,
        max_tickers=req.max_tickers,
    )


@app.post("/api/oos")
def post_oos(req: OosRequest) -> dict[str, Any]:
    return _guard(
        pipeline.run_oos_ep, req.config, req.start, req.end, mode=req.mode, max_tickers=req.max_tickers
    )
