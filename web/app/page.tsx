"use client";

import { useState } from "react";
import { ConfigBar, DEFAULT_SETTINGS, Settings } from "@/components/ConfigBar";
import { PortfolioView } from "@/components/PortfolioView";
import { BacktestView } from "@/components/BacktestView";
import { CompareOosView } from "@/components/CompareOosView";

type Tab = "portfolio" | "backtest" | "compare";

const TABS: { id: Tab; label: string }[] = [
  { id: "portfolio", label: "오늘의 포트폴리오" },
  { id: "backtest", label: "백테스트" },
  { id: "compare", label: "버전 비교 / OOS" },
];

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>("backtest");

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          AI 보조 주식 스코어링 · 백테스트
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          AI가 구조를 짜고, 사람이 선을 긋는다. 비용 반영 백테스트에서 엣지가 보이기
          전엔 실제 돈을 넣지 않는다.
        </p>
      </header>

      <div className="mb-5">
        <ConfigBar
          settings={settings}
          onChange={setSettings}
          showDates={tab !== "portfolio"}
        />
      </div>

      <nav className="mb-6 flex gap-1 border-b border-ink-600">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-accent text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "portfolio" && <PortfolioView settings={settings} />}
      {tab === "backtest" && <BacktestView settings={settings} />}
      {tab === "compare" && <CompareOosView settings={settings} />}

      <footer className="mt-12 border-t border-ink-700 pt-4 text-xs text-slate-600">
        데이터 출처: yfinance · Wikipedia GICS · 백테스트 통과는 페이퍼 테스트 자격일
        뿐, 실거래 자격이 아닙니다.
      </footer>
    </main>
  );
}
