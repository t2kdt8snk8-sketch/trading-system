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
    const detail = (data as { detail?: unknown })?.detail ?? data;
    const msg = extractMessage(detail) || `요청 실패 (HTTP ${res.status})`;
    throw new ApiError(msg, detail);
  }
  return data as T;
}

function extractMessage(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail !== null && "error" in detail) {
    return String((detail as { error: unknown }).error);
  }
  return null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new ApiError(`요청 실패 (HTTP ${res.status})`, null);
  return (await res.json()) as T;
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

async function runBacktestJob(o: RunOptions): Promise<BacktestResponse> {
  const started = await post<{ job_id: string }>("/api/backtest/jobs", {
    config: o.config,
    mode: o.mode,
    max_tickers: o.max_tickers,
    start: o.start,
    end: o.end,
  });

  for (let i = 0; i < 240; i += 1) {
    await sleep(1500);
    const job = await get<JobResponse<BacktestResponse>>(`/api/jobs/${started.job_id}`);
    if (job.status === "done" && job.result) return job.result;
    if (job.status === "error") {
      const msg = extractMessage(job.error) || "백테스트 작업 실패";
      throw new ApiError(msg, job.error);
    }
  }

  throw new ApiError("백테스트 시간이 너무 오래 걸립니다. 잠시 뒤 다시 시도하세요.", null);
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
    post<PortfolioResponse>("/api/portfolio", {
      config: o.config,
      mode: o.mode,
      max_tickers: o.max_tickers,
    }),
  backtest: (o: RunOptions) => runBacktestJob(o),
  compare: (o: RunOptions & { variants: Record<string, unknown>[] }) =>
    post<CompareResponse>("/api/compare", {
      config: o.config,
      variants: o.variants,
      mode: o.mode,
      max_tickers: o.max_tickers,
      start: o.start,
      end: o.end,
    }),
  oos: (o: RunOptions) =>
    post<OosResponse>("/api/oos", {
      config: o.config,
      mode: o.mode,
      max_tickers: o.max_tickers,
      start: o.start,
      end: o.end,
    }),
};
