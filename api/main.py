"""FastAPI app exposing the scoring/backtesting backend and static web UI."""
from __future__ import annotations

import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from api import pipeline

app = FastAPI(title="Trading System API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


JOBS: dict[str, dict[str, Any]] = {}
MAX_JOBS = 20


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _trim_jobs() -> None:
    if len(JOBS) <= MAX_JOBS:
        return
    for job_id in sorted(JOBS, key=lambda k: JOBS[k].get("created_at", ""))[: len(JOBS) - MAX_JOBS]:
        JOBS.pop(job_id, None)


def _run_backtest_job(job_id: str, req: BacktestRequest) -> None:
    JOBS[job_id].update({"status": "running", "updated_at": _now()})
    try:
        result = pipeline.run_backtest_ep(
            req.config,
            req.start,
            req.end,
            mode=req.mode,
            max_tickers=req.max_tickers,
        )
        JOBS[job_id].update({"status": "done", "result": result, "updated_at": _now()})
    except Exception as exc:  # noqa: BLE001 — preserve visible failure for polling UI
        JOBS[job_id].update(
            {
                "status": "error",
                "error": {
                    "error": str(exc),
                    "type": type(exc).__name__,
                    "trace": traceback.format_exc().splitlines()[-6:],
                },
                "updated_at": _now(),
            }
        )


def _guard(fn, *args, **kwargs):
    """Run a pipeline call; turn backend errors into visible HTTP 502."""
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — surface everything to UI
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
        pipeline.run_backtest_ep,
        req.config,
        req.start,
        req.end,
        mode=req.mode,
        max_tickers=req.max_tickers,
    )


@app.post("/api/backtest/jobs")
def start_backtest_job(req: BacktestRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    """Start a long backtest and let the browser poll instead of holding one request."""
    _trim_jobs()
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {
        "id": job_id,
        "kind": "backtest",
        "status": "queued",
        "created_at": _now(),
        "updated_at": _now(),
    }
    background_tasks.add_task(_run_backtest_job, job_id, req)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


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


WEB_OUT = Path(__file__).resolve().parents[1] / "web" / "out"
if WEB_OUT.exists():
    app.mount("/_next", StaticFiles(directory=WEB_OUT / "_next"), name="next-static")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_web(full_path: str) -> FileResponse:
        """Serve static Next export for non-API routes."""
        target = WEB_OUT / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(WEB_OUT / "index.html")
