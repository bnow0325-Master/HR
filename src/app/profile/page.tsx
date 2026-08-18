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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
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

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        ok: false,
        text: "새 비밀번호와 확인 비밀번호가 일치하지 않습니다.",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "비밀번호 변경에 실패했습니다.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({
        ok: true,
        text:
          data.message ??
          "WorkBoard 비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.",
      });
    } catch (error) {
      setPasswordMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "비밀번호 변경에 실패했습니다.",
      });
    } finally {
      setChangingPassword(false);
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
        <h1 className="mt-2 text-3xl font-bold text-slate-950">내 정보 관리</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          개인 연락처를 직접 관리하고 WorkBoard 로그인 비밀번호를 변경합니다.
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
            저장한 정보는 관리자 직원명부에 즉시 반영됩니다.
          </p>
        </div>

        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <ProfileField label="개인 이메일">
            <input
              type="email"
              autoComplete="email"
              value={draft.personalEmail}
              placeholder="name@example.com"
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
              value={draft.emergencyContactPhone}
              placeholder="010-0000-0000"
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
            <ProfileField label="현재 거주지 주소">
              <input
                value={draft.homeAddress}
                maxLength={300}
                autoComplete="street-address"
                placeholder="현재 거주 중인 주소를 입력해 주세요."
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
          <h2 className="text-xl font-bold text-slate-900">
            WorkBoard 비밀번호 변경
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            비밀번호는 HR에 저장되지 않으며 WorkBoard 인증 시스템에서 바로
            변경됩니다.
          </p>
        </div>

        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ProfileField label="현재 비밀번호">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </ProfileField>
          </div>
          <ProfileField label="새 비밀번호">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </ProfileField>
          <ProfileField label="새 비밀번호 확인">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </ProfileField>
          <p className="text-xs leading-5 text-slate-400 sm:col-span-2">
            영문과 숫자를 포함해 8자 이상 입력해 주세요. 다음 WorkBoard
            로그인부터 새 비밀번호를 사용합니다.
          </p>
          {passwordMessage && (
            <Message ok={passwordMessage.ok}>{passwordMessage.text}</Message>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={changingPassword || !profile?.email}
              className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {changingPassword ? "변경 중..." : "WorkBoard 비밀번호 변경"}
            </button>
          </div>
        </form>
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
