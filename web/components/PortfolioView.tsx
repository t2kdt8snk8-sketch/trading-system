"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { PortfolioResponse } from "@/lib/types";
import { pct, num } from "@/lib/format";
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
import { SectorDonut, HBars, SECTOR_COLORS } from "./charts";
import { IconWallet } from "./icons";

export function PortfolioView({ settings }: { settings: Settings }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<PortfolioResponse | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.portfolio({
        config: settings.config,
        mode: settings.mode,
        max_tickers: settings.maxTickers,
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
        title="포트폴리오 · 구성 분석"
        subtitle={`최신 가격 기준으로 점수를 매겨 상위 ${settings.config.top_n}종목과 비중을 계산합니다.`}
        action={
          <RunButton onClick={run} loading={loading}>
            포트폴리오 생성
          </RunButton>
        }
      />

      {loading && (
        <Card>
          <Spinner label="데이터를 받아 점수를 계산하는 중…" />
        </Card>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {!data && !loading && !error && (
        <EmptyState
          icon={<IconWallet className="h-6 w-6" />}
          text="‘포트폴리오 생성’을 누르면 집중도·섹터 분포·보유 종목이 한 화면에 표시됩니다."
        />
      )}

      {data && !loading && <PortfolioDash data={data} />}
    </div>
  );
}

function PortfolioDash({ data }: { data: PortfolioResponse }) {
  const weights = data.holdings
    .map((h) => h.weight ?? 0)
    .sort((a, b) => b - a);
  const top5 = weights.slice(0, 5).reduce((s, w) => s + w, 0);
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const effN = hhi > 0 ? 1 / hhi : 0; // effective number of positions
  const maxW = weights[0] ?? 0;
  const nSectors = data.sector_weights.filter((s) => (s.weight ?? 0) > 0).length;

  const topHoldings = [...data.holdings]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 10)
    .map((h) => ({ label: h.ticker, value: h.weight ?? 0 }));

  return (
    <div className="animate-fade-up space-y-4">
      <DemoBanner meta={data.meta} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">
          기준일 <b className="text-fg">{data.as_of}</b>
        </span>
        <DataQuality meta={data.meta} />
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="보유 종목" value={String(data.holdings.length)} />
        <Stat label="상위 5종목 집중도" value={pct(top5)} />
        <Stat label="유효 종목수 (1/HHI)" value={num(effN, 1)} />
        <Stat label="최대 비중" value={pct(maxW)} />
        <Stat label="섹터 수" value={String(nSectors)} />
      </div>

      {/* Charts row: top holdings bars + sector donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="card-title mb-3">상위 비중 종목 (Top 10)</div>
          <HBars data={topHoldings} />
        </Card>
        <Card>
          <div className="card-title mb-3">섹터 분포</div>
          <SectorDonut data={data.sector_weights} />
          <div className="mt-3 space-y-1.5">
            {data.sector_weights.map((sw, i) => (
              <div
                key={sw.sector}
                className="flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: SECTOR_COLORS[i % SECTOR_COLORS.length],
                    }}
                  />
                  <span className="text-muted">{sw.sector}</span>
                </span>
                <span className="nums font-mono text-muted">
                  {pct(sw.weight)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Full holdings table */}
      <Card className="!p-0">
        <div className="card-pad pb-2">
          <div className="card-title">보유 종목 ({data.holdings.length})</div>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <th className="th">#</th>
                <th className="th">종목</th>
                <th className="th">섹터</th>
                <th className="th text-right">점수</th>
                <th className="th text-right">비중</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h, i) => (
                <tr
                  key={h.ticker}
                  className="border-t border-line/50 transition hover:bg-surface2/40"
                >
                  <td className="td text-faint">{i + 1}</td>
                  <td className="td font-semibold text-fg">{h.ticker}</td>
                  <td className="td text-muted">{h.sector ?? "—"}</td>
                  <td className="td text-right text-muted">{num(h.score)}</td>
                  <td className="td text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface2 sm:block">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{
                            width: `${((h.weight ?? 0) / (maxW || 1)) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="font-semibold text-brand">
                        {pct(h.weight)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
