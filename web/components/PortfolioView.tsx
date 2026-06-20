"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { PortfolioResponse } from "@/lib/types";
import { pct, num } from "@/lib/format";
import { Settings } from "./ConfigBar";
import { DataQuality, DemoBanner, ErrorBanner, RunButton, Spinner } from "./ui";
import { SectorDonut, SECTOR_COLORS } from "./charts";

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">오늘의 포트폴리오</h2>
          <p className="text-sm text-slate-400">
            최신 가격 기준으로 점수를 매겨 상위 {settings.config.top_n}종목과 비중을
            계산합니다.
          </p>
        </div>
        <RunButton onClick={run} loading={loading}>
          포트폴리오 생성
        </RunButton>
      </div>

      {loading && (
        <div className="card">
          <Spinner label="데이터를 받아 점수를 계산하는 중…" />
        </div>
      )}
      {error ? <ErrorBanner error={error} /> : null}

      {data && !loading && (
        <>
          <DemoBanner meta={data.meta} />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">
              기준일 <b className="text-slate-200">{data.as_of}</b>
            </span>
            <DataQuality meta={data.meta} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <div className="card-title mb-3">보유 종목 ({data.holdings.length})</div>
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-ink-800">
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
                        className="border-t border-ink-700/60 hover:bg-ink-700/30"
                      >
                        <td className="td text-slate-500">{i + 1}</td>
                        <td className="td font-semibold">{h.ticker}</td>
                        <td className="td text-slate-400">{h.sector ?? "—"}</td>
                        <td className="td text-right">{num(h.score)}</td>
                        <td className="td text-right font-semibold text-accent">
                          {pct(h.weight)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-title mb-3">섹터 분포</div>
              <SectorDonut data={data.sector_weights} />
              <div className="mt-3 space-y-1">
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
                      <span className="text-slate-300">{sw.sector}</span>
                    </span>
                    <span className="font-mono text-slate-400">
                      {pct(sw.weight)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
