import { CurvePoint } from "./types";

/** Underwater drawdown series: % below the running peak (≤ 0). */
export function drawdownSeries(curve: CurvePoint[]): {
  date: string;
  dd: number;
}[] {
  let peak = -Infinity;
  return curve
    .filter((p) => p.value != null)
    .map((p) => {
      const v = p.value as number;
      peak = Math.max(peak, v);
      return { date: p.date, dd: peak > 0 ? v / peak - 1 : 0 };
    });
}

/** Calendar-month returns derived from an equity curve (last value per month). */
export function monthlyReturns(curve: CurvePoint[]): {
  month: string;
  ret: number;
}[] {
  const lastByMonth = new Map<string, number>();
  for (const p of curve) {
    if (p.value == null) continue;
    lastByMonth.set(p.date.slice(0, 7), p.value);
  }
  const months = [...lastByMonth.keys()].sort();
  const out: { month: string; ret: number }[] = [];
  let prev: number | null = null;
  for (const m of months) {
    const v = lastByMonth.get(m)!;
    if (prev != null && prev > 0) out.push({ month: m, ret: v / prev - 1 });
    prev = v;
  }
  return out;
}

/** Recovery factor = total return / |max drawdown|. */
export function recoveryFactor(
  curve: CurvePoint[],
  mdd: number | null | undefined,
): number | null {
  const vals = curve.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2 || !mdd) return null;
  const totalReturn = vals[vals.length - 1] / vals[0] - 1;
  return totalReturn / Math.abs(mdd);
}

/** Longest peak-to-recovery span (in calendar days) from an equity curve. */
export function longestDrawdownDays(curve: CurvePoint[]): number | null {
  const pts = curve.filter((p) => p.value != null) as {
    date: string;
    value: number;
  }[];
  if (pts.length < 2) return null;
  let peak = -Infinity;
  let peakDate = pts[0].date;
  let longest = 0;
  for (const p of pts) {
    if (p.value >= peak) {
      peak = p.value;
      peakDate = p.date;
    } else {
      const days =
        (new Date(p.date).getTime() - new Date(peakDate).getTime()) / 86_400_000;
      longest = Math.max(longest, days);
    }
  }
  return Math.round(longest);
}
