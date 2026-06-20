"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { CompareResponse, OosResponse } from "@/lib/types";
import { pct, signedPct, num } from "@/lib/format";
import { Settings } from "./ConfigBar";
import { DataQuality, DemoBanner, ErrorBanner, RunButton, Spinner, Stat } from "./ui";
import { GateVerdict } from "./GateVerdict";

const AXES: Record<string, { label: string; variants: { label: string; v: Record<string, unknown> }[] }> = {
  trend: {
    label: "추세 게이트 ON / OFF",
    variants: [
      { label: "게이트 OFF", v: { trend_gate: false } },
      { label: "게이트 ON", v: { trend_gate: true } },
    ],
  },
  topn: {
    label: "보유 종목 수 15 / 20 / 25",
    variants: [
      { label: "15종목", v: { top_n: 15 } },
      { label: "20종목", v: { top_n: 20 } },
      { label: "25종목", v: { top_n: 25 } },
    ],
  },
};

export function CompareOosView({ settings }: { settings: Settings }) {
  return (
    <div className="space-y-8">
      <CompareSection settings={settings} />
      <div className="border-t border-ink-600" />
      <OosSection settings={settings} />
    </div>
  );
}

function CompareSection({ settings }: { settings: Settings }) {
  const [axis, setAxis] = useState("trend");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [labels, setLabels] = useState<string[]>([]);

  const run = async () => {
    setLoading(true);
    setError(null);
    const chosen = AXES[axis];
    try {
      const res = await api.compare({
        config: settings.config,
        variants: chosen.variants.map((x) => x.v),
        mode: settings.mode,
        max_tickers: settings.maxTickers,
        start: settings.start,
        end: settings.end,
      });
      setLabels(chosen.variants.map((x) => x.label));
      setData(res);
    } catch (e) {
      setError(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">버전 비교</h2>
          <p className="text-sm text-slate-400">
            전략 보수성은 미리 깔지 말고 가설로 비교. 2~3개만 — 미세조정은 과최적화.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-56">
            <span className="label">비교 축</span>
            <select
              className="select"
              value={axis}
              onChange={(e) => setAxis(e.target.value)}
            >
              {Object.entries(AXES).map(([k, a]) => (
                <option key={k} value={k}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <RunButton onClick={run} loading={loading}>
            비교 실행
          </RunButton>
        </div>
      </div>

      {loading && (
        <div className="card">
          <Spinner label="버전별 백테스트 중…" />
        </div>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {data && !loading && (
        <>
          <DemoBanner meta={data.meta} />
          <div className="card overflow-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">버전</th>
                  <th className="th text-right">CAGR</th>
                  <th className="th text-right">초과수익</th>
                  <th className="th text-right">샤프</th>
                  <th className="th text-right">샤프Δ</th>
                  <th className="th text-right">MDD</th>
                  <th className="th text-right">회전율</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((v, i) => (
                  <tr key={i} className="border-t border-ink-700/60">
                    <td className="td font-semibold">{labels[i] ?? `v${i}`}</td>
                    <td className="td text-right">{pct(v.cagr as number)}</td>
                    <td
                      className={`td text-right font-semibold ${
                        (v.excess_cagr as number) > 0 ? "text-good" : "text-bad"
                      }`}
                    >
                      {signedPct(v.excess_cagr as number)}
                    </td>
                    <td className="td text-right">{num(v.sharpe as number)}</td>
                    <td className="td text-right">{num(v.sharpe_delta as number)}</td>
                    <td className="td text-right text-bad">{pct(v.mdd as number)}</td>
                    <td className="td text-right text-slate-400">
                      {pct(v.avg_turnover as number)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataQuality meta={data.meta} />
        </>
      )}
    </div>
  );
}

function OosSection({ settings }: { settings: Settings }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<OosResponse | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.oos({
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

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">아웃오브샘플 (OOS)</h2>
          <p className="text-sm text-slate-400">
            개발 기간에서 고른 전략을 ‘안 본 기간’에서 재검증. 분할일{" "}
            {settings.config.oos_split_date}.
          </p>
        </div>
        <RunButton onClick={run} loading={loading}>
          OOS 검증
        </RunButton>
      </div>

      {loading && (
        <div className="card">
          <Spinner label="개발/검증 기간 분리 시뮬 중…" />
        </div>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {data && !loading && (
        <>
          <DemoBanner meta={data.meta} />
          <div className="rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
            🔒 {data.oos_consumed_warning}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SplitCard title="개발 기간" checks={data.dev_checks} m={data.development} />
            <SplitCard title="OOS (안 본 기간)" checks={data.oos_checks} m={data.oos} />
          </div>

          <GateVerdict
            checks={data.oos_checks}
            passed={data.passes_gate}
            title="최종 게이트 (개발 + OOS 둘 다 충족해야 통과)"
          />
          <DataQuality meta={data.meta} />
        </>
      )}
    </div>
  );
}

function SplitCard({
  title,
  m,
}: {
  title: string;
  checks: OosResponse["dev_checks"];
  m: OosResponse["development"];
}) {
  return (
    <div className="card">
      <div className="card-title mb-3">{title}</div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="CAGR" value={pct(m.cagr)} sub={`SPY ${pct(m.benchmark_cagr)}`} />
        <Stat
          label="초과수익"
          value={signedPct(m.excess_cagr)}
          tone={(m.excess_cagr ?? 0) > 0 ? "good" : "bad"}
        />
        <Stat label="MDD" value={pct(m.mdd)} tone="bad" />
      </div>
    </div>
  );
}
