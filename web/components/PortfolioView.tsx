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
  HintText,
  RunButton,
  Spinner,
  SummaryCard,
  ViewHeader,
} from "./ui";
import { SectorDonut, SECTOR_COLORS } from "./charts";
import { IconWallet } from "./icons";

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

function buildHoldingsCsv(data: PortfolioResponse) {
  const header = ["rank", "ticker", "sector", "score", "weight_decimal"];
  const rows = data.holdings.map((h, i) => [i + 1, h.ticker, h.sector ?? "", h.score, h.weight]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function buildPortfolioAiJson(data: PortfolioResponse) {
  return {
    schema: "trading-system.portfolio.ai-export.v1",
    generated_at: new Date().toISOString(),
    intended_use:
      "Send this JSON to an AI assistant for review of today's target portfolio. Weights are decimals, not percent strings.",
    warnings_for_ai: [
      "This is a rule-based candidate list (risk-adjusted momentum), not personalized advice or a guaranteed buy signal.",
      "Backtests of this rule were roughly market-like after removing survivorship bias; do not assume it beats the index.",
      "Scores are relative rankings, NOT predicted returns.",
    ],
    as_of: data.as_of,
    config: data.config,
    holdings: data.holdings,
    sector_weights: data.sector_weights,
    data_meta: data.meta,
  };
}

function exportPortfolio(data: PortfolioResponse, kind: "ai-json" | "holdings-csv") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const asOf = safeFilePart(data.as_of);
  if (kind === "holdings-csv") {
    downloadTextFile(
      `portfolio-holdings-${asOf}-${stamp}.csv`,
      buildHoldingsCsv(data),
      "text/csv;charset=utf-8",
    );
    return;
  }
  downloadTextFile(
    `portfolio-ai-export-${asOf}-${stamp}.json`,
    JSON.stringify(buildPortfolioAiJson(data), null, 2),
    "application/json;charset=utf-8",
  );
}

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

  const maxWeight = data
    ? Math.max(...data.holdings.map((h) => h.weight ?? 0), 0.0001)
    : 1;

  return (
    <div className="space-y-4">
      <ViewHeader
        title="오늘의 포트폴리오"
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
          text="‘포트폴리오 생성’을 누르면 상위 종목 랭킹과 섹터 분포가 여기에 표시됩니다."
        />
      )}

      {data && !loading && (
        <div className="animate-fade-up space-y-4">
          <DemoBanner meta={data.meta} />
          <SummaryCard title="오늘의 종목 후보" verdict={`${data.holdings.length}종목`} tone="neutral">
            점수 상위 종목을 고르고 비중을 계산한 결과입니다. 이건 매수 지시가 아니라{" "}
            <HintText label="후보 리스트">
              지금 규칙으로 보면 상대적으로 좋아 보이는 종목 목록입니다. 실제 매수 전에는
              백테스트와 페이퍼 트레이딩 검증이 먼저 필요합니다.
            </HintText>
            입니다. 기준일은 <b>{data.as_of}</b>.
          </SummaryCard>
          <DataQuality meta={data.meta} />

          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="card-title">내보내기</div>
                <p className="mt-1 text-sm font-medium leading-relaxed text-muted">
                  오늘의 종목·비중·점수를 저장합니다. CSV는 증권사·엑셀에 넣기 좋고, AI JSON은 다른 AI에게 검토받기 좋습니다.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                <button
                  type="button"
                  className="btn btn-secondary justify-center"
                  onClick={() => exportPortfolio(data, "ai-json")}
                >
                  AI JSON 저장
                </button>
                <button
                  type="button"
                  className="btn btn-secondary justify-center"
                  onClick={() => exportPortfolio(data, "holdings-csv")}
                >
                  CSV 저장
                </button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="card-title mb-3">
                보유 종목 ({data.holdings.length})
              </div>
              <div className="-mx-1 max-h-[480px] overflow-auto">
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
                        <td className="td text-right font-semibold text-fg">
                          {num(h.score)}
                        </td>
                        <td className="td text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface2 sm:block">
                              <span
                                className="block h-full rounded-full bg-brand"
                                style={{
                                  width: `${((h.weight ?? 0) / maxWeight) * 100}%`,
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

            <Card>
              <div className="card-title mb-3">섹터 분포</div>
              <SectorDonut data={data.sector_weights} />
              <div className="mt-4 space-y-1.5">
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
                      <span className="font-semibold text-fg">{sw.sector}</span>
                    </span>
                    <span className="nums font-mono font-bold text-fg">
                      {pct(sw.weight)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
