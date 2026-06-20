"use client";

import { ApiError, DataMeta } from "@/lib/types";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-accent" />
      <span className="text-sm">{label ?? "실행 중…"}</span>
    </div>
  );
}

export function RunButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className="btn btn-primary" onClick={onClick} disabled={loading}>
      {loading ? "실행 중…" : children}
    </button>
  );
}

/** Loud error panel. Shows the real backend message + raw detail. */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  const detail =
    error instanceof ApiError && error.detail ? error.detail : null;
  return (
    <div className="rounded-xl border border-bad/60 bg-bad/10 p-4">
      <div className="flex items-center gap-2 font-semibold text-bad">
        <span>⛔ 실패</span>
      </div>
      <p className="mt-1 text-sm text-red-200">{msg}</p>
      {detail ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-ink-900 p-3 text-xs text-slate-400">
          {typeof detail === "string"
            ? detail
            : JSON.stringify(detail, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/** Persistent banner whenever results came from synthetic demo data. */
export function DemoBanner({ meta }: { meta?: DataMeta }) {
  if (!meta?.is_demo) return null;
  return (
    <div className="rounded-xl border border-warn/60 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn">
      ⚠️ 데모(합성) 데이터입니다 — 실제 시장이 아니며, 아래 숫자는 화면 확인용일 뿐
      아무 의미가 없습니다.
    </div>
  );
}

/** Data provenance + quality strip shown under every result. */
export function DataQuality({ meta }: { meta?: DataMeta }) {
  if (!meta) return null;
  const v = meta.validate ?? {};
  const coverage =
    v.coverage_ratio !== undefined ? `${Math.round(v.coverage_ratio * 100)}%` : "—";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
      <span>
        출처: <span className="text-slate-300">{meta.source}</span>
      </span>
      <span>
        받은 종목: <span className="text-slate-300">{v.n_received ?? "—"}</span>
      </span>
      <span>
        커버리지: <span className="text-slate-300">{coverage}</span>
      </span>
      {meta.warnings?.map((w, i) => (
        <span key={i} className="text-warn">
          {w}
        </span>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-slate-100";
  return (
    <div className="rounded-lg border border-ink-600/60 bg-ink-900/40 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`stat-value mt-1 ${color}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}
