import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PROFILE_PHOTO_MAX_BYTES,
  validateProfilePhoto,
} from "@/lib/profilePhoto";
import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

export const runtime = "nodejs";

async function currentEmployee() {
  return getCurrentWorkboardEmployee("any");
}

function unauthorized() {
  return NextResponse.json(
    { error: "워크보드 로그인이 필요합니다." },
    { status: 401 },
  );
}

export async function GET() {
  const employee = await currentEmployee();
  if (!employee) return unauthorized();

  const profilePhoto = await prisma.employee.findUnique({
    where: { id: employee.id },
    select: {
      profilePhotoData: true,
      profilePhotoMimeType: true,
      profilePhotoUpdatedAt: true,
    },
  });
  if (
    !profilePhoto?.profilePhotoData ||
    !profilePhoto.profilePhotoMimeType ||
    !profilePhoto.profilePhotoUpdatedAt
  ) {
    return NextResponse.json(
      { error: "등록된 프로필 사진이 없습니다." },
      { status: 404 },
    );
  }

  const bytes = Uint8Array.from(profilePhoto.profilePhotoData);
  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, max-age=300, must-revalidate",
      "Content-Disposition": "inline",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": profilePhoto.profilePhotoMimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(request: Request) {
  const employee = await currentEmployee();
  if (!employee) return unauthorized();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "프로필 사진 요청을 읽지 못했습니다." },
      { status: 400 },
    );
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json(
      { error: "등록할 프로필 사진을 선택해 주세요." },
      { status: 400 },
    );
  }

  if (photo.size > PROFILE_PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { error: "프로필 사진은 2MB 이하만 등록할 수 있습니다." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const validation = validateProfilePhoto(bytes);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const profilePhotoUpdatedAt = new Date();
  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      profilePhotoData: bytes,
      profilePhotoMimeType: validation.mimeType,
      profilePhotoUpdatedAt,
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    profilePhotoUpdatedAt,
    profilePhotoUrl: `/api/profile/photo?v=${profilePhotoUpdatedAt.getTime()}`,
  });
}

export async function DELETE() {
  const employee = await currentEmployee();
  if (!employee) return unauthorized();

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      profilePhotoData: null,
      profilePhotoMimeType: null,
      profilePhotoUpdatedAt: null,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
