"use client";

import { FormEvent, useEffect, useState } from "react";
import { workboardLoginUrl } from "@/lib/workboardSsoClient";

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="mt-5 border-t border-slate-700 pt-4 text-xs text-slate-400">
            회사 기준 정보 변경은 관리자에게 요청해 주세요.
          </p>
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
