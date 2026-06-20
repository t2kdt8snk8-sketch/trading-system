import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading System — 스코어링 / 백테스트",
  description: "AI 보조 주식 스코어링·백테스트 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
