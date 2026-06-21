"use client";

import { useState } from "react";
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
  RunButton,
  Spinner,
  Stat,
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

export function BacktestView({ settings }: { settings: Settings }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<BacktestResponse | null>(null);

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

      {/* KPI band — above the fold, Z-pattern left→right */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="CAGR (연복리)"
          value={pct(m.cagr)}
          sub={`SPY ${pct(m.benchmark_cagr)}`}
        />
        <Stat
          label="초과수익 vs SPY"
          value={signedPct(m.excess_cagr)}
          tone={(m.excess_cagr ?? 0) > 0 ? "good" : "bad"}
        />
        <Stat
          label="샤프"
          value={num(m.sharpe)}
          sub={`SPY ${num(m.benchmark_sharpe)}`}
        />
        <Stat
          label="변동성"
          value={pct(m.volatility)}
          sub={`SPY ${pct(m.benchmark_volatility)}`}
        />
        <Stat
          label="최대낙폭 MDD"
          value={pct(m.mdd)}
          tone="bad"
          sub={`SPY ${pct(m.benchmark_mdd)}`}
        />
        <Stat label="평균 회전율" value={pct(m.avg_turnover)} />
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
      <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/[0.06] p-4">
        <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <p className="text-xs leading-relaxed text-muted">
          <b className="text-warn">생존편향 한계</b> · 현재 S&P500 구성종목만 사용
          → 망한 회사가 빠져 있어 결과가 <b className="text-fg">실제보다 좋게</b>{" "}
          나옵니다. SPY 대비 초과수익도 부풀려질 수 있어요. 숫자를 그대로 믿지 말
          것.
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
                  <td className="td text-muted">{t.rebalance_date}</td>
                  <td className="td text-right">{signedPct(t.gross_return)}</td>
                  <td className="td text-right text-down">−{pct(t.cost, 2)}</td>
                  <td
                    className={`td text-right font-semibold ${
                      t.net_return >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {signedPct(t.net_return)}
                  </td>
                  <td className="td text-right text-muted">{pct(t.turnover)}</td>
                  <td className="td text-right text-muted">{t.n_holdings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DataQuality meta={data.meta} />
    </div>
  );
}
