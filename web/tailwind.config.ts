import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral surfaces (warm-black, distinct from the old navy "ink")
        bg: "#0a0c10",
        surface: "#12151b",
        surface2: "#1a1e26",
        line: "#232a35",
        // Brand: cyan/teal. Semantics keep green=up / red=down (never recolored).
        brand: { DEFAULT: "#22d3ee", deep: "#0891b2" },
        up: "#34d399",
        down: "#fb7185",
        warn: "#fbbf24",
        info: "#60a5fa",
        violet: "#a78bfa",
        // Text
        fg: "#e7ecf3",
        muted: "#94a0b0",
        faint: "#5c6675",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(34,211,238,0.25), 0 8px 30px -8px rgba(34,211,238,0.4)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.3s ease both",
        "sheet-up": "sheet-up 0.28s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
