"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { BacktestResponse } from "@/lib/types";
import { pct, signedPct, num } from "@/lib/format";
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
import { EquityChart } from "./charts";
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
  const allPass = data?.gate_checks.every((c) => c.pass) ?? false;

  return (
    <div className="space-y-4">
      <ViewHeader
        title="정직한 백테스트"
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
          text="‘백테스트 실행’을 누르면 전략 vs SPY 자산곡선과 합격/불합격 게이트가 여기에 표시됩니다."
        />
      )}

      {data && m && !loading && (
        <div className="animate-fade-up space-y-4">
          <DemoBanner meta={data.meta} />

          {/* KPI strip — at-a-glance numbers up top */}
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

          {/* Equity curve — the hero chart */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="card-title">자산곡선 (전략 vs SPY)</div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand" /> 전략
                </span>
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-0.5 w-3 bg-faint" /> SPY
                </span>
                <span className="text-faint">
                  {data.period.start} ~ {data.period.end}
                </span>
              </div>
            </div>
            <EquityChart
              strategy={data.equity_curve}
              benchmark={data.benchmark_curve}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <GateVerdict checks={data.gate_checks} passed={allPass} />
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-warn/30 bg-warn/[0.06] p-4">
              <div className="card-title flex items-center gap-1.5 text-warn">
                <IconAlert className="h-4 w-4" /> 생존편향 한계
              </div>
              <p className="text-xs leading-relaxed text-muted">
                현재 S&P500 구성종목만 사용 → 망한 회사가 빠져 있어 결과가{" "}
                <b className="text-fg">실제보다 좋게</b> 나옵니다. SPY 대비
                초과수익도 부풀려질 수 있어요. 숫자를 그대로 믿지 말 것.
              </p>
            </div>
          </div>

          <Card>
            <div className="card-title mb-3">최근 리밸런싱 (비용 투명화)</div>
            <div className="-mx-1 overflow-auto">
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
                    <tr
                      key={t.rebalance_date}
                      className="border-t border-line/50"
                    >
                      <td className="td text-muted">{t.rebalance_date}</td>
                      <td className="td text-right">
                        {signedPct(t.gross_return)}
                      </td>
                      <td className="td text-right text-down">
                        −{pct(t.cost, 2)}
                      </td>
                      <td
                        className={`td text-right font-semibold ${
                          t.net_return >= 0 ? "text-up" : "text-down"
                        }`}
                      >
                        {signedPct(t.net_return)}
                      </td>
                      <td className="td text-right text-muted">
                        {pct(t.turnover)}
                      </td>
                      <td className="td text-right text-muted">
                        {t.n_holdings}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <DataQuality meta={data.meta} />
        </div>
      )}
    </div>
  );
}
