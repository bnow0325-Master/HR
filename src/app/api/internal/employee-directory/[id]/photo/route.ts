import { NextResponse } from "next/server";
import {
  employeeDirectoryApiConfigured,
  isEmployeeDirectoryRequestAuthorized,
} from "@/lib/internalApiAuth";
import { prisma } from "@/lib/prisma";
import {
  PROFILE_PHOTO_MAX_BYTES,
  validateProfilePhoto,
} from "@/lib/profilePhoto";

function authorizationError(request: Request) {
  if (!employeeDirectoryApiConfigured()) {
    return NextResponse.json(
      { error: "직원명부 내부 연동이 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  if (!isEmployeeDirectoryRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = authorizationError(request);
  if (denied) return denied;
  const { id } = await params;
  const photo = await prisma.employee.findUnique({
    where: { id },
    select: {
      profilePhotoData: true,
      profilePhotoMimeType: true,
      profilePhotoUpdatedAt: true,
    },
  });
  if (!photo?.profilePhotoData || !photo.profilePhotoMimeType) {
    return new Response(null, { status: 404 });
  }
  const bytes = Uint8Array.from(photo.profilePhotoData);
  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, max-age=300, must-revalidate",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": photo.profilePhotoMimeType,
      "X-Content-Type-Options": "nosniff",
      ...(photo.profilePhotoUpdatedAt
        ? { "Last-Modified": photo.profilePhotoUpdatedAt.toUTCString() }
        : {}),
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = authorizationError(request);
  if (denied) return denied;
  const { id } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, active: true },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "재직 직원을 찾을 수 없습니다." }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "프로필 사진 요청을 읽지 못했습니다." }, { status: 400 });
  }
  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "등록할 프로필 사진을 선택해 주세요." }, { status: 400 });
  }
  if (photo.size > PROFILE_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "프로필 사진은 2MB 이하만 등록할 수 있습니다." }, { status: 413 });
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const validation = validateProfilePhoto(bytes);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const profilePhotoUpdatedAt = new Date();
  await prisma.employee.update({
    where: { id },
    data: {
      profilePhotoData: bytes,
      profilePhotoMimeType: validation.mimeType,
      profilePhotoUpdatedAt,
    },
  });
  return NextResponse.json({ ok: true, profilePhotoUpdatedAt });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = authorizationError(request);
  if (denied) return denied;
  const { id } = await params;
  await prisma.employee.update({
    where: { id },
    data: {
      profilePhotoData: null,
      profilePhotoMimeType: null,
      profilePhotoUpdatedAt: null,
    },
  });
  return NextResponse.json({ ok: true });
}
