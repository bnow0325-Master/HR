import type { Metadata, Viewport } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "checkinout — 출퇴근 기록",
  description: "직원 출퇴근 기록 시스템 (워크보드 사용자 + 브라우저 위치 확인)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
        <TopNav />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
