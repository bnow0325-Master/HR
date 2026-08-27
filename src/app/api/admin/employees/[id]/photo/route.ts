import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
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
