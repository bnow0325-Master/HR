import type { Metadata, Viewport } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "BNOW 인사관리",
  description: "BNOW 직원 인사관리 시스템 (출퇴근·휴가·출장)",
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
