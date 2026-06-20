"use client";

import { GateCheck } from "@/lib/types";
import { fmtGate, signedPct, num } from "@/lib/format";

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
      className={`rounded-xl border p-5 ${
        passed ? "border-good/50 bg-good/10" : "border-bad/50 bg-bad/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="card-title">{title}</div>
          <div
            className={`mt-1 text-3xl font-bold ${
              passed ? "text-good" : "text-bad"
            }`}
          >
            {passed ? "통과" : "불통과"}
          </div>
        </div>
        <div className="max-w-[55%] text-right text-xs text-slate-400">
          통과해도 <b className="text-slate-200">실거래 자격이 아니라</b> 페이퍼
          테스트로 넘어갈 최소 허들일 뿐입니다.
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {checks.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between rounded-lg bg-ink-900/50 px-3 py-2"
          >
            <span className="text-sm text-slate-300">{c.label}</span>
            <div className="flex items-center gap-3 font-mono text-sm">
              <span className={c.pass ? "text-good" : "text-bad"}>
                {fmtGate(c.value, c.format)}
              </span>
              <span className="text-slate-500">
                {c.op} {c.format === "pct" ? signedPct(c.threshold) : num(c.threshold)}
              </span>
              <span className={c.pass ? "text-good" : "text-bad"}>
                {c.pass ? "✓" : "✗"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
