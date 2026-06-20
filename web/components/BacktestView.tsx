"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { BacktestResponse } from "@/lib/types";
import { pct, signedPct, num } from "@/lib/format";
import { Settings } from "./ConfigBar";
import { DataQuality, DemoBanner, ErrorBanner, RunButton, Spinner, Stat } from "./ui";
import { EquityChart } from "./charts";
import { GateVerdict } from "./GateVerdict";

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">정직한 백테스트</h2>
          <p className="text-sm text-slate-400">
            월 1회 리밸런싱 · 비용 차감 · 룩어헤드 차단(체결=다음날 시가). 이 시스템의
            생명선입니다.
          </p>
        </div>
        <RunButton onClick={run} loading={loading}>
          백테스트 실행
        </RunButton>
      </div>

      {loading && (
        <div className="card">
          <Spinner label="과거 데이터로 시뮬레이션 중… (실데이터는 다운로드로 수 분 걸릴 수 있음)" />
        </div>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {data && m && !loading && (
        <>
          <DemoBanner meta={data.meta} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <GateVerdict checks={data.gate_checks} passed={allPass} />
            </div>
            <div className="card flex flex-col justify-center border-warn/40 bg-warn/5">
              <div className="card-title text-warn">⚠ 생존편향 한계</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                현재 S&P500 구성종목만 사용 → 망한 회사가 빠져 있어 결과가{" "}
                <b>실제보다 좋게</b> 나옵니다. SPY 대비 초과수익도 부풀려질 수 있어요.
                숫자를 그대로 믿지 말 것.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <div className="card-title">자산곡선 (전략 vs SPY)</div>
              <span className="text-xs text-slate-500">
                {data.period.start} ~ {data.period.end}
              </span>
            </div>
            <EquityChart
              strategy={data.equity_curve}
              benchmark={data.benchmark_curve}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
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

          <div className="card">
            <div className="card-title mb-3">최근 리밸런싱 (비용 투명화)</div>
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
                    <tr key={t.rebalance_date} className="border-t border-ink-700/60">
                      <td className="td text-slate-400">{t.rebalance_date}</td>
                      <td className="td text-right">{signedPct(t.gross_return)}</td>
                      <td className="td text-right text-bad">−{pct(t.cost, 2)}</td>
                      <td
                        className={`td text-right font-semibold ${
                          t.net_return >= 0 ? "text-good" : "text-bad"
                        }`}
                      >
                        {signedPct(t.net_return)}
                      </td>
                      <td className="td text-right text-slate-400">{pct(t.turnover)}</td>
                      <td className="td text-right text-slate-400">{t.n_holdings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DataQuality meta={data.meta} />
        </>
      )}
    </div>
  );
}
