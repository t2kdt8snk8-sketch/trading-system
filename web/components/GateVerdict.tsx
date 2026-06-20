"use client";

import { GateCheck } from "@/lib/types";
import { fmtGate, signedPct, num } from "@/lib/format";
import { IconCheck, IconClose } from "./icons";

export function GateVerdict({
  checks,
  passed,
  title = "백테스트 게이트",
}: {
  checks: GateCheck[];
  passed: boolean;
  title?: string;
}) {
  return (
    <div
      className={`animate-fade-up overflow-hidden rounded-2xl border ${
        passed ? "border-up/40 bg-up/[0.07]" : "border-down/40 bg-down/[0.07]"
      }`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              passed ? "bg-up/15 text-up" : "bg-down/15 text-down"
            }`}
          >
            {passed ? (
              <IconCheck className="h-6 w-6" />
            ) : (
              <IconClose className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="card-title">{title}</div>
            <div
              className={`text-2xl font-extrabold ${
                passed ? "text-up" : "text-down"
              }`}
            >
              {passed ? "통과" : "불통과"}
            </div>
          </div>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-muted sm:text-right">
          통과해도 <b className="text-fg">실거래 자격이 아니라</b> 페이퍼
          테스트로 넘어갈 최소 허들일 뿐입니다.
        </p>
      </div>

      <div className="space-y-1.5 px-4 pb-4 sm:px-5 sm:pb-5">
        {checks.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-3 rounded-xl bg-bg/40 px-3 py-2.5"
          >
            <span className="flex items-center gap-2 text-sm text-fg">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  c.pass ? "bg-up/15 text-up" : "bg-down/15 text-down"
                }`}
              >
                {c.pass ? "✓" : "✗"}
              </span>
              {c.label}
            </span>
            <div className="nums flex items-center gap-2 font-mono text-sm">
              <span className={c.pass ? "text-up" : "text-down"}>
                {fmtGate(c.value, c.format)}
              </span>
              <span className="text-faint">
                {c.op}{" "}
                {c.format === "pct" ? signedPct(c.threshold) : num(c.threshold)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
