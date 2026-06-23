"""FastAPI app exposing the scoring/backtesting backend and static web UI."""
from __future__ import annotations

import json
import os
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

# Jobs live in an in-memory dict, so a worker restart (e.g. an OOM kill on the
# full-universe live backtest) wipes them and the UI only sees an opaque 404
# "job not found". Mirror job state to disk so a restart instead surfaces the
# real cause: any job left "running" after a restart was killed mid-run.
JOBS_DIR = Path(os.environ.get("JOBS_DIR", "data/cache/jobs"))
WORKER_RESTART_MSG = (
    "서버가 작업 도중 재시작되었습니다(무료 플랜 메모리 초과로 추정). "
    "종목 수를 줄이거나 플랜 메모리를 올린 뒤 다시 실행하세요."
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persist_job(job: dict[str, Any]) -> None:
    """Best-effort mirror of one job to disk; never let disk issues break the API."""
    try:
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        (JOBS_DIR / f"{job['id']}.json").write_text(json.dumps(job, default=str))
    except Exception:  # noqa: BLE001 — persistence is a best-effort safety net
        pass


def _delete_job_file(job_id: str) -> None:
    try:
        (JOBS_DIR / f"{job_id}.json").unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        pass


def _load_jobs_from_disk() -> None:
    """On startup, reload jobs. A job still 'running'/'queued' means its worker
    died mid-run (almost always OOM on free tier) — mark it failed so the UI can
    show why instead of a confusing 404."""
    try:
        files = sorted(JOBS_DIR.glob("*.json")) if JOBS_DIR.exists() else []
    except Exception:  # noqa: BLE001
        return
    for path in files:
        try:
            job = json.loads(path.read_text())
        except Exception:  # noqa: BLE001
            continue
        if job.get("status") in ("queued", "running"):
            job["status"] = "error"
            job["error"] = {"error": WORKER_RESTART_MSG, "type": "WorkerRestart"}
            job["updated_at"] = _now()
            _persist_job(job)
        JOBS[job.get("id", path.stem)] = job


def _set_job(job_id: str, **fields: Any) -> None:
    JOBS[job_id].update(fields)
    JOBS[job_id]["updated_at"] = _now()
    _persist_job(JOBS[job_id])


def _trim_jobs() -> None:
    if len(JOBS) <= MAX_JOBS:
        return
    for job_id in sorted(JOBS, key=lambda k: JOBS[k].get("created_at", ""))[: len(JOBS) - MAX_JOBS]:
        JOBS.pop(job_id, None)
        _delete_job_file(job_id)


def _run_job(job_id: str, fn) -> None:
    _set_job(job_id, status="running")
    try:
        _set_job(job_id, status="done", result=fn())
    except Exception as exc:  # noqa: BLE001 — preserve visible failure for polling UI
        _set_job(
            job_id,
            status="error",
            error={
                "error": str(exc),
                "type": type(exc).__name__,
                "trace": traceback.format_exc().splitlines()[-6:],
            },
        )


def _start_job(kind: str, fn, background_tasks: BackgroundTasks) -> dict[str, str]:
    """Create a pollable job so the browser polls instead of holding one long
    request (which times out / drops the connection on free-tier hosts)."""
    _trim_jobs()
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {
        "id": job_id,
        "kind": kind,
        "status": "queued",
        "created_at": _now(),
        "updated_at": _now(),
    }
    _persist_job(JOBS[job_id])
    background_tasks.add_task(_run_job, job_id, fn)
    return {"job_id": job_id, "status": "queued"}


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


_load_jobs_from_disk()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    return pipeline.config_meta()


@app.post("/api/portfolio")
def post_portfolio(req: PortfolioRequest) -> dict[str, Any]:
    return _guard(pipeline.run_portfolio, req.config, mode=req.mode, max_tickers=req.max_tickers)


@app.post("/api/portfolio/jobs")
def start_portfolio_job(req: PortfolioRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    """Building today's portfolio downloads the full universe; poll it so the
    request can't time out on free-tier hosts."""
    return _start_job(
        "portfolio",
        lambda: pipeline.run_portfolio(req.config, mode=req.mode, max_tickers=req.max_tickers),
        background_tasks,
    )


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
    return _start_job(
        "backtest",
        lambda: pipeline.run_backtest_ep(
            req.config, req.start, req.end, mode=req.mode, max_tickers=req.max_tickers
        ),
        background_tasks,
    )


@app.post("/api/oos/jobs")
def start_oos_job(req: OosRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    """OOS runs two backtests; poll it like a backtest so it can't time out."""
    return _start_job(
        "oos",
        lambda: pipeline.run_oos_ep(
            req.config, req.start, req.end, mode=req.mode, max_tickers=req.max_tickers
        ),
        background_tasks,
    )


@app.post("/api/compare/jobs")
def start_compare_job(req: CompareRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    """Compare runs several backtests; poll it like a backtest so it can't time out."""
    return _start_job(
        "compare",
        lambda: pipeline.run_compare_ep(
            req.config, req.variants, req.start, req.end, mode=req.mode, max_tickers=req.max_tickers
        ),
        background_tasks,
    )


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if job is None:  # not in memory — fall back to the disk mirror across restarts
        try:
            job = json.loads((JOBS_DIR / f"{job_id}.json").read_text())
            JOBS[job_id] = job
        except Exception:  # noqa: BLE001
            job = None
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
