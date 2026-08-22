import { redirect } from "next/navigation";
import PrintActions from "./PrintActions";
import { isAdmin } from "@/lib/adminAuth";
import {
  authorizationEventDate,
  authorizationIssueDate,
  authorizationLetterNumber,
  authorizationOrganization,
  authorizationScope,
  authorizationTitle,
} from "@/lib/authorizationLetter";
import {
  employmentCertificateCompany,
  formatCertificateDate,
} from "@/lib/employmentCertificate";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuthorizationLetterPrintPage({
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
        },
      })
    : null;

  if (!employee) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">수임 직원을 찾을 수 없습니다.</h1>
        <p className="mt-3 text-sm text-slate-500">
          직원명부의 재직 상태를 확인한 후 다시 발급해 주세요.
        </p>
      </main>
    );
  }

  const issueDate = authorizationIssueDate(firstValue(params.issuedOn));
  const eventDate = authorizationEventDate(firstValue(params.eventDate));
  const organization = authorizationOrganization(firstValue(params.organization));
  const title = authorizationTitle(firstValue(params.title));
  const scope = authorizationScope(firstValue(params.scope));
  const company = employmentCertificateCompany();
  const documentNumber = authorizationLetterNumber(issueDate, employee.code);

  return (
    <main className="certificate-shell">
      <PrintActions />
      <article className="authorization-letter">
        <div className="authorization-accent" />
        <header className="authorization-header">
          <div>
            <div className="authorization-brand">BNOW COMPANY</div>
            <div className="authorization-document-number">
              문서번호 {documentNumber}
            </div>
          </div>
          <div className="authorization-mark">POA</div>
        </header>

        <h1>위 임 장</h1>
        <p className="authorization-subtitle">LETTER OF AUTHORIZATION</p>

        <section className="authorization-parties">
          <div>
            <h2>위임인</h2>
            <dl>
              <div><dt>회사명</dt><dd>{company.legalName}</dd></div>
              <div><dt>대표자</dt><dd>{company.representativeTitle} {company.representativeName}</dd></div>
              <div><dt>사업자번호</dt><dd>{company.businessNumber}</dd></div>
              <div><dt>소재지</dt><dd>{company.address}</dd></div>
            </dl>
          </div>
          <div>
            <h2>수임인</h2>
            <dl>
              <div><dt>성명</dt><dd>{employee.name}</dd></div>
              <div><dt>사번</dt><dd>{employee.code}</dd></div>
              <div><dt>소속</dt><dd>{employee.department || "미지정"}</dd></div>
              <div><dt>직위</dt><dd>{employee.position || "미지정"}</dd></div>
            </dl>
          </div>
        </section>

        <section className="authorization-mandate">
          <div className="authorization-mandate-heading">
            <span>위임 대상 기관</span>
            <strong>{organization}</strong>
          </div>
          <dl>
            <div><dt>업무 일자</dt><dd>{formatCertificateDate(eventDate)}</dd></div>
            <div><dt>위임 업무</dt><dd>{title}</dd></div>
            <div className="authorization-scope"><dt>세부 범위</dt><dd>{scope}</dd></div>
          </dl>
        </section>

        <section className="authorization-statement">
          <p>
            위임인은 수임인에게 위 사항을 대리 수행할 권한을 위임합니다.
            본 위임은 기재된 업무에 한하며 계약 체결, 금전 수령 및 별도의
            법률행위 권한은 포함하지 않습니다.
          </p>
          <time>{formatCertificateDate(issueDate)}</time>
        </section>

        <footer className="authorization-signature">
          <div>
            <span>위임인</span>
            <strong>{company.legalName}</strong>
            <b>{company.representativeTitle} {company.representativeName}</b>
          </div>
          <div className="authorization-electronic-seal" aria-label="전자문서용 회사 직인">
            <span>주식회사</span>
            <strong>비노우</strong>
            <small>전자문서용</small>
          </div>
        </footer>

        <p className="authorization-validity-note">
          전자문서용 직인이 표시된 발급본입니다. 제출처의 인정 여부를 확인해 주세요.
        </p>
      </article>
    </main>
  );
}
