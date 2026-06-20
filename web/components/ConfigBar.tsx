"use client";

import { useState } from "react";
import { DataMode } from "@/lib/types";

export interface Settings {
  mode: DataMode;
  maxTickers: number | null;
  start: string;
  end: string | null;
  config: {
    signal: string;
    top_n: number;
    sector_neutral: boolean;
    trend_gate: boolean;
    weighting: string;
    slippage_bps: number;
    commission_bps: number;
    oos_split_date: string;
    pass_excess_cagr: number;
    pass_max_mdd: number;
    pass_sharpe_delta: number;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "live",
  maxTickers: 80,
  start: "2012-01-01",
  end: null,
  config: {
    signal: "risk_adjusted_momentum",
    top_n: 20,
    sector_neutral: true,
    trend_gate: false,
    weighting: "inverse_vol",
    slippage_bps: 7.5,
    commission_bps: 0.0,
    oos_split_date: "2021-01-01",
    pass_excess_cagr: 0.03,
    pass_max_mdd: -0.35,
    pass_sharpe_delta: 0.0,
  },
};

export function ConfigBar({
  settings,
  onChange,
  showDates,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  showDates?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = settings;
  const setCfg = (patch: Partial<Settings["config"]>) =>
    onChange({ ...s, config: { ...s.config, ...patch } });

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Data mode */}
        <div>
          <span className="label">데이터</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-ink-500">
            {(["live", "demo"] as DataMode[]).map((m) => (
              <button
                key={m}
                onClick={() => onChange({ ...s, mode: m })}
                className={`px-3 py-2 text-sm font-medium ${
                  s.mode === m
                    ? m === "demo"
                      ? "bg-warn text-black"
                      : "bg-accent text-white"
                    : "bg-ink-700 text-slate-300"
                }`}
              >
                {m === "live" ? "실데이터" : "데모"}
              </button>
            ))}
          </div>
        </div>

        {/* Universe size */}
        <div className="w-32">
          <label className="label">유니버스 크기</label>
          <input
            type="number"
            className="input"
            min={5}
            value={s.maxTickers ?? ""}
            placeholder="전체"
            onChange={(e) =>
              onChange({
                ...s,
                maxTickers: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>

        {showDates && (
          <>
            <div className="w-36">
              <label className="label">시작일</label>
              <input
                type="date"
                className="input"
                value={s.start}
                onChange={(e) => onChange({ ...s, start: e.target.value })}
              />
            </div>
            <div className="w-36">
              <label className="label">종료일 (비우면 오늘)</label>
              <input
                type="date"
                className="input"
                value={s.end ?? ""}
                onChange={(e) =>
                  onChange({ ...s, end: e.target.value || null })
                }
              />
            </div>
          </>
        )}

        <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "전략 설정 닫기 ▲" : "전략 설정 ▼"}
        </button>
      </div>

      {s.maxTickers !== null && s.mode === "live" && (
        <p className="text-xs text-warn">
          ※ 유니버스를 {s.maxTickers}개로 줄이면 빠르지만 <b>실제 S&P500이 아닙니다</b>
          (위키 목록 앞에서부터 {s.maxTickers}개). 진짜 결과는 “전체”로 두고 돌리세요 —
          대신 다운로드가 느립니다.
        </p>
      )}

      {open && (
        <div className="grid grid-cols-2 gap-4 border-t border-ink-600 pt-4 md:grid-cols-3 lg:grid-cols-4">
          <Field label="점수 신호">
            <select
              className="select"
              value={s.config.signal}
              onChange={(e) => setCfg({ signal: e.target.value })}
            >
              <option value="risk_adjusted_momentum">위험조정 모멘텀</option>
              <option value="pure_momentum">순수 모멘텀</option>
            </select>
          </Field>
          <Field label="보유 종목 수">
            <input
              type="number"
              className="input"
              value={s.config.top_n}
              onChange={(e) => setCfg({ top_n: Number(e.target.value) })}
            />
          </Field>
          <Field label="비중 방식">
            <select
              className="select"
              value={s.config.weighting}
              onChange={(e) => setCfg({ weighting: e.target.value })}
            >
              <option value="inverse_vol">역변동성</option>
              <option value="equal">동일가중</option>
            </select>
          </Field>
          <Field label="섹터 중립">
            <Toggle
              on={s.config.sector_neutral}
              onClick={() => setCfg({ sector_neutral: !s.config.sector_neutral })}
            />
          </Field>
          <Field label="추세 게이트 (200MA)">
            <Toggle
              on={s.config.trend_gate}
              onClick={() => setCfg({ trend_gate: !s.config.trend_gate })}
            />
          </Field>
          <Field label="슬리피지 (bp/편)">
            <input
              type="number"
              step="0.5"
              className="input"
              value={s.config.slippage_bps}
              onChange={(e) => setCfg({ slippage_bps: Number(e.target.value) })}
            />
          </Field>
          <Field label="OOS 분할일">
            <input
              type="date"
              className="input"
              value={s.config.oos_split_date}
              onChange={(e) => setCfg({ oos_split_date: e.target.value })}
            />
          </Field>
          <Field label="합격선: 초과CAGR">
            <input
              type="number"
              step="0.01"
              className="input"
              value={s.config.pass_excess_cagr}
              onChange={(e) =>
                setCfg({ pass_excess_cagr: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="합격선: 최대 MDD">
            <input
              type="number"
              step="0.05"
              className="input"
              value={s.config.pass_max_mdd}
              onChange={(e) => setCfg({ pass_max_mdd: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-7 w-12 rounded-full transition ${
        on ? "bg-accent" : "bg-ink-500"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}
