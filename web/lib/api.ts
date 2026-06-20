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
  backtest: (o: RunOptions) =>
    post<BacktestResponse>("/api/backtest", {
      config: o.config,
      mode: o.mode,
      max_tickers: o.max_tickers,
      start: o.start,
      end: o.end,
    }),
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
