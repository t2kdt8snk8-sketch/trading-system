export type DataMode = "live" | "demo";

export interface DataMeta {
  mode: DataMode;
  is_demo: boolean;
  source: string;
  universe_requested: number;
  validate?: {
    coverage_ratio?: number;
    n_received?: number;
    missing_tickers?: string[];
    extreme_moves?: Record<string, number>;
  };
  point_in_time?: {
    enabled: boolean;
    applied?: boolean;
    coverage?: string;
    note?: string;
  };
  warnings: string[];
}

export interface Holding {
  ticker: string;
  score: number | null;
  weight: number | null;
  sector: string | null;
}

export interface SectorWeight {
  sector: string;
  weight: number | null;
}

export interface PortfolioResponse {
  as_of: string;
  config: Record<string, unknown>;
  holdings: Holding[];
  sector_weights: SectorWeight[];
  meta: DataMeta;
}

export interface GateCheck {
  label: string;
  value: number | null;
  threshold: number;
  op: string;
  pass: boolean;
  format: "pct" | "num";
}

export interface Metrics {
  cagr: number | null;
  benchmark_cagr: number | null;
  excess_cagr: number | null;
  volatility: number | null;
  benchmark_volatility: number | null;
  sharpe: number | null;
  benchmark_sharpe: number | null;
  sharpe_delta: number | null;
  mdd: number | null;
  benchmark_mdd: number | null;
  avg_turnover: number | null;
  [key: string]: unknown;
}

export interface CurvePoint {
  date: string;
  value: number | null;
}

export interface Trade {
  rebalance_date: string;
  execution_date: string;
  period_end: string;
  gross_return: number;
  cost: number;
  net_return: number;
  turnover: number;
  n_holdings: number;
}

export interface BacktestResponse {
  period: { start: string; end: string };
  config: Record<string, unknown>;
  metrics: Metrics;
  gate_checks: GateCheck[];
  equity_curve: CurvePoint[];
  benchmark_curve: CurvePoint[];
  recent_trades: Trade[];
  meta: DataMeta;
}

export interface CompareResponse {
  period: { start: string; end: string };
  variants: Array<Record<string, number | string | boolean>>;
  meta: DataMeta;
}

export interface OosResponse {
  split_date: string;
  config: Record<string, unknown>;
  development: Metrics;
  oos: Metrics;
  passes_gate: boolean;
  dev_checks: GateCheck[];
  oos_checks: GateCheck[];
  oos_consumed_warning: string;
  meta: DataMeta;
}

export interface ConfigMeta {
  defaults: Record<string, unknown>;
  editable: string[];
  signal_options: string[];
  weighting_options: string[];
}

export class ApiError extends Error {
  detail: unknown;
  constructor(message: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.detail = detail;
  }
}
