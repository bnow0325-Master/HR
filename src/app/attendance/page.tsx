import Link from "next/link";

const attendanceMenus = [
  {
    href: "/check",
    eyebrow: "TODAY",
    title: "출퇴근",
    description: "오늘 출근과 퇴근을 등록하고 실시간 근무시간을 확인합니다.",
    accent: true,
  },
  {
    href: "/leave",
    eyebrow: "LEAVE",
    title: "휴가관리",
    description: "연차 현황을 확인하고 휴가를 신청하며 내 신청 내역을 봅니다.",
  },
  {
    href: "/business-trips",
    eyebrow: "BUSINESS TRIP",
    title: "출장관리",
    description: "달력으로 출장 기간을 선택하고 출장 사유와 일지를 관리합니다.",
  },
  {
    href: "/records",
    eyebrow: "HISTORY",
    title: "내 출퇴근 기록",
    description: "이번 달 출퇴근 기록과 근무시간을 한눈에 조회합니다.",
  },
  {
    href: "/admin/employees",
    eyebrow: "DIRECTORY",
    title: "직원명부 관리",
    description: "직원 정보, 재직 상태, 인사관리 및 WorkBoard 권한을 관리합니다.",
  },
];

export default function AttendancePage() {
  return (
    <main className="attendance-hub">
      <section className="attendance-hub-hero">
        <p className="attendance-hub-eyebrow">BNOW PEOPLE</p>
        <h1>인사관리</h1>
        <p className="attendance-hub-intro">
          출퇴근부터 휴가, 출장, 직원명부까지 BNOW의 인사 업무를 한곳에서
          관리합니다.
        </p>
      </section>

      <section className="attendance-hub-grid">
        {attendanceMenus.map((menu) => (
          <Link
            key={menu.href}
            href={menu.href}
            className={`attendance-hub-card ${menu.accent ? "is-primary" : ""}`}
          >
            <div className="attendance-hub-card-eyebrow">{menu.eyebrow}</div>
            <div className="attendance-hub-card-title">
              <h2>{menu.title}</h2>
              <span aria-hidden="true">→</span>
            </div>
            <p>{menu.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
