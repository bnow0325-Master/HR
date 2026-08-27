"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { workboardLoginUrl } from "@/lib/workboardSsoClient";
import { PROFILE_PHOTO_MAX_BYTES } from "@/lib/profilePhoto";

type Profile = {
  code: string;
  name: string;
  department: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  personalEmail: string | null;
  homeAddress: string | null;
  emergencyContactPhone: string | null;
  hasProfilePhoto: boolean;
  profilePhotoUrl: string | null;
  profilePhotoUpdatedAt: string | null;
  updatedAt: string;
};

type ProfileDraft = {
  personalEmail: string;
  homeAddress: string;
  emergencyContactPhone: string;
};

const EMPTY_DRAFT: ProfileDraft = {
  personalEmail: "",
  homeAddress: "",
  emergencyContactPhone: "",
};

export default function ProfilePage() {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [photoMessage, setPhotoMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedPhoto) {
      setPhotoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedPhoto);
    setPhotoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedPhoto]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        if (response.status === 401) {
          window.location.replace(workboardLoginUrl("/profile"));
          return;
        }
        const data = (await response.json()) as {
          profile?: Profile;
          error?: string;
        };
        if (!response.ok || !data.profile) {
          throw new Error(data.error ?? "내 정보를 불러오지 못했습니다.");
        }
        if (cancelled) return;

        setProfile(data.profile);
        setDraft({
          personalEmail: data.profile.personalEmail ?? "",
          homeAddress: data.profile.homeAddress ?? "",
          emergencyContactPhone: data.profile.emergencyContactPhone ?? "",
        });
      } catch (error) {
        if (!cancelled) {
          setProfileMessage({
            ok: false,
            text:
              error instanceof Error
                ? error.message
                : "내 정보를 불러오지 못했습니다.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setProfileMessage(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await response.json()) as {
        profile?: Profile;
        error?: string;
      };
      if (!response.ok || !data.profile) {
        throw new Error(data.error ?? "내 정보 저장에 실패했습니다.");
      }

      setProfile(data.profile);
      setProfileMessage({
        ok: true,
        text: "내 정보를 저장했습니다. 관리자 직원명부에도 바로 반영됩니다.",
      });
    } catch (error) {
      setProfileMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "내 정보 저장에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  function choosePhoto(file: File | null) {
    setPhotoMessage(null);
    if (!file) {
      setSelectedPhoto(null);
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setSelectedPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setPhotoMessage({
        ok: false,
        text: "프로필 사진은 2MB 이하만 등록할 수 있습니다.",
      });
      return;
    }
    setSelectedPhoto(file);
  }

  async function uploadPhoto() {
    if (!selectedPhoto) return;
    setPhotoSaving(true);
    setPhotoMessage(null);

    try {
      const formData = new FormData();
      formData.set("photo", selectedPhoto);
      const response = await fetch("/api/profile/photo", {
        method: "PUT",
        body: formData,
      });
      const data = (await response.json()) as {
        profilePhotoUpdatedAt?: string;
        profilePhotoUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.profilePhotoUrl) {
        throw new Error(data.error ?? "프로필 사진 등록에 실패했습니다.");
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              hasProfilePhoto: true,
              profilePhotoUrl: data.profilePhotoUrl ?? null,
              profilePhotoUpdatedAt: data.profilePhotoUpdatedAt ?? null,
            }
          : current,
      );
      setSelectedPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setPhotoMessage({ ok: true, text: "프로필 사진을 등록했습니다." });
    } catch (error) {
      setPhotoMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "프로필 사진 등록에 실패했습니다.",
      });
    } finally {
      setPhotoSaving(false);
    }
  }

  async function deletePhoto() {
    if (!window.confirm("등록한 프로필 사진을 삭제할까요?")) return;
    setPhotoSaving(true);
    setPhotoMessage(null);

    try {
      const response = await fetch("/api/profile/photo", { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "프로필 사진 삭제에 실패했습니다.");
      }
      setProfile((current) =>
        current
          ? {
              ...current,
              hasProfilePhoto: false,
              profilePhotoUrl: null,
              profilePhotoUpdatedAt: null,
            }
          : current,
      );
      setSelectedPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setPhotoMessage({ ok: true, text: "프로필 사진을 삭제했습니다." });
    } catch (error) {
      setPhotoMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "프로필 사진 삭제에 실패했습니다.",
      });
    } finally {
      setPhotoSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-center text-sm text-slate-500">
        내 정보를 불러오는 중입니다.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-bold tracking-[0.18em] text-blue-600">
          MY PROFILE
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">내 정보 변경</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          개인 연락처를 직접 관리하고 사내 통합 계정 보안을 확인합니다.
        </p>
      </header>

      {profile && (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ProfileAvatar
              name={profile.name}
              src={photoPreviewUrl ?? profile.profilePhotoUrl}
              className="h-24 w-24 border-4 border-slate-700"
            />
            <div className="grid flex-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Identity label="이름" value={profile.name} />
              <Identity label="사번" value={profile.code} />
              <Identity
                label="부서 · 직급"
                value={
                  [profile.department, profile.position]
                    .filter(Boolean)
                    .join(" · ") || "미등록"
                }
              />
              <Identity label="회사 이메일" value={profile.email ?? "미등록"} />
            </div>
          </div>
          <p className="mt-5 border-t border-slate-700 pt-4 text-xs text-slate-400">
            회사 기준 정보 변경은 관리자에게 요청해 주세요.
          </p>
        </section>
      )}

      {profile && (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900">프로필 사진</h2>
            <p className="mt-1 text-sm text-slate-500">
              본인을 알아볼 수 있는 정면 사진을 등록해 주세요. JPEG, PNG, WebP
              형식의 2MB 이하 파일만 사용할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProfileAvatar
              name={profile.name}
              src={photoPreviewUrl ?? profile.profilePhotoUrl}
              className="h-32 w-32 border-4 border-slate-100"
            />
            <div className="flex-1">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-3 file:text-sm file:font-bold file:text-slate-800 hover:file:bg-slate-200"
              />
              {selectedPhoto && (
                <p className="mt-2 text-xs text-slate-500">
                  선택한 파일: {selectedPhoto.name}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!selectedPhoto || photoSaving}
                  onClick={() => void uploadPhoto()}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {photoSaving ? "처리 중..." : "선택한 사진 등록"}
                </button>
                {profile.hasProfilePhoto && (
                  <button
                    type="button"
                    disabled={photoSaving}
                    onClick={() => void deletePhoto()}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    등록 사진 삭제
                  </button>
                )}
              </div>
            </div>
          </div>
          {photoMessage && (
            <div className="mt-4">
              <Message ok={photoMessage.ok}>{photoMessage.text}</Message>
            </div>
          )}
        </section>
      )}

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">개인정보 변경</h2>
          <p className="mt-1 text-sm text-slate-500">
            비상 상황과 우편물 발송에 필요한 정보이며 관리자 직원명부에 즉시
            반영됩니다.
          </p>
        </div>

        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <ProfileField label="개인 이메일">
            <input
              type="email"
              autoComplete="email"
              required
              value={draft.personalEmail}
              placeholder="개인 이메일을 입력해 주세요."
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  personalEmail: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </ProfileField>
          <ProfileField label="비상연락망 연락처">
            <input
              type="tel"
              autoComplete="tel"
              required
              value={draft.emergencyContactPhone}
              placeholder="비상 시 연락 가능한 010-0000-0000"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  emergencyContactPhone: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </ProfileField>
          <div className="sm:col-span-2">
            <ProfileField label="우편물 수령 가능 주소">
              <input
                value={draft.homeAddress}
                maxLength={300}
                required
                autoComplete="street-address"
                placeholder="우편물을 실제로 받을 수 있는 주소를 입력해 주세요."
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    homeAddress: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </ProfileField>
          </div>

          {profileMessage && (
            <Message ok={profileMessage.ok}>{profileMessage.text}</Message>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving || !profile}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "저장 중..." : "내 정보 저장"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">사내 통합 계정</h2>
          <p className="mt-1 text-sm text-slate-500">
            비밀번호와 다중 인증은 자체 인증 서버에서 관리하며 HR에는 저장되지 않습니다.
          </p>
        </div>
        <a
          href="https://auth.bnow.co.kr/realms/bnow/account/#/security/signingin"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          비밀번호·보안 설정 열기
        </a>
      </section>
    </main>
  );
}

function Identity({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function ProfileAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src: string | null;
  className: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-2xl font-black text-white ${className}`}
      aria-label={`${name} 프로필 사진`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${name} 프로필`} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{name.trim().slice(0, 1) || "?"}</span>
      )}
    </div>
  );
}

function ProfileField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function Message({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={`rounded-xl px-4 py-3 text-sm sm:col-span-2 ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
      }`}
    >
      {children}
    </div>
  );
}
