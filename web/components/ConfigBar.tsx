"use client";

import { DataMode } from "@/lib/types";
import { Sheet, Segmented } from "./ui";

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
  maxTickers: null, // 전체 S&P500 — 부분집합은 섹터 중립이 깨져 결과가 왜곡됨
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

export function SettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  showDates = true,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  showDates?: boolean;
}) {
  const s = settings;
  const setCfg = (patch: Partial<Settings["config"]>) =>
    onChange({ ...s, config: { ...s.config, ...patch } });

  return (
    <Sheet open={open} onClose={onClose} title="설정 · 전략 파라미터">
      <div className="space-y-6">
        {/* Data source */}
        <Section title="데이터">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="데이터 소스">
              <Segmented
                value={s.mode}
                onChange={(m) => onChange({ ...s, mode: m })}
                options={[
                  { value: "live", label: "실데이터" },
                  { value: "demo", label: "데모" },
                ]}
              />
            </Field>
            <Field label="유니버스 크기 (비우면 전체)">
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
            </Field>
          </div>
          {s.maxTickers !== null && s.mode === "live" && (
            <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
              ※ 유니버스를 {s.maxTickers}개로 줄이면 빠르지만{" "}
              <b>실제 S&P500이 아닙니다</b> (위키 목록 앞에서부터 {s.maxTickers}개).
              진짜 결과는 “전체”로 두고 돌리세요 — 대신 다운로드가 느립니다.
            </p>
          )}
        </Section>

        {showDates && (
          <Section title="기간">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="시작일">
                <input
                  type="date"
                  className="input"
                  value={s.start}
                  onChange={(e) => onChange({ ...s, start: e.target.value })}
                />
              </Field>
              <Field label="종료일 (비우면 오늘)">
                <input
                  type="date"
                  className="input"
                  value={s.end ?? ""}
                  onChange={(e) =>
                    onChange({ ...s, end: e.target.value || null })
                  }
                />
              </Field>
            </div>
          </Section>
        )}

        <Section title="전략">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Field label="보유 종목 수">
              <input
                type="number"
                className="input"
                value={s.config.top_n}
                onChange={(e) => setCfg({ top_n: Number(e.target.value) })}
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
            <Field label="섹터 중립">
              <Toggle
                on={s.config.sector_neutral}
                onClick={() =>
                  setCfg({ sector_neutral: !s.config.sector_neutral })
                }
              />
            </Field>
            <Field label="추세 게이트 (200MA)">
              <Toggle
                on={s.config.trend_gate}
                onClick={() => setCfg({ trend_gate: !s.config.trend_gate })}
              />
            </Field>
          </div>
        </Section>

        <Section title="검증 / 합격 기준">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        </Section>

        <button className="btn btn-primary w-full" onClick={onClose}>
          적용하고 닫기
        </button>
      </div>
    </Sheet>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="card-title mb-3">{title}</div>
      {children}
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
      className={`relative h-8 w-14 rounded-full border transition ${
        on ? "border-brand/50 bg-brand/80" : "border-line bg-surface2"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-8" : "left-1"
        }`}
      />
    </button>
  );
}
