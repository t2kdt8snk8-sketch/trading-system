import {
  ApiError,
  BacktestResponse,
  CompareResponse,
  ConfigMeta,
  OosResponse,
  PortfolioResponse,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Network / server-down: surface it, never pretend success.
    throw new ApiError(
      `API 서버에 연결하지 못했습니다 (${BASE}). 백엔드(uvicorn)가 켜져 있나요?`,
      String(e),
    );
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const rawDetail = (data as { detail?: unknown })?.detail ?? data;
    const msg = extractMessage(rawDetail) || `요청 실패 (HTTP ${res.status})`;
    throw new ApiError(msg, sanitizeErrorDetail(rawDetail));
  }
  return data as T;
}

function looksLikeHtmlError(text: string): boolean {
  const t = text.slice(0, 500).toLowerCase();
  return t.includes("<!doctype html") || t.includes("<html") || t.includes("<title>502</title>");
}

function truncateText(text: string, max = 1000): string {
  return text.length > max ? `${text.slice(0, max)}… [긴 에러 원문 생략]` : text;
}

function sanitizeErrorDetail(detail: unknown): unknown {
  if (typeof detail === "string") {
    if (looksLikeHtmlError(detail)) {
      return "서버가 HTML 에러 페이지를 반환했습니다. Render 배포/재시작 중 잠깐 502가 난 것으로 보입니다.";
    }
    return truncateText(detail);
  }
  return detail;
}

function extractMessage(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === "string") {
    if (looksLikeHtmlError(detail)) {
      return "Render 서버가 잠깐 502를 반환했습니다. 잠시 뒤 다시 시도하세요.";
    }
    return truncateText(detail, 180);
  }
  if (typeof detail === "object" && detail !== null && "error" in detail) {
    return truncateText(String((detail as { error: unknown }).error), 180);
  }
  return null;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch (e) {
    throw new ApiError(
      `API 서버에 연결하지 못했습니다 (${BASE}). 네트워크가 잠깐 끊겼습니다.`,
      String(e),
    );
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const rawDetail = (data as { detail?: unknown })?.detail ?? data;
    const msg = extractMessage(rawDetail) || `요청 실패 (HTTP ${res.status})`;
    throw new ApiError(msg, sanitizeErrorDetail(rawDetail));
  }
  return data as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface JobResponse<T> {
  id: string;
  status: "queued" | "running" | "done" | "error";
  result?: T;
  error?: unknown;
}

const LEGACY_ACTIVE_BACKTEST_JOB_KEY = "trading-system.activeBacktestJobId";
const ACTIVE_BACKTEST_JOB_KEY = "trading-system.activeBacktestJobId.v2";

function dropLegacyBacktestJob(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LEGACY_ACTIVE_BACKTEST_JOB_KEY);
  }
}

function saveActiveBacktestJob(jobId: string): void {
  if (typeof window !== "undefined") {
    dropLegacyBacktestJob();
    window.localStorage.setItem(ACTIVE_BACKTEST_JOB_KEY, jobId);
  }
}

function clearActiveBacktestJob(jobId?: string): void {
  if (typeof window === "undefined") return;
  if (!jobId || window.localStorage.getItem(ACTIVE_BACKTEST_JOB_KEY) === jobId) {
    window.localStorage.removeItem(ACTIVE_BACKTEST_JOB_KEY);
  }
}

function getActiveBacktestJob(): string | null {
  if (typeof window === "undefined") return null;
  dropLegacyBacktestJob();
  return window.localStorage.getItem(ACTIVE_BACKTEST_JOB_KEY);
}

function isMissingJobError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const msg = error.message.toLowerCase();
  const detail = typeof error.detail === "string" ? error.detail.toLowerCase() : "";
  return msg.includes("job not found") || detail.includes("job not found") || msg.includes("http 404");
}

async function pollBacktestJob(
  jobId: string,
  options: { staleOk?: boolean } = {},
): Promise<BacktestResponse | null> {
  let transientFailures = 0;
  for (let i = 0; i < 360; i += 1) {
    await sleep(1500);
    try {
      const job = await get<JobResponse<BacktestResponse>>(`/api/jobs/${jobId}`);
      transientFailures = 0;
      if (job.status === "done" && job.result) {
        clearActiveBacktestJob(jobId);
        return job.result;
      }
      if (job.status === "error") {
        clearActiveBacktestJob(jobId);
        const msg = extractMessage(job.error) || "백테스트 작업 실패";
        throw new ApiError(msg, job.error);
      }
    } catch (e) {
      if (isMissingJobError(e)) {
        clearActiveBacktestJob(jobId);
        if (options.staleOk) return null;
        throw new ApiError(
          "백테스트 작업을 찾지 못했습니다. 다시 실행하세요.",
          "job not found",
        );
      }
      if (e instanceof ApiError && typeof e.detail !== "string") throw e;
      transientFailures += 1;
      if (transientFailures >= 40) throw e;
    }
  }

  throw new ApiError("백테스트 시간이 너무 오래 걸립니다. 잠시 뒤 다시 시도하세요.", null);
}

async function startBacktestJob(o: RunOptions): Promise<string> {
  const started = await post<{ job_id: string }>("/api/backtest/jobs", {
    config: o.config,
    mode: o.mode,
    max_tickers: o.max_tickers,
    start: o.start,
    end: o.end,
  });
  saveActiveBacktestJob(started.job_id);
  return started.job_id;
}

async function runBacktestJob(o: RunOptions): Promise<BacktestResponse> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const jobId = await startBacktestJob(o);
    try {
      const result = await pollBacktestJob(jobId);
      if (result) return result;
    } catch (e) {
      if (isMissingJobError(e) && attempt === 0) {
        await sleep(1000);
        continue;
      }
      throw e;
    }
  }
  throw new ApiError(
    "Render 서버가 재시작되어 백테스트 작업이 사라졌습니다. 잠시 뒤 다시 실행하세요.",
    null,
  );
}

// Generic job poller for OOS / compare (which run several backtests and would
// otherwise time out as one synchronous request on free-tier hosts).
async function pollJob<T>(jobId: string): Promise<T> {
  let transientFailures = 0;
  for (let i = 0; i < 360; i += 1) {
    await sleep(1500);
    try {
      const job = await get<JobResponse<T>>(`/api/jobs/${jobId}`);
      transientFailures = 0;
      if (job.status === "done" && job.result) return job.result;
      if (job.status === "error") {
        throw new ApiError(extractMessage(job.error) || "작업 실패", job.error);
      }
    } catch (e) {
      if (isMissingJobError(e)) {
        throw new ApiError("작업을 찾지 못했습니다. 다시 실행하세요.", "job not found");
      }
      if (e instanceof ApiError && typeof e.detail !== "string") throw e;
      transientFailures += 1;
      if (transientFailures >= 40) throw e;
    }
  }
  throw new ApiError("작업 시간이 너무 오래 걸립니다. 잠시 뒤 다시 시도하세요.", null);
}

async function runJob<T>(startPath: string, body: unknown): Promise<T> {
  const started = await post<{ job_id: string }>(startPath, body);
  return pollJob<T>(started.job_id);
}

export interface RunOptions {
  config?: Record<string, unknown>;
  mode: string;
  max_tickers?: number | null;
  start?: string;
  end?: string | null;
}

export const api = {
  base: BASE,
  configMeta: () => get<ConfigMeta>("/api/config"),
  portfolio: (o: RunOptions) =>
    runJob<PortfolioResponse>("/api/portfolio/jobs", {
      config: o.config,
      mode: o.mode,
      max_tickers: o.max_tickers,
    }),
  backtest: (o: RunOptions) => runBacktestJob(o),
  resumeBacktest: () => {
    const jobId = getActiveBacktestJob();
    return jobId ? pollBacktestJob(jobId, { staleOk: true }) : null;
  },
  compare: (o: RunOptions & { variants: Record<string, unknown>[] }) =>
    runJob<CompareResponse>("/api/compare/jobs", {
      config: o.config,
      variants: o.variants,
      mode: o.mode,
      max_tickers: o.max_tickers,
      start: o.start,
      end: o.end,
    }),
  oos: (o: RunOptions) =>
    runJob<OosResponse>("/api/oos/jobs", {
      config: o.config,
      mode: o.mode,
      max_tickers: o.max_tickers,
      start: o.start,
      end: o.end,
    }),
};
