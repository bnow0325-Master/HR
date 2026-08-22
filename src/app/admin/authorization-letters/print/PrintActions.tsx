"use client";

import Link from "next/link";

export default function PrintActions() {
  return (
    <div className="certificate-print-toolbar">
      <Link href="/admin/authorization-letters">발급 메뉴로</Link>
      <button type="button" onClick={() => window.print()}>
        인쇄 · PDF 저장
      </button>
    </div>
  );
}
