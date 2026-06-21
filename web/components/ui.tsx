"use client";

import { useEffect, useState } from "react";
import { ApiError, DataMeta } from "@/lib/types";
import { IconAlert, IconBolt, IconClose } from "./icons";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`card card-pad ${className}`}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
      <span className="text-sm">{label ?? "실행 중…"}</span>
    </div>
  );
}

/** Big tappable run button — full-width on mobile, auto on desktop. */
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
    <button
      className="btn btn-primary w-full sm:w-auto"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#04222a]/40 border-t-[#04222a]" />
          실행 중…
        </>
      ) : (
        <>
          <IconBolt className="h-4 w-4" />
          {children}
        </>
      )}
    </button>
  );
}

/** View header: title + subtitle + run action, stacks on mobile. */
export function ViewHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  );
}

/** Loud error panel. Shows the real backend message + raw detail. */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  const detail =
    error instanceof ApiError && error.detail ? error.detail : null;
  const detailText = detail && detail !== "job not found"
    ? typeof detail === "string"
      ? detail
      : JSON.stringify(detail, null, 2)
    : null;
  const safeDetailText =
    detailText && detailText.length > 1000
      ? `${detailText.slice(0, 1000)}… [긴 에러 원문 생략]`
      : detailText;
  return (
    <div className="animate-fade-up rounded-2xl border border-down/40 bg-down/10 p-4">
      <div className="flex items-center gap-2 font-semibold text-down">
        <IconAlert className="h-5 w-5" />
        요청 실패
      </div>
      <p className="mt-1.5 text-sm text-rose-200">{msg}</p>
      {safeDetailText ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-bg/70 p-3 text-xs text-muted">
          {safeDetailText}
        </pre>
      ) : null}
    </div>
  );
}

/** Persistent banner whenever results came from synthetic demo data. */
export function DemoBanner({ meta }: { meta?: DataMeta }) {
  if (!meta?.is_demo) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm font-medium text-warn">
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        데모(합성) 데이터입니다 — 실제 시장이 아니며, 아래 숫자는 화면 확인용일
        뿐 아무 의미가 없습니다.
      </span>
    </div>
  );
}

/** Data provenance + quality strip shown under every result. */
export function DataQuality({ meta }: { meta?: DataMeta }) {
  if (!meta) return null;
  const v = meta.validate ?? {};
  const coverage =
    v.coverage_ratio !== undefined
      ? `${Math.round(v.coverage_ratio * 100)}%`
      : "—";
  const items: [string, string][] = [
    ["데이터 출처", meta.source],
    ["받은 종목", String(v.n_received ?? "—")],
    ["커버리지", coverage],
  ];
  return (
    <div className="rounded-2xl border border-line/70 bg-surface2/60 p-4">
      <div className="card-title mb-3">데이터 품질</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map(([k, val]) => (
          <div key={k} className="rounded-xl bg-bg/35 p-3">
            <div className="text-xs font-bold text-muted">{k}</div>
            <div className="mt-1 break-words text-sm font-semibold text-fg">{val}</div>
          </div>
        ))}
      </div>
      {meta.warnings?.length ? (
        <div className="mt-3 space-y-2">
          {meta.warnings.map((w, i) => (
            <div key={i} className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">
              {w}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HintText({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-baseline">
      <button
        type="button"
        className="hint-link"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-brand/40 bg-[#0d1218] p-3 text-left text-sm font-medium leading-relaxed text-fg shadow-card">
          {children}
        </span>
      ) : null}
    </span>
  );
}

export function SummaryCard({
  title,
  verdict,
  tone = "neutral",
  children,
}: {
  title: string;
  verdict: string;
  tone?: "good" | "bad" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "good"
      ? "border-up/40 bg-up/10 text-up"
      : tone === "bad"
        ? "border-down/40 bg-down/10 text-down"
        : tone === "warn"
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-brand/35 bg-brand/10 text-brand";
  return (
    <div className="rounded-2xl border border-line/70 bg-surface/85 p-4 shadow-card">
      <div className="card-kicker">먼저 볼 것</div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="card-title">{title}</div>
          <div className="mt-2 text-sm leading-relaxed text-fg">{children}</div>
        </div>
        <div className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-extrabold ${toneClass}`}>
          {verdict}
        </div>
      </div>
    </div>
  );
}

/** KPI stat tile. */
export function Stat({
  label,
  value,
  sub,
  tone,
  help,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
  help?: React.ReactNode;
}) {
  const color =
    tone === "good" ? "text-up" : tone === "bad" ? "text-down" : "text-fg";
  return (
    <div className="rounded-xl border border-line/60 bg-surface2/50 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-extrabold leading-tight text-fg">{label}</div>
        {help ? <HintText label="설명">{help}</HintText> : null}
      </div>
      <div className={`stat-value mt-2 ${color}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs font-semibold text-muted">{sub}</div> : null}
    </div>
  );
}

/** Empty-state placeholder shown before a view has data. */
export function EmptyState({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line/80 bg-surface/40 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface2 text-faint">
        {icon}
      </div>
      <p className="max-w-xs text-sm text-muted">{text}</p>
    </div>
  );
}

/** Bottom-sheet (mobile) / centered modal (desktop) container. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90dvh] w-full animate-sheet-up flex-col rounded-t-2xl border border-line bg-surface shadow-card sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <h3 className="font-semibold">{title}</h3>
          <button className="btn-icon h-9 w-9" onClick={onClose} aria-label="닫기">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/** Segmented pill control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.value
              ? "bg-brand text-[#04222a]"
              : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
