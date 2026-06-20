"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { CompareResponse, OosResponse } from "@/lib/types";
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
import { GateVerdict } from "./GateVerdict";
import { IconScale } from "./icons";

const AXES: Record<
  string,
  { label: string; variants: { label: string; v: Record<string, unknown> }[] }
> = {
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
      <div className="divider" />
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
      <ViewHeader
        title="버전 비교"
        subtitle="전략 보수성은 미리 깔지 말고 가설로 비교. 2~3개만 — 미세조정은 과최적화."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
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

      {loading && (
        <Card>
          <Spinner label="버전별 백테스트 중…" />
        </Card>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {!data && !loading && !error && (
        <EmptyState
          icon={<IconScale className="h-6 w-6" />}
          text="비교 축을 고르고 ‘비교 실행’을 누르면 버전별 성과표가 여기에 표시됩니다."
        />
      )}

      {data && !loading && (
        <div className="animate-fade-up space-y-4">
          <DemoBanner meta={data.meta} />
          <Card className="!p-0">
            <div className="overflow-auto">
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
                    <tr key={i} className="border-t border-line/50">
                      <td className="td font-semibold text-fg">
                        {labels[i] ?? `v${i}`}
                      </td>
                      <td className="td text-right">{pct(v.cagr as number)}</td>
                      <td
                        className={`td text-right font-semibold ${
                          (v.excess_cagr as number) > 0
                            ? "text-up"
                            : "text-down"
                        }`}
                      >
                        {signedPct(v.excess_cagr as number)}
                      </td>
                      <td className="td text-right">{num(v.sharpe as number)}</td>
                      <td className="td text-right text-muted">
                        {num(v.sharpe_delta as number)}
                      </td>
                      <td className="td text-right text-down">
                        {pct(v.mdd as number)}
                      </td>
                      <td className="td text-right text-muted">
                        {pct(v.avg_turnover as number)}
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
      <ViewHeader
        title="아웃오브샘플 (OOS)"
        subtitle={`개발 기간에서 고른 전략을 ‘안 본 기간’에서 재검증. 분할일 ${settings.config.oos_split_date}.`}
        action={
          <RunButton onClick={run} loading={loading}>
            OOS 검증
          </RunButton>
        }
      />

      {loading && (
        <Card>
          <Spinner label="개발/검증 기간 분리 시뮬 중…" />
        </Card>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {data && !loading && (
        <div className="animate-fade-up space-y-4">
          <DemoBanner meta={data.meta} />
          <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            🔒 {data.oos_consumed_warning}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SplitCard
              title="개발 기간"
              checks={data.dev_checks}
              m={data.development}
            />
            <SplitCard
              title="OOS (안 본 기간)"
              checks={data.oos_checks}
              m={data.oos}
            />
          </div>

          <GateVerdict
            checks={data.oos_checks}
            passed={data.passes_gate}
            title="최종 게이트 (개발 + OOS 둘 다 충족해야 통과)"
          />
          <DataQuality meta={data.meta} />
        </div>
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
    <Card>
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
    </Card>
  );
}
