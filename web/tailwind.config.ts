import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0b0e14",
          800: "#11151f",
          700: "#1a2030",
          600: "#252d42",
          500: "#3a4259",
        },
        accent: "#5b8cff",
        good: "#1faa6b",
        bad: "#e5484d",
        warn: "#f5a524",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
