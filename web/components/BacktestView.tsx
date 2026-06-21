"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BacktestResponse } from "@/lib/types";
import { pct, signedPct, num } from "@/lib/format";
import { recoveryFactor, longestDrawdownDays } from "@/lib/metrics";
import { Settings } from "./ConfigBar";
import {
  Card,
  DataQuality,
  DemoBanner,
  EmptyState,
  ErrorBanner,
  HintText,
  RunButton,
  Spinner,
  Stat,
  SummaryCard,
  ViewHeader,
} from "./ui";
import {
  CumulativeChart,
  DrawdownChart,
  MonthlyReturnsBars,
  RebalanceBars,
  RiskRadar,
  GaugeRing,
} from "./charts";
import { GateVerdict } from "./GateVerdict";
import { IconAlert, IconChart } from "./icons";

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9가-힣_.-]+/g, "-").replace(/-+/g, "-");
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  if (value == null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildTradesCsv(data: BacktestResponse) {
  const header = [
    "rebalance_date",
    "execution_date",
    "period_end",
    "gross_return_decimal",
    "cost_decimal",
    "net_return_decimal",
    "turnover_decimal",
    "n_holdings",
  ];
  const rows = data.recent_trades.map((t) => [
    t.rebalance_date,
    t.execution_date,
    t.period_end,
    t.gross_return,
    t.cost,
    t.net_return,
    t.turnover,
    t.n_holdings,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function buildAiJson(data: BacktestResponse) {
  const checks = data.gate_checks;
  const passCount = checks.filter((c) => c.pass).length;
  const allPass = checks.length > 0 && passCount === checks.length;
  return {
    schema: "trading-system.backtest.ai-export.v1",
    generated_at: new Date().toISOString(),
    intended_use: "Send this JSON to an AI assistant for strategy/backtest review. Numeric returns are decimals, not percent strings.",
    warnings_for_ai: [
      "This is historical backtest data, not a live-trading signal.",
      "Current universe may have survivorship bias because it uses current S&P 500 constituents.",
      "Do not recommend loosening thresholds merely to make this run pass; evaluate robustness and risk tolerance.",
    ],
    verdict: {
      passed: allPass,
      pass_count: passCount,
      total_checks: checks.length,
    },
    period: data.period,
    config: data.config,
    metrics: data.metrics,
    gate_checks: data.gate_checks,
    data_meta: data.meta,
    curves: {
      strategy_equity: data.equity_curve,
      benchmark_equity: data.benchmark_curve,
    },
    recent_rebalances: data.recent_trades,
  };
}

function exportBacktest(data: BacktestResponse, kind: "ai-json" | "trades-csv") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const period = safeFilePart(`${data.period.start}_${data.period.end}`);
  if (kind === "trades-csv") {
    downloadTextFile(
      `backtest-rebalances-${period}-${stamp}.csv`,
      buildTradesCsv(data),
      "text/csv;charset=utf-8",
    );
    return;
  }
  downloadTextFile(
    `backtest-ai-export-${period}-${stamp}.json`,
    JSON.stringify(buildAiJson(data), null, 2),
    "application/json;charset=utf-8",
  );
}

export function BacktestView({ settings }: { settings: Settings }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<BacktestResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resume = api.resumeBacktest();
    if (!resume) return;

    setLoading(true);
    setError(null);
    resume
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.backtest({
        config: settings.config,
        mode: settings.mode,
        max_tickers: settings.maxTickers,
        start: settings.start,
        end: settings.end,
      });
      setData(res);
    } catch (e) {
      setError(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const m = data?.metrics;
  const checks = data?.gate_checks ?? [];
  const passCount = checks.filter((c) => c.pass).length;
  const allPass = checks.length > 0 && passCount === checks.length;

  return (
    <div className="space-y-4">
      <ViewHeader
        title="백테스트 · 성과 리포트"
        subtitle="월 1회 리밸런싱 · 비용 차감 · 룩어헤드 차단(체결=다음날 시가). 이 시스템의 생명선입니다."
        action={
          <RunButton onClick={run} loading={loading}>
            백테스트 실행
          </RunButton>
        }
      />

      {loading && (
        <Card>
          <Spinner label="과거 데이터로 시뮬레이션 중… (실데이터는 다운로드로 수 분 걸릴 수 있음)" />
        </Card>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {!data && !loading && !error && (
        <EmptyState
          icon={<IconChart className="h-6 w-6" />}
          text="‘백테스트 실행’을 누르면 누적 성과·낙폭·월수익·게이트가 한 화면에 표시됩니다."
        />
      )}

      {data && m && !loading && <Tearsheet data={data} />}
    </div>
  );
}

function Tearsheet({ data }: { data: BacktestResponse }) {
  const m = data.metrics;
  const checks = data.gate_checks;
  const passCount = checks.filter((c) => c.pass).length;
  const allPass = checks.length > 0 && passCount === checks.length;

  const recovery = recoveryFactor(data.equity_curve, m.mdd);
  const longestDD = longestDrawdownDays(data.equity_curve);

  const rebalData = data.recent_trades.map((t) => ({
    date: t.rebalance_date,
    net: t.net_return,
  }));

  // Radar: strategy vs SPY on an ABSOLUTE 0–1 scale per axis (higher = better),
  // so the polygon reflects real magnitude instead of pinning the winner to the rim.
  // Fixed reference ranges: CAGR 0→30%, Sharpe 0→2, MDD 0→-50%, Vol 0→40%.
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const radarAxes = [
    {
      metric: "수익",
      strat: clamp01((m.cagr ?? 0) / 0.3),
      bench: clamp01((m.benchmark_cagr ?? 0) / 0.3),
    },
    {
      metric: "샤프",
      strat: clamp01((m.sharpe ?? 0) / 2),
      bench: clamp01((m.benchmark_sharpe ?? 0) / 2),
    },
    {
      metric: "방어",
      strat: clamp01(1 - Math.abs(m.mdd ?? 0) / 0.5),
      bench: clamp01(1 - Math.abs(m.benchmark_mdd ?? 0) / 0.5),
    },
    {
      metric: "안정",
      strat: clamp01(1 - (m.volatility ?? 0) / 0.4),
      bench: clamp01(1 - (m.benchmark_volatility ?? 0) / 0.4),
    },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      <DemoBanner meta={data.meta} />
      <SummaryCard
        title="백테스트 결론"
        verdict={allPass ? "통과" : "불통과"}
        tone={allPass ? "good" : "bad"}
      >
        이 전략은 과거 기간에서 {allPass ? "최소 기준을 통과했습니다" : "최소 기준을 통과하지 못했습니다"}.{" "}
        <HintText label="게이트 판정">
          SPY보다 충분히 나았는지, 위험 대비 수익이 괜찮았는지, 최대낙폭이 너무 크지
          않았는지를 보는 최소 합격선입니다. 통과해도 바로 실거래는 아닙니다.
        </HintText>
        {" "}다음 단계는 기간을 나눠 확인하고, 괜찮으면 페이퍼 트레이딩입니다.
      </SummaryCard>
      <DataQuality meta={data.meta} />

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="card-title">AI 분석용 내보내기</div>
            <p className="mt-1 text-sm font-medium leading-relaxed text-muted">
              다른 AI에게 그대로 보내기 좋게 원본 숫자·설정·게이트·곡선을 구조화 JSON으로 저장합니다. CSV는 리밸런싱 표 분석용입니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <button
              type="button"
              className="btn btn-secondary justify-center"
              onClick={() => exportBacktest(data, "ai-json")}
            >
              AI JSON 저장
            </button>
            <button
              type="button"
              className="btn btn-secondary justify-center"
              onClick={() => exportBacktest(data, "trades-csv")}
            >
              CSV 저장
            </button>
          </div>
        </div>
      </Card>

      {/* KPI band — above the fold, Z-pattern left→right */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="CAGR (연복리)"
          value={pct(m.cagr)}
          sub={`SPY ${pct(m.benchmark_cagr)}`}
          help="1년에 평균 몇 % 벌었는지입니다. SPY보다 높으면 시장보다 잘한 겁니다."
        />
        <Stat
          label="초과수익 vs SPY"
          value={signedPct(m.excess_cagr)}
          tone={(m.excess_cagr ?? 0) > 0 ? "good" : "bad"}
          help="SPY를 그냥 샀을 때보다 연평균 얼마나 더 벌었는지입니다. 마이너스면 SPY보다 못한 겁니다."
        />
        <Stat
          label="샤프"
          value={num(m.sharpe)}
          sub={`SPY ${num(m.benchmark_sharpe)}`}
          help="출렁임 대비 수익입니다. 높을수록 같은 위험으로 더 잘 번 전략입니다."
        />
        <Stat
          label="변동성"
          value={pct(m.volatility)}
          sub={`SPY ${pct(m.benchmark_volatility)}`}
          help="가격이 얼마나 심하게 흔들렸는지입니다. 낮을수록 덜 불안한 전략입니다."
        />
        <Stat
          label="최대낙폭 MDD"
          value={pct(m.mdd)}
          tone="bad"
          sub={`SPY ${pct(m.benchmark_mdd)}`}
          help="최악의 순간에 고점 대비 얼마나 빠졌는지입니다. -40%면 최고점에서 40% 물렸다는 뜻입니다."
        />
        <Stat
          label="평균 회전율"
          value={pct(m.avg_turnover)}
          help="리밸런싱 때 포트폴리오를 얼마나 갈아엎었는지입니다. 높으면 비용과 실전 부담이 커집니다."
        />
      </div>

      {/* Hero: cumulative performance + underwater drawdown, shared axis */}
      <Card>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="card-title">누적 성과 · 전략 vs SPY</div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-brand" /> 전략
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-0.5 w-3 bg-bench" /> SPY
            </span>
            <span className="text-faint">
              {data.period.start} ~ {data.period.end}
            </span>
          </div>
        </div>
        <CumulativeChart
          strategy={data.equity_curve}
          benchmark={data.benchmark_curve}
        />
        <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          낙폭 (Underwater)
        </div>
        <DrawdownChart strategy={data.equity_curve} />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line/60 pt-3 text-xs text-muted">
          <span>
            최대 낙폭 <b className="text-down">{pct(m.mdd)}</b>
          </span>
          <span>
            최장 낙폭 구간{" "}
            <b className="text-fg">{longestDD != null ? `${longestDD}일` : "—"}</b>
          </span>
          <span>
            회복계수{" "}
            <b className="text-fg">{recovery != null ? num(recovery) : "—"}</b>
          </span>
        </div>
      </Card>

      {/* Analytics row: radar · monthly · rebalance P&L */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="card-title">위험·수익 프로파일</div>
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-brand" />전략
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-bench" />SPY
              </span>
            </div>
          </div>
          <RiskRadar axes={radarAxes} />
        </Card>

        <Card>
          <div className="card-title mb-2">월별 수익률</div>
          <MonthlyReturnsBars strategy={data.equity_curve} height={200} />
        </Card>

        <Card>
          <div className="card-title mb-2">리밸런싱별 순수익</div>
          <RebalanceBars data={rebalData} height={200} />
        </Card>
      </div>

      {/* Verdict row: gate gauge + checklist + survivorship caveat */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center text-center">
          <div className="card-title mb-1 self-start">게이트 판정</div>
          <GaugeRing
            value={checks.length ? passCount / checks.length : 0}
            label={`${passCount}/${checks.length}`}
            sublabel="기준 충족"
            color={allPass ? "#34d399" : "#fb7185"}
          />
          <div
            className={`text-lg font-extrabold ${
              allPass ? "text-up" : "text-down"
            }`}
          >
            {allPass ? "통과" : "불통과"}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            통과해도 실거래 자격이 아니라 페이퍼 테스트 허들입니다.
          </p>
        </Card>

        <div className="lg:col-span-2">
          <GateVerdict checks={checks} passed={allPass} />
        </div>
      </div>

      {/* Survivorship caveat */}
      <div className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4">
        <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <p className="text-sm font-medium leading-relaxed text-fg">
          <b className="text-warn">중요: 생존편향 한계</b> · 현재 S&P500 구성종목만 사용
          → 망한 회사가 빠져 있어 결과가 <b className="text-white">실제보다 좋게</b>{" "}
          나올 수 있습니다. <HintText label="생존편향 설명">과거에 망해서 S&P500에서 빠진 회사가 데이터에 없으면, 과거 성과가 실제보다 좋아 보입니다.</HintText>
        </p>
      </div>

      {/* Detail: recent rebalances with cost transparency */}
      <Card className="!p-0">
        <div className="card-pad pb-2">
          <div className="card-title">최근 리밸런싱 · 비용 투명화</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">리밸일</th>
                <th className="th text-right">총수익</th>
                <th className="th text-right">비용</th>
                <th className="th text-right">순수익</th>
                <th className="th text-right">회전율</th>
                <th className="th text-right">종목수</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_trades.map((t) => (
                <tr key={t.rebalance_date} className="border-t border-line/50">
                  <td className="td font-semibold text-fg">{t.rebalance_date}</td>
                  <td className="td text-right">{signedPct(t.gross_return)}</td>
                  <td className="td text-right text-down">−{pct(t.cost, 2)}</td>
                  <td
                    className={`td text-right font-semibold ${
                      t.net_return >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {signedPct(t.net_return)}
                  </td>
                  <td className="td text-right font-semibold text-fg">{pct(t.turnover)}</td>
                  <td className="td text-right font-semibold text-fg">{t.n_holdings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
