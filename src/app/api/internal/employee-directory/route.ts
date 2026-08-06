import { NextResponse } from "next/server";
import {
  employeeDirectoryApiConfigured,
  isEmployeeDirectoryRequestAuthorized,
} from "@/lib/internalApiAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ColumnRow = { column_name: string };

type BasicEmployeeRow = {
  id: string;
  code: string;
  name: string;
  department: string | null;
};

type ContractEmployeeRow = BasicEmployeeRow & {
  position: string | null;
  email: string | null;
  phone: string | null;
  hireDate: Date | string | null;
};

const CONTRACT_DIRECTORY_COLUMNS = [
  "position",
  "email",
  "phone",
  "hireDate",
] as const;

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Authorization",
  };
}

function dateOnly(value: Date | string | null): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}

async function supportsContractDirectoryFields(): Promise<boolean> {
  const columns = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Employee'
  `;
  const available = new Set(columns.map((column) => column.column_name));
  return CONTRACT_DIRECTORY_COLUMNS.every((column) => available.has(column));
}

async function listContractEmployees(): Promise<ContractEmployeeRow[]> {
  if (await supportsContractDirectoryFields()) {
    return prisma.$queryRaw<ContractEmployeeRow[]>`
      SELECT
        "id",
        "code",
        "name",
        "department",
        "position",
        "email",
        "phone",
        "hireDate"
      FROM "Employee"
      WHERE "active" = true
      ORDER BY "code" ASC
      LIMIT 500
    `;
  }

  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true, department: true },
    orderBy: { code: "asc" },
    take: 500,
  });
  return employees.map((employee: BasicEmployeeRow) => ({
    ...employee,
    position: null,
    email: null,
    phone: null,
    hireDate: null,
  }));
}

export async function GET(request: Request) {
  if (!employeeDirectoryApiConfigured()) {
    return NextResponse.json(
      { error: "직원명부 내부 연동이 설정되지 않았습니다." },
      { status: 503, headers: responseHeaders() },
    );
  }
  if (!isEmployeeDirectoryRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "인증되지 않은 요청입니다." },
      { status: 401, headers: responseHeaders() },
    );
  }

  const employees = await listContractEmployees();
  return NextResponse.json(
    {
      employees: employees.map((employee) => ({
        ...employee,
        hireDate: dateOnly(employee.hireDate),
      })),
    },
    { headers: responseHeaders() },
  );
}
