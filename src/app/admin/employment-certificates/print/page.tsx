import { redirect } from "next/navigation";
import PrintActions from "./PrintActions";
import { isAdmin } from "@/lib/adminAuth";
import {
  certificateIssueDate,
  certificatePurpose,
  employmentCertificateCompany,
  employmentCertificateNumber,
  formatCertificateDate,
} from "@/lib/employmentCertificate";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EmploymentCertificatePrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const params = await searchParams;
  const employeeId = firstValue(params.employeeId)?.trim() || "";
  const employee = employeeId
    ? await prisma.employee.findFirst({
        where: { id: employeeId, active: true, terminationDate: null },
        select: {
          code: true,
          name: true,
          department: true,
          position: true,
          hireDate: true,
        },
      })
    : null;

  if (!employee) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">재직 직원을 찾을 수 없습니다.</h1>
        <p className="mt-3 text-sm text-slate-500">
          직원명부의 재직 상태를 확인한 후 다시 발급해 주세요.
        </p>
      </main>
    );
  }

  const issueDate = certificateIssueDate(firstValue(params.issuedOn));
  const purpose = certificatePurpose(firstValue(params.purpose));
  const company = employmentCertificateCompany();
  const certificateNumber = employmentCertificateNumber(issueDate, employee.code);

  return (
    <main className="certificate-shell">
      <PrintActions />
      <article className="employment-certificate">
        <div className="certificate-accent" />
        <header className="certificate-header">
          <div>
            <div className="certificate-brand">BNOW COMPANY</div>
            <div className="certificate-document-number">
              증명번호 {certificateNumber}
            </div>
          </div>
          <div className="certificate-mark">HR</div>
        </header>

        <h1>재 직 증 명 서</h1>
        <p className="certificate-subtitle">CERTIFICATE OF EMPLOYMENT</p>

        <dl className="certificate-details">
          <div><dt>성명</dt><dd>{employee.name}</dd></div>
          <div><dt>사번</dt><dd>{employee.code}</dd></div>
          <div><dt>소속</dt><dd>{employee.department || "미지정"}</dd></div>
          <div><dt>직위</dt><dd>{employee.position || "미지정"}</dd></div>
          <div><dt>입사일</dt><dd>{formatCertificateDate(employee.hireDate)}</dd></div>
          <div><dt>재직 상태</dt><dd>재직 중</dd></div>
          <div className="certificate-detail-wide"><dt>용도</dt><dd>{purpose}</dd></div>
        </dl>

        <section className="certificate-statement">
          <p>
            위 사람은 상기 소속 및 직위로 현재 당사에 재직 중임을
            증명합니다.
          </p>
          <time>{formatCertificateDate(issueDate)}</time>
        </section>

        <footer className="certificate-company">
          <div className="certificate-company-data">
            <div><span>회사명</span><strong>{company.legalName}</strong></div>
            <div><span>사업자등록번호</span><strong>{company.businessNumber}</strong></div>
            <div><span>법인등록번호</span><strong>{company.corporateNumber}</strong></div>
            <div><span>소재지</span><strong>{company.address}</strong></div>
          </div>
          <div className="certificate-signature">
            <span>{company.legalName}</span>
            <strong>{company.representativeTitle} {company.representativeName}</strong>
            <div className="certificate-seal-placeholder">직인</div>
          </div>
        </footer>

        <p className="certificate-validity-note">
          본 증명서는 회사 직인 날인 후 유효합니다.
        </p>
      </article>
    </main>
  );
}
