"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  personalEmail: string | null;
  homeAddress: string | null;
  emergencyContactPhone: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  workMinutesPerDay: number;
  systemRole: "ADMIN" | "MEMBER";
  attendanceEnabled: boolean;
  leaveEnabled: boolean;
  workboardEnabled: boolean;
  active: boolean;
};

type EmployeeDraft = {
  code: string;
  name: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  personalEmail: string;
  homeAddress: string;
  emergencyContactPhone: string;
  hireDate: string;
  terminationDate: string;
  workHoursPerDay: string;
  systemRole: "ADMIN" | "MEMBER";
  attendanceEnabled: boolean;
  leaveEnabled: boolean;
  workboardEnabled: boolean;
};

type WorkboardAccountDraft = {
  email: string;
  password: string;
};

const DEVELOPMENT_EMPLOYEES_KEY = "checkinoutDevelopmentEmployees";
const DEVELOPMENT_EMPLOYEE: Employee = {
  id: "development-chu-dong-hyeon",
  code: "DEV",
  name: "추동현",
  department: "개발 사용자",
  position: "개발",
  email: null,
  phone: null,
  personalEmail: null,
  homeAddress: null,
  emergencyContactPhone: null,
  hireDate: "2024-01-01",
  terminationDate: null,
  workMinutesPerDay: 480,
  systemRole: "ADMIN",
  attendanceEnabled: true,
  leaveEnabled: true,
  workboardEnabled: false,
  active: true,
};

const EMPTY_DRAFT: EmployeeDraft = {
  code: "",
  name: "",
  department: "",
  position: "",
  email: "",
  phone: "",
  personalEmail: "",
  homeAddress: "",
  emergencyContactPhone: "",
  hireDate: "",
  terminationDate: "",
  workHoursPerDay: "8",
  systemRole: "MEMBER",
  attendanceEnabled: true,
  leaveEnabled: true,
  workboardEnabled: true,
};

const EMPTY_WORKBOARD_ACCOUNT: WorkboardAccountDraft = {
  email: "",
  password: "",
};

function normalizeEmployee(employee: Partial<Employee>): Employee {
  const active = employee.active !== false && !employee.terminationDate;

  return {
    id: employee.id ?? `development-${Date.now()}`,
    code: employee.code ?? "",
    name: employee.name ?? "",
    department: employee.department ?? null,
    position: employee.position ?? null,
    email: employee.email ?? null,
    phone: employee.phone ?? null,
    personalEmail: employee.personalEmail ?? null,
    homeAddress: employee.homeAddress ?? null,
    emergencyContactPhone: employee.emergencyContactPhone ?? null,
    hireDate: employee.hireDate ?? null,
    terminationDate: employee.terminationDate ?? null,
    workMinutesPerDay: employee.workMinutesPerDay ?? 480,
    systemRole: employee.systemRole === "ADMIN" ? "ADMIN" : "MEMBER",
    attendanceEnabled: active && employee.attendanceEnabled !== false,
    leaveEnabled: active && employee.leaveEnabled !== false,
    workboardEnabled:
      active &&
      Boolean(employee.email) &&
      employee.workboardEnabled !== false,
    active,
  };
}

function readDevelopmentEmployees() {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(DEVELOPMENT_EMPLOYEES_KEY) ?? "[]",
    ) as Partial<Employee>[];
    return stored.length > 0
      ? stored.map(normalizeEmployee)
      : [DEVELOPMENT_EMPLOYEE];
  } catch {
    return [DEVELOPMENT_EMPLOYEE];
  }
}

function saveDevelopmentEmployees(employees: Employee[]) {
  window.localStorage.setItem(
    DEVELOPMENT_EMPLOYEES_KEY,
    JSON.stringify(employees),
  );
}

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function displayDate(value: string | null) {
  return value ? value.slice(0, 10).replaceAll("-", ".") : "-";
}

function draftFromEmployee(employee: Employee): EmployeeDraft {
  return {
    code: employee.code,
    name: employee.name,
    department: employee.department ?? "",
    position: employee.position ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    personalEmail: employee.personalEmail ?? "",
    homeAddress: employee.homeAddress ?? "",
    emergencyContactPhone: employee.emergencyContactPhone ?? "",
    hireDate: dateValue(employee.hireDate),
    terminationDate: dateValue(employee.terminationDate),
    workHoursPerDay: String(employee.workMinutesPerDay / 60),
    systemRole: employee.systemRole,
    attendanceEnabled: employee.attendanceEnabled,
    leaveEnabled: employee.leaveEnabled,
    workboardEnabled: employee.workboardEnabled,
  };
}

function normalizedDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "재직중") return "";
  return trimmed.replaceAll(".", "-").replaceAll("/", "-");
}

function parseRoster(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.flatMap((line) => {
    const columns = line.includes("\t")
      ? line.split("\t")
      : line.includes("|")
        ? line.split("|")
        : line.split(",");
    const [
      code,
      name,
      hireDate,
      terminationDate,
      phone,
      email,
      role,
      personalEmail,
      emergencyContactPhone,
      homeAddress,
    ] =
      columns.map((value) => value.trim());

    if (!code || !name || code === "사번") return [];
    return [
      {
        ...EMPTY_DRAFT,
        code,
        name,
        hireDate: normalizedDate(hireDate ?? ""),
        terminationDate: normalizedDate(terminationDate ?? ""),
        phone: phone === "-" ? "" : phone ?? "",
        email: email === "-" ? "" : (email ?? "").toLowerCase(),
        personalEmail:
          personalEmail === "-" ? "" : (personalEmail ?? "").toLowerCase(),
        emergencyContactPhone:
          emergencyContactPhone === "-" ? "" : emergencyContactPhone ?? "",
        homeAddress: homeAddress === "-" ? "" : homeAddress ?? "",
        systemRole: role?.toUpperCase() === "ADMIN" ? "ADMIN" : "MEMBER",
        workboardEnabled: Boolean(email && email !== "-"),
      } satisfies EmployeeDraft,
    ];
  });
}

function employeePayload(draft: EmployeeDraft) {
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    department: draft.department.trim(),
    position: draft.position.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.trim(),
    personalEmail: draft.personalEmail.trim().toLowerCase(),
    homeAddress: draft.homeAddress.trim(),
    emergencyContactPhone: draft.emergencyContactPhone.trim(),
    hireDate: draft.hireDate,
    terminationDate: draft.terminationDate,
    workMinutesPerDay: Math.round(Number(draft.workHoursPerDay) * 60),
    systemRole: draft.systemRole,
    attendanceEnabled: draft.attendanceEnabled,
    leaveEnabled: draft.leaveEnabled,
    workboardEnabled: Boolean(draft.email.trim()) && draft.workboardEnabled,
  };
}

export default function EmployeesAdminPage() {
  const router = useRouter();
  const isDevelopment = process.env.NODE_ENV === "development";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmployeeDraft>(EMPTY_DRAFT);
  const [rosterText, setRosterText] = useState("");
  const [accountDraft, setAccountDraft] = useState<WorkboardAccountDraft>(
    EMPTY_WORKBOARD_ACCOUNT,
  );
  const [accountSaving, setAccountSaving] = useState(false);
  const [identitySyncing, setIdentitySyncing] = useState(false);
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  async function loadEmployees() {
    setLoading(true);

    if (isDevelopment) {
      const localEmployees = readDevelopmentEmployees().sort((a, b) =>
        a.code.localeCompare(b.code),
      );
      saveDevelopmentEmployees(localEmployees);
      setEmployees(localEmployees);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/employees", {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = await response.json();
      setEmployees(data.employees ?? []);
    } catch {
      setMessage({ ok: false, text: "직원 목록을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
  }, []);

  function flash(ok: boolean, text: string) {
    setMessage({ ok, text });
    window.setTimeout(() => setMessage(null), 5000);
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function persistDraft(
    nextDraft: EmployeeDraft,
    employeeId?: string,
  ) {
    const payload = employeePayload(nextDraft);
    if (!payload.code || !payload.name || !payload.hireDate) {
      throw new Error("사번, 이름, 입사일을 입력해 주세요.");
    }
    if (
      !Number.isFinite(payload.workMinutesPerDay) ||
      payload.workMinutesPerDay < 60 ||
      payload.workMinutesPerDay > 1440
    ) {
      throw new Error("1일 근무시간을 올바르게 입력해 주세요.");
    }

    if (isDevelopment) {
      const duplicate = employees.find(
        (employee) =>
          employee.id !== employeeId &&
          (employee.code === payload.code ||
            (payload.email &&
              employee.email?.toLowerCase() === payload.email) ||
            (payload.personalEmail &&
              employee.personalEmail?.toLowerCase() ===
                payload.personalEmail)),
      );
      if (duplicate) {
        throw new Error(
          "동일한 사번, 회사 이메일 또는 개인 이메일이 이미 등록되어 있습니다.",
        );
      }

      const employee = normalizeEmployee({
        id: employeeId ?? `development-${Date.now()}-${payload.code}`,
        ...payload,
        department: payload.department || null,
        position: payload.position || null,
        email: payload.email || null,
        phone: payload.phone || null,
        personalEmail: payload.personalEmail || null,
        homeAddress: payload.homeAddress || null,
        emergencyContactPhone: payload.emergencyContactPhone || null,
        hireDate: payload.hireDate,
        terminationDate: payload.terminationDate || null,
        active: !payload.terminationDate,
      });
      const nextEmployees = employeeId
        ? employees.map((item) => (item.id === employeeId ? employee : item))
        : [...employees, employee];
      nextEmployees.sort((a, b) => a.code.localeCompare(b.code));
      saveDevelopmentEmployees(nextEmployees);
      setEmployees(nextEmployees);
      return { identitySync: null };
    }

    const response = await fetch(
      employeeId
        ? `/api/admin/employees/${employeeId}`
        : "/api/admin/employees",
      {
        method: employeeId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "직원정보 저장에 실패했습니다.");
    }
    return data;
  }

  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await persistDraft(draft, editingId ?? undefined);
      const action = editingId ? "변경" : "등록";
      const syncMessage = data.identitySync?.message
        ? ` ${data.identitySync.message}`
        : "";
      flash(true, `${draft.name} 직원정보를 ${action}했습니다.${syncMessage}`);
      resetForm();
      if (!isDevelopment) await loadEmployees();
    } catch (error) {
      flash(
        false,
        error instanceof Error ? error.message : "직원정보 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveCompanyAccountPassword(event: React.FormEvent) {
    event.preventDefault();
    setAccountSaving(true);
    try {
      const response = await fetch("/api/admin/identity/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: accountDraft.email.trim().toLowerCase(),
          password: accountDraft.password,
        }),
      });
      const data = await response.json();
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "사내 통합 계정 처리에 실패했습니다.");
      }

      flash(true, data.message);
      setAccountDraft(EMPTY_WORKBOARD_ACCOUNT);
    } catch (error) {
      flash(
        false,
        error instanceof Error
          ? error.message
          : "사내 통합 계정 처리에 실패했습니다.",
      );
    } finally {
      setAccountSaving(false);
    }
  }

  async function reconcileCompanyIdentity() {
    if (isDevelopment) {
      flash(
        false,
        "전체 사내 인증 동기화는 운영 DB와 Keycloak이 연결된 환경에서 실행합니다.",
      );
      return;
    }

    setIdentitySyncing(true);
    try {
      const response = await fetch("/api/admin/identity/reconcile", {
        method: "POST",
      });
      const data = await response.json();
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "사내 인증 동기화에 실패했습니다.");
      }

      const summary = data.summary as {
        total: number;
        synced: number;
        disabled: number;
        skipped: number;
        failed: number;
      };
      flash(
        summary.failed === 0,
        `사내 인증 ${summary.total}명 확인: 활성 ${summary.synced}명, 비활성 ${summary.disabled}명, 건너뜀 ${summary.skipped}명, 실패 ${summary.failed}명`,
      );
    } catch (error) {
      flash(
        false,
        error instanceof Error
          ? error.message
          : "사내 인증 동기화에 실패했습니다.",
      );
    } finally {
      setIdentitySyncing(false);
    }
  }

  function editEmployee(employee: Employee) {
    setEditingId(employee.id);
    setDraft(draftFromEmployee(employee));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function importRoster() {
    const rows = parseRoster(rosterText);
    if (rows.length === 0) {
      flash(false, "가져올 직원 명부를 입력해 주세요.");
      return;
    }

    setSaving(true);
    let saved = 0;
    let failed = 0;
    const errors: string[] = [];

    if (isDevelopment) {
      const nextEmployees = employees.filter(
        (employee) =>
          employee.id !== DEVELOPMENT_EMPLOYEE.id ||
          rows.some((row) => row.code === employee.code),
      );

      for (const row of rows) {
        try {
          const payload = employeePayload(row);
          if (!payload.code || !payload.name || !payload.hireDate) {
            throw new Error("사번, 이름, 입사일이 필요합니다.");
          }

          const existingIndex = nextEmployees.findIndex(
            (item) => item.code === payload.code,
          );
          const existing =
            existingIndex >= 0 ? nextEmployees[existingIndex] : null;
          const duplicateEmail = payload.email
            ? nextEmployees.find(
                (item) =>
                  item.id !== existing?.id &&
                  item.email?.toLowerCase() === payload.email,
              )
            : null;
          const duplicatePersonalEmail = payload.personalEmail
            ? nextEmployees.find(
                (item) =>
                  item.id !== existing?.id &&
                  item.personalEmail?.toLowerCase() ===
                    payload.personalEmail,
              )
            : null;
          if (duplicateEmail || duplicatePersonalEmail) {
            throw new Error("동일한 이메일이 이미 등록되어 있습니다.");
          }

          const employee = normalizeEmployee({
            id:
              existing?.id ??
              `development-${Date.now()}-${payload.code}`,
            ...payload,
            department: payload.department || null,
            position: payload.position || null,
            email: payload.email || null,
            phone: payload.phone || null,
            personalEmail: payload.personalEmail || null,
            homeAddress: payload.homeAddress || null,
            emergencyContactPhone: payload.emergencyContactPhone || null,
            hireDate: payload.hireDate,
            terminationDate: payload.terminationDate || null,
            active: !payload.terminationDate,
          });

          if (existingIndex >= 0) nextEmployees[existingIndex] = employee;
          else nextEmployees.push(employee);
          saved += 1;
        } catch (error) {
          failed += 1;
          errors.push(
            `${row.code} ${row.name}: ${
              error instanceof Error ? error.message : "저장 실패"
            }`,
          );
        }
      }

      nextEmployees.sort((a, b) => a.code.localeCompare(b.code));
      saveDevelopmentEmployees(nextEmployees);
      setEmployees(nextEmployees);
      setSaving(false);
      if (failed === 0) setRosterText("");
      flash(
        failed === 0,
        `${saved}명 저장 완료${
          failed ? `, ${failed}명 실패: ${errors.join(" / ")}` : ""
        }`,
      );
      return;
    }

    for (const row of rows) {
      try {
        const existing = employees.find((item) => item.code === row.code);
        await persistDraft(row, existing?.id);
        saved += 1;
      } catch (error) {
        failed += 1;
        errors.push(
          `${row.code} ${row.name}: ${
            error instanceof Error ? error.message : "저장 실패"
          }`,
        );
      }
    }

    await loadEmployees();
    setSaving(false);
    if (failed === 0) setRosterText("");
    flash(
      failed === 0,
      `${saved}명 저장 완료${failed ? `, ${failed}명 실패: ${errors.join(" / ")}` : ""}`,
    );
  }

  const activeCount = employees.filter((employee) => employee.active).length;
  const adminCount = employees.filter(
    (employee) => employee.active && employee.systemRole === "ADMIN",
  ).length;
  const workboardCount = employees.filter(
    (employee) =>
      employee.active && employee.workboardEnabled && employee.email,
  ).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">직원정보 · 권한 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            직원 원장을 기준으로 인사관리와 WorkBoard 권한을 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/admin/authorization-letters"
            className="font-medium text-slate-600 hover:underline"
          >
            위임장 발급
          </Link>
          <Link
            href="/admin/employment-certificates"
            className="font-medium text-slate-600 hover:underline"
          >
            재직증명서 발급
          </Link>
          <Link href="/leave" className="font-medium text-brand hover:underline">
            인사관리
          </Link>
          <Link href="/admin" className="text-slate-400 hover:text-slate-600">
            관리자 대시보드
          </Link>
        </div>
      </div>

      <section className="mb-6 grid grid-cols-3 gap-3">
        <SummaryCard label="재직 직원" value={`${activeCount}명`} />
        <SummaryCard label="관리자" value={`${adminCount}명`} />
        <SummaryCard label="WorkBoard 사용" value={`${workboardCount}명`} />
      </section>

      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
        <div>
          <h2 className="font-semibold text-emerald-950">사내 통합 로그인</h2>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            직원정보 저장 시 자동 반영됩니다. 이 버튼은 전체 계정과 권한을 다시
            맞출 때 사용합니다.
          </p>
        </div>
        <button
          type="button"
          disabled={identitySyncing}
          onClick={() => void reconcileCompanyIdentity()}
          className="rounded-lg border border-slate-400 bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-300 disabled:cursor-wait disabled:bg-slate-200 disabled:text-slate-950 disabled:opacity-100"
        >
          {identitySyncing ? "동기화 중..." : "전체 직원 인증 동기화"}
        </button>
      </section>

      <form
        onSubmit={saveCompanyAccountPassword}
        className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="font-semibold text-slate-800">
            사내 통합 로그인 계정
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            직원명부에 등록된 재직자의 임시 비밀번호를 설정합니다. 비밀번호 원문은
            HR 데이터베이스에 저장하지 않으며, 직원은 다음 로그인에서 변경해야 합니다.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="회사 이메일 *">
            <input
              type="email"
              required
              value={accountDraft.email}
              placeholder="name@bnow.co.kr"
              onChange={(event) =>
                setAccountDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="초기·재설정 비밀번호 *">
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={accountDraft.password}
              placeholder="영문+숫자 8자 이상"
              onChange={(event) =>
                setAccountDraft((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={accountSaving}
          className="mt-4 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {accountSaving ? "설정 중..." : "임시 비밀번호 설정"}
        </button>
      </form>

      <form
        onSubmit={saveEmployee}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">
              {editingId ? "직원정보 수정" : "새 직원 등록"}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              퇴사일을 입력하면 모든 서비스 접근이 비활성화됩니다.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-slate-500 hover:underline"
            >
              수정 취소
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="사번 *">
            <input
              value={draft.code}
              onChange={(event) =>
                setDraft((current) => ({ ...current, code: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="이름 *">
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="입사일 *">
            <input
              type="date"
              value={draft.hireDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  hireDate: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="퇴사일">
            <input
              type="date"
              value={draft.terminationDate}
              min={draft.hireDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  terminationDate: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="휴대폰번호">
            <input
              value={draft.phone}
              placeholder="010-0000-0000"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="회사 이메일">
            <input
              type="email"
              value={draft.email}
              onChange={(event) => {
                const email = event.target.value;
                setDraft((current) => ({
                  ...current,
                  email,
                  workboardEnabled: email
                    ? current.workboardEnabled
                    : false,
                }));
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="개인 이메일">
            <input
              type="email"
              value={draft.personalEmail}
              placeholder="name@example.com"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  personalEmail: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="비상연락망 연락처">
            <input
              value={draft.emergencyContactPhone}
              placeholder="010-0000-0000"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  emergencyContactPhone: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="부서">
            <input
              value={draft.department}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  department: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="직급">
            <input
              value={draft.position}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  position: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="1일 근무시간">
            <input
              type="number"
              min="1"
              max="24"
              step="0.5"
              value={draft.workHoursPerDay}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  workHoursPerDay: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="시스템 권한">
            <select
              value={draft.systemRole}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  systemRole:
                    event.target.value === "ADMIN" ? "ADMIN" : "MEMBER",
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="MEMBER">일반 직원</option>
              <option value="ADMIN">관리자</option>
            </select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="현재 거주지 주소">
              <input
                value={draft.homeAddress}
                maxLength={300}
                placeholder="현재 거주 중인 주소를 입력해 주세요."
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    homeAddress: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Permission
            label="출퇴근 사용"
            checked={draft.attendanceEnabled}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                attendanceEnabled: checked,
              }))
            }
          />
          <Permission
            label="휴가·출장 사용"
            checked={draft.leaveEnabled}
            onChange={(checked) =>
              setDraft((current) => ({ ...current, leaveEnabled: checked }))
            }
          />
          <Permission
            label="WorkBoard 사용"
            checked={draft.workboardEnabled}
            disabled={!draft.email}
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                workboardEnabled: checked,
              }))
            }
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {saving
            ? "저장 중..."
            : editingId
              ? "변경사항 저장"
              : "직원 등록"}
        </button>
      </form>

      <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="font-semibold text-slate-800">
          직원 명부 일괄 등록
        </summary>
        <p className="mt-2 text-sm text-slate-500">
          한 줄에 사번, 이름, 입사일, 퇴사일, 휴대폰, 회사 이메일, 권한,
          개인 이메일, 비상연락망, 거주지 주소 순서로 입력합니다. 탭 구분을
          권장하며 기존 7개 항목 형식도 그대로 사용할 수 있습니다.
        </p>
        <textarea
          value={rosterText}
          onChange={(event) => setRosterText(event.target.value)}
          rows={7}
          placeholder={
            "사번\t이름\t입사일\t퇴사일\t휴대폰\t회사이메일\t권한\t개인이메일\t비상연락망\t거주지주소"
          }
          className="mt-4 w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm"
        />
        <button
          type="button"
          disabled={saving}
          onClick={importRoster}
          className="mt-3 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          명부 저장 및 권한 동기화
        </button>
      </details>

      {message && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400">
          직원 정보를 불러오는 중입니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1450px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">사번</th>
                <th className="px-4 py-3 font-medium">직원</th>
                <th className="px-4 py-3 font-medium">입·퇴사일</th>
                <th className="px-4 py-3 font-medium">회사 연락처</th>
                <th className="px-4 py-3 font-medium">개인 연락처 · 거주지</th>
                <th className="px-4 py-3 font-medium">권한</th>
                <th className="px-4 py-3 font-medium">서비스 사용</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  className={employee.active ? "" : "opacity-50"}
                >
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {employee.code}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">
                      {employee.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {[employee.department, employee.position]
                        .filter(Boolean)
                        .join(" · ") || "부서 미지정"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>입사 {displayDate(employee.hireDate)}</div>
                    <div className="mt-1">
                      퇴사 {displayDate(employee.terminationDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{employee.phone ?? "-"}</div>
                    <div className="mt-1 text-xs">{employee.email ?? "-"}</div>
                  </td>
                  <td className="max-w-[260px] px-4 py-3 text-slate-600">
                    <div>{employee.emergencyContactPhone ?? "-"}</div>
                    <div className="mt-1 text-xs">
                      {employee.personalEmail ?? "-"}
                    </div>
                    <div
                      className="mt-1 truncate text-xs text-slate-400"
                      title={employee.homeAddress ?? undefined}
                    >
                      {employee.homeAddress ?? "거주지 미등록"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {employee.systemRole === "ADMIN" ? "관리자" : "일반 직원"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>
                      출퇴근 {employee.attendanceEnabled ? "사용" : "차단"}
                    </div>
                    <div className="mt-1">
                      휴가관리 {employee.leaveEnabled ? "사용" : "차단"}
                    </div>
                    <div className="mt-1">
                      WorkBoard{" "}
                      {employee.workboardEnabled && employee.email
                        ? "사용"
                        : "차단"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        employee.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {employee.active ? "재직" : "퇴사"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => editEmployee(employee)}
                      className="text-sm font-semibold text-brand hover:underline"
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        퇴사자는 삭제하지 않고 비활성화해 기존 출퇴근·휴가·출장·업무 기록을
        보존합니다.
      </p>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-medium text-slate-600">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Permission({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-800">{value}</div>
    </div>
  );
}
