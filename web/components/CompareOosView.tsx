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
  HintText,
  RunButton,
  Spinner,
  Stat,
  SummaryCard,
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

  const bestIndex = data
    ? data.variants.reduce(
        (best, v, i, arr) =>
          (v.excess_cagr as number) > (arr[best].excess_cagr as number) ? i : best,
        0,
      )
    : 0;
  const bestLabel = labels[bestIndex] ?? `v${bestIndex}`;

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
          <SummaryCard title="버전 비교 결론" verdict={bestLabel} tone="neutral">
            현재 비교에서는 <b>{bestLabel}</b>의 SPY 대비 초과수익이 가장 높습니다. 단, 이건{" "}
            <HintText label="과최적화 주의">
              과거에 제일 잘 맞는 설정을 계속 찾다 보면 미래에는 안 먹히는 꼼수가 될 수 있습니다.
              비교는 2~3개 가설만 보는 용도로 쓰는 게 안전합니다.
            </HintText>
            입니다.
          </SummaryCard>
          <DataQuality meta={data.meta} />
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
                      <td className="td text-right font-semibold text-fg">
                        {num(v.sharpe_delta as number)}
                      </td>
                      <td className="td text-right text-down">
                        {pct(v.mdd as number)}
                      </td>
                      <td className="td text-right font-semibold text-fg">
                        {pct(v.avg_turnover as number)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
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
          <SummaryCard
            title="OOS 검증 결론"
            verdict={data.passes_gate ? "통과" : "불통과"}
            tone={data.passes_gate ? "good" : "bad"}
          >
            개발 기간에서 본 전략이 안 본 기간에서도 버텼는지 확인합니다. {" "}
            <HintText label="OOS 설명">
              한 번도 기준을 맞출 때 쓰지 않은 기간입니다. 여기서도 괜찮아야 과거에만 맞춘 전략일 가능성이 줄어듭니다.
            </HintText>
          </SummaryCard>
          <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn">
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
