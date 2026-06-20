import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconWallet(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v0H5.5A2.5 2.5 0 0 1 3 4.5" />
      <path d="M3 7v9.5A2.5 2.5 0 0 0 5.5 19H19a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5.5" />
      <circle cx="16.5" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChart(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 4v15a1 1 0 0 0 1 1h15" />
      <path d="M7 14l3.5-4 3 2.5L20 6" />
    </svg>
  );
}

export function IconScale(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3v18" />
      <path d="M7 21h10" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z" />
    </svg>
  );
}

export function IconSliders(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

export function IconBolt(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 12.5l5 5 11-12" />
    </svg>
  );
}

export function IconAlert(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3 2.5 20h19L12 3z" />
      <path d="M12 10v4M12 17.5v.5" />
    </svg>
  );
}
