"use client";

import { useState } from "react";
import {
  DEFAULT_SETTINGS,
  Settings,
  SettingsSheet,
} from "@/components/ConfigBar";
import { PortfolioView } from "@/components/PortfolioView";
import { BacktestView } from "@/components/BacktestView";
import { CompareOosView } from "@/components/CompareOosView";
import { Segmented } from "@/components/ui";
import {
  IconChart,
  IconScale,
  IconSliders,
  IconWallet,
} from "@/components/icons";

type Tab = "portfolio" | "backtest" | "compare";

const TABS: {
  id: Tab;
  label: string;
  short: string;
  icon: typeof IconChart;
}[] = [
  { id: "portfolio", label: "오늘의 포트폴리오", short: "포트폴리오", icon: IconWallet },
  { id: "backtest", label: "백테스트", short: "백테스트", icon: IconChart },
  { id: "compare", label: "버전 비교 / OOS", short: "비교·OOS", icon: IconScale },
];

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>("backtest");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] pb-24 sm:pb-10">
      {/* Sticky app bar */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-[#04222a] shadow-glow">
              <IconChart className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">Quant Desk</div>
              <div className="hidden text-[11px] text-faint sm:block">
                스코어링 · 백테스트
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <Segmented
                value={settings.mode}
                onChange={(m) => setSettings({ ...settings, mode: m })}
                options={[
                  { value: "live", label: "실데이터" },
                  { value: "demo", label: "데모" },
                ]}
              />
            </div>
            <button
              className="btn-icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="설정"
            >
              <IconSliders className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="mx-auto hidden max-w-6xl gap-1 px-6 sm:flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                tab === t.id
                  ? "border-brand text-fg"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Mobile data-source bar */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-4 sm:hidden">
        <p className="text-xs text-faint">데이터 소스</p>
        <Segmented
          value={settings.mode}
          onChange={(m) => setSettings({ ...settings, mode: m })}
          options={[
            { value: "live", label: "실데이터" },
            { value: "demo", label: "데모" },
          ]}
        />
      </div>

      {/* Content: keep every tab mounted so in-flight requests/results survive tab switches. */}
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        <section hidden={tab !== "portfolio"} aria-hidden={tab !== "portfolio"}>
          <PortfolioView settings={settings} />
        </section>
        <section hidden={tab !== "backtest"} aria-hidden={tab !== "backtest"}>
          <BacktestView settings={settings} />
        </section>
        <section hidden={tab !== "compare"} aria-hidden={tab !== "compare"}>
          <CompareOosView settings={settings} />
        </section>

        <footer className="mt-12 border-t border-line/60 pt-5 text-xs leading-relaxed text-faint">
          데이터 출처: yfinance · Wikipedia GICS · 백테스트 통과는 페이퍼 테스트
          자격일 뿐, 실거래 자격이 아닙니다.
        </footer>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-bg/90 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-3 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-brand" : "text-faint"
                }`}
              >
                <t.icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                {t.short}
              </button>
            );
          })}
        </div>
      </nav>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        showDates={tab !== "portfolio"}
      />
    </div>
  );
}
