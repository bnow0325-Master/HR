import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  employeeDirectoryApiConfigured,
  isEmployeeDirectoryRequestAuthorized,
} from "@/lib/internalApiAuth";
import { prisma } from "@/lib/prisma";
import {
  notifyCeoAboutApprovalDocument,
  notifyRequesterAboutApprovalDocument,
} from "@/lib/workboardApprovalNotifications";

export const dynamic = "force-dynamic";

type ApprovalField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date";
  required: boolean;
};

type ApprovalAction =
  | { action: "submit"; templateId: string; title: string; values: Record<string, string | number> }
  | { action: "decide"; documentId: string; version: number; decision: "APPROVED" | "REJECTED"; note: string }
  | { action: "withdraw"; documentId: string; version: number; note: string }
  | { action: "save-template"; templateId?: string; name: string; description: string; fields: ApprovalField[]; active: boolean };

type EmployeeIdentity = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  email: string;
};

type EmployeeIdentityResult =
  | { employee: EmployeeIdentity }
  | { error: "CONFIG" | "AUTH" | "EMPLOYEE" };

const fieldTypes = new Set<ApprovalField["type"]>(["text", "textarea", "number", "date"]);

function approvalFields(value: unknown): ApprovalField[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const fields: ApprovalField[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const field = item as Record<string, unknown>;
    const key = typeof field.key === "string" ? field.key.trim() : "";
    const label = typeof field.label === "string" ? field.label.trim() : "";
    const type = field.type as ApprovalField["type"];
    if (!/^[a-z][a-zA-Z0-9]{1,39}$/.test(key) || !label || label.length > 80 || !fieldTypes.has(type) || typeof field.required !== "boolean") return null;
    fields.push({ key, label, type, required: field.required });
  }
  return fields;
}

function shortText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function parseAction(value: unknown): ApprovalAction | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.action === "submit") {
    const templateId = shortText(body.templateId, 191);
    const title = shortText(body.title, 160);
    if (!templateId || !title || !body.values || typeof body.values !== "object" || Array.isArray(body.values)) return null;
    const values: Record<string, string | number> = {};
    for (const [key, item] of Object.entries(body.values as Record<string, unknown>)) {
      if (typeof item !== "string" && typeof item !== "number") return null;
      values[key] = item;
    }
    return { action: "submit", templateId, title, values };
  }
  if (body.action === "decide" || body.action === "withdraw") {
    const documentId = shortText(body.documentId, 191);
    const version = typeof body.version === "number" && Number.isInteger(body.version) && body.version > 0 ? body.version : null;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!documentId || !version) return null;
    if (body.action === "withdraw") return { action: "withdraw", documentId, version, note };
    if (body.decision !== "APPROVED" && body.decision !== "REJECTED") return null;
    return { action: "decide", documentId, version, decision: body.decision, note };
  }
  if (body.action === "save-template") {
    const name = shortText(body.name, 80);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
    const fields = approvalFields(body.fields);
    const templateId = body.templateId === undefined ? undefined : shortText(body.templateId, 191) ?? undefined;
    if (!name || !fields) return null;
    return { action: "save-template", templateId, name, description, fields, active: body.active !== false };
  }
  return null;
}

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function ceoEmail() {
  return (process.env.APPROVAL_CEO_EMAIL?.trim() || "elon.choo@bnow.co.kr").toLowerCase();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function documentNumber() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).replaceAll("-", "");
  return `APP-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function authorizedEmployee(request: Request): Promise<EmployeeIdentityResult> {
  if (!employeeDirectoryApiConfigured()) return { error: "CONFIG" as const };
  if (!isEmployeeDirectoryRequestAuthorized(request.headers.get("authorization"))) {
    return { error: "AUTH" as const };
  }
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  const employee = email
    ? await prisma.employee.findFirst({
        where: { email, active: true, workboardEnabled: true },
        select: {
          id: true,
          code: true,
          name: true,
          department: true,
          position: true,
          email: true,
        },
      })
    : null;
  return employee?.email
    ? { employee: { ...employee, email: employee.email } }
    : { error: "EMPLOYEE" };
}

function authError(error: "CONFIG" | "AUTH" | "EMPLOYEE") {
  if (error === "CONFIG") {
    return NextResponse.json({ error: "결재 내부 연동이 설정되지 않았습니다." }, { status: 503, headers: noStoreHeaders });
  }
  if (error === "AUTH") {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401, headers: noStoreHeaders });
  }
  return NextResponse.json({ error: "재직 중인 WorkBoard 사용자를 찾을 수 없습니다." }, { status: 403, headers: noStoreHeaders });
}

export async function GET(request: Request) {
  const identity = await authorizedEmployee(request);
  if ("error" in identity) return authError(identity.error);
  const employee = identity.employee;
  const isCeo = employee.email.toLowerCase() === ceoEmail();

  const [ceo, templates, documents] = await Promise.all([
    prisma.employee.findFirst({
      where: { email: ceoEmail(), active: true, workboardEnabled: true },
      select: { name: true, email: true },
    }),
    prisma.approvalTemplate.findMany({
      where: isCeo ? {} : { active: true },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.approvalDocument.findMany({
      where: isCeo
        ? {
            OR: [
              { requesterId: employee.id },
              { approverEmail: ceoEmail(), status: "PENDING" },
            ],
          }
        : { requesterId: employee.id },
      include: { events: { orderBy: { createdAt: "asc" } } },
      orderBy: { submittedAt: "desc" },
      take: 300,
    }),
  ]);

  const serialized = documents.map((document) => ({
    ...document,
    values: parseJson<Record<string, string | number>>(document.valuesJson, {}),
    fields: approvalFields(parseJson<unknown>(document.templateFieldsJson, [])) ?? [],
    valuesJson: undefined,
    templateFieldsJson: undefined,
  }));
  const pending = serialized.filter((document) => document.status === "PENDING");

  return NextResponse.json({
    employee: {
      name: employee.name,
      code: employee.code,
      department: employee.department,
      position: employee.position,
      email: employee.email,
    },
    canApprove: isCeo,
    ceo: ceo ?? { name: "대표이사", email: ceoEmail() },
    counts: {
      myPending: pending.filter((document) => document.requesterId === employee.id).length,
      reviewPending: isCeo ? pending.length : 0,
    },
    templates: templates.map((template) => ({
      ...template,
      fields: approvalFields(parseJson<unknown>(template.fieldsJson, [])) ?? [],
      fieldsJson: undefined,
    })),
    documents: serialized,
  }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const identity = await authorizedEmployee(request);
  if ("error" in identity) return authError(identity.error);
  const employee = identity.employee;
  const isCeo = employee.email.toLowerCase() === ceoEmail();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "결재 입력값을 확인해 주세요." },
      { status: 400, headers: noStoreHeaders },
    );
  }
  const parsed = parseAction(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "결재 입력값을 확인해 주세요." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  if (parsed.action === "save-template") {
    if (!isCeo) return NextResponse.json({ error: "대표이사만 양식을 관리할 수 있습니다." }, { status: 403, headers: noStoreHeaders });
    const keys = new Set(parsed.fields.map((field) => field.key));
    if (keys.size !== parsed.fields.length) {
      return NextResponse.json({ error: "양식 항목 키는 중복될 수 없습니다." }, { status: 400, headers: noStoreHeaders });
    }
    const data = {
      name: parsed.name,
      description: parsed.description || null,
      fieldsJson: JSON.stringify(parsed.fields),
      active: parsed.active,
      updatedByEmail: employee.email,
    };
    const template = parsed.templateId
      ? await prisma.approvalTemplate.update({ where: { id: parsed.templateId }, data })
      : await prisma.approvalTemplate.create({
          data: { ...data, createdByEmail: employee.email },
        });
    return NextResponse.json({ ok: true, templateId: template.id }, { headers: noStoreHeaders });
  }

  if (parsed.action === "submit") {
    const [template, ceo] = await Promise.all([
      prisma.approvalTemplate.findFirst({ where: { id: parsed.templateId, active: true } }),
      prisma.employee.findFirst({
        where: { email: ceoEmail(), active: true, workboardEnabled: true },
        select: { name: true, email: true },
      }),
    ]);
    if (!template) return NextResponse.json({ error: "사용할 수 없는 결재 양식입니다." }, { status: 404, headers: noStoreHeaders });
    if (!ceo?.email) return NextResponse.json({ error: "대표이사 결재 계정이 준비되지 않았습니다." }, { status: 503, headers: noStoreHeaders });
    const approverEmail = ceo.email;

    const fields = approvalFields(parseJson<unknown>(template.fieldsJson, []));
    if (!fields) {
      return NextResponse.json({ error: "결재 양식 구성이 올바르지 않습니다." }, { status: 500, headers: noStoreHeaders });
    }
    const values: Record<string, string | number> = {};
    for (const field of fields) {
      const raw = parsed.values[field.key];
      const value = typeof raw === "number" ? raw : String(raw ?? "").trim();
      if (field.required && value === "") {
        return NextResponse.json({ error: `${field.label} 항목을 입력해 주세요.` }, { status: 400, headers: noStoreHeaders });
      }
      if (value !== "") values[field.key] = value;
    }

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.approvalDocument.create({
        data: {
          documentNo: documentNumber(),
          templateId: template.id,
          templateName: template.name,
          templateFieldsJson: template.fieldsJson,
          requesterId: employee.id,
          requesterEmail: employee.email,
          requesterName: employee.name,
          requesterDepartment: employee.department,
          title: parsed.title,
          valuesJson: JSON.stringify(values),
          approverEmail,
          approverName: ceo.name,
        },
      });
      await tx.approvalDocumentEvent.create({
        data: {
          documentId: created.id,
          action: "SUBMIT",
          fromStatus: null,
          toStatus: "PENDING",
          actorEmail: employee.email,
          actorName: employee.name,
        },
      });
      return created;
    });
    await notifyCeoAboutApprovalDocument({
      documentId: document.id,
      documentNo: document.documentNo,
      title: document.title,
      templateName: document.templateName,
      requesterEmail: document.requesterEmail,
      requesterName: document.requesterName,
    });
    return NextResponse.json({ ok: true, documentId: document.id }, { status: 201, headers: noStoreHeaders });
  }

  if (parsed.action === "withdraw") {
    const document = await prisma.$transaction(async (tx) => {
      const existing = await tx.approvalDocument.findFirst({
        where: { id: parsed.documentId, requesterId: employee.id, status: "PENDING", version: parsed.version },
      });
      if (!existing) return null;
      const updated = await tx.approvalDocument.updateMany({
        where: { id: existing.id, status: "PENDING", version: parsed.version },
        data: { status: "WITHDRAWN", version: { increment: 1 } },
      });
      if (updated.count !== 1) return null;
      await tx.approvalDocumentEvent.create({
        data: {
          documentId: existing.id,
          action: "WITHDRAW",
          fromStatus: "PENDING",
          toStatus: "WITHDRAWN",
          actorEmail: employee.email,
          actorName: employee.name,
          note: parsed.note || null,
        },
      });
      return existing;
    });
    if (!document) return NextResponse.json({ error: "이미 처리되었거나 회수할 수 없는 문서입니다." }, { status: 409, headers: noStoreHeaders });
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  }

  if (!isCeo) return NextResponse.json({ error: "대표이사만 결재할 수 있습니다." }, { status: 403, headers: noStoreHeaders });
  if (parsed.decision === "REJECTED" && !parsed.note) {
    return NextResponse.json({ error: "반려 사유를 입력해 주세요." }, { status: 400, headers: noStoreHeaders });
  }
  const decidedAt = new Date();
  const document = await prisma.$transaction(async (tx) => {
    const existing = await tx.approvalDocument.findFirst({
      where: { id: parsed.documentId, approverEmail: employee.email, status: "PENDING", version: parsed.version },
    });
    if (!existing) return null;
    const updated = await tx.approvalDocument.updateMany({
      where: { id: existing.id, status: "PENDING", version: parsed.version },
      data: {
        status: parsed.decision,
        decisionNote: parsed.note || null,
        decidedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return null;
    await tx.approvalDocumentEvent.create({
      data: {
        documentId: existing.id,
        action: parsed.decision === "APPROVED" ? "APPROVE" : "REJECT",
        fromStatus: "PENDING",
        toStatus: parsed.decision,
        actorEmail: employee.email,
        actorName: employee.name,
        note: parsed.note || null,
      },
    });
    return existing;
  });
  if (!document) return NextResponse.json({ error: "이미 처리되었거나 최신 상태가 아닌 문서입니다." }, { status: 409, headers: noStoreHeaders });
  await notifyRequesterAboutApprovalDocument({
    documentId: document.id,
    documentNo: document.documentNo,
    title: document.title,
    templateName: document.templateName,
    requesterEmail: document.requesterEmail,
    requesterName: document.requesterName,
    decision: parsed.decision,
    decisionNote: parsed.note || null,
  });
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
