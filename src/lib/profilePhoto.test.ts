import assert from "node:assert/strict";
import test from "node:test";
import {
  PROFILE_PHOTO_MAX_BYTES,
  detectProfilePhotoMimeType,
  validateProfilePhoto,
} from "./profilePhoto";

test("detects supported profile photo signatures", () => {
  assert.equal(
    detectProfilePhotoMimeType(
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
    ),
    "image/jpeg",
  );
  assert.equal(
    detectProfilePhotoMimeType(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectProfilePhotoMimeType(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45,
        0x42, 0x50,
      ]),
    ),
    "image/webp",
  );
});

test("rejects empty, oversized, and unsupported profile photos", () => {
  assert.equal(validateProfilePhoto(new Uint8Array()).ok, false);
  assert.equal(
    validateProfilePhoto(new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1)).ok,
    false,
  );
  assert.deepEqual(validateProfilePhoto(Uint8Array.from([0x47, 0x49, 0x46])), {
    ok: false,
    error: "JPEG, PNG 또는 WebP 사진만 등록할 수 있습니다.",
  });
});
