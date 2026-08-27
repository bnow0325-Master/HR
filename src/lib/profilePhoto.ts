export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export type ProfilePhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

type ProfilePhotoValidation =
  | { ok: true; mimeType: ProfilePhotoMimeType }
  | { ok: false; error: string };

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectProfilePhotoMimeType(
  bytes: Uint8Array,
): ProfilePhotoMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function validateProfilePhoto(
  bytes: Uint8Array,
): ProfilePhotoValidation {
  if (bytes.length === 0) {
    return { ok: false, error: "프로필 사진 파일이 비어 있습니다." };
  }
  if (bytes.length > PROFILE_PHOTO_MAX_BYTES) {
    return {
      ok: false,
      error: "프로필 사진은 2MB 이하만 등록할 수 있습니다.",
    };
  }

  const mimeType = detectProfilePhotoMimeType(bytes);
  if (!mimeType) {
    return {
      ok: false,
      error: "JPEG, PNG 또는 WebP 사진만 등록할 수 있습니다.",
    };
  }
  return { ok: true, mimeType };
}
