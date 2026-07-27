"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
};

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number; accuracy: number | null }
  | { status: "error"; message: string };

type AddressState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; address: string }
  | { status: "error"; message: string };

type SubmitResult =
  | {
      ok: true;
      type: "IN" | "OUT";
      time: string;
      address: string;
    }
  | { ok: false; message: string };

type AttendanceStatus = {
  loading: boolean;
  checkedIn: boolean;
  nextAction: "IN" | "OUT";
};

function formatDongAddress(raw: string) {
  const normalized = raw.replaceAll(",", " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "주소를 확인하지 못했습니다.";

  const parts = normalized
    .split(" ")
    .filter(Boolean)
    .filter(
      (part) =>
        !(
          part.endsWith("특별시") ||
          part.endsWith("광역시") ||
          part.endsWith("특별자치시") ||
          part.endsWith("특별자치도") ||
          part.endsWith("도")
        ),
    );

  const district = parts.find((part) => /(구|군|시)$/.test(part)) ?? "";
  const neighborhood =
    parts
      .map((part) => {
        const dongMatch = part.match(/^(.*(?:동|읍|면|리))(?:\d+가)?$/);
        if (dongMatch) return dongMatch[1];

        const roadMatch = part.match(/^(.*동)(?:로|길).*$/);
        if (roadMatch) return roadMatch[1];

        return "";
      })
      .find(Boolean) ?? "";

  if (district && neighborhood) {
    return `${district} ${neighborhood}`;
  }

  return neighborhood || district || parts.slice(0, 2).join(" ");
}

export default function CheckPage() {
  const searchParams = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [address, setAddress] = useState<AddressState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [employeeError, setEmployeeError] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>({
    loading: false,
    checkedIn: false,
    nextAction: "IN",
  });

  const requestedEmployeeName = useMemo(
    () => searchParams.get("name")?.trim() ?? "",
    [searchParams],
  );

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? []))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (employees.length === 0) return;

    if (!requestedEmployeeName) {
      if (!employeeId) {
        setEmployeeError(
          "워크보드 로그인 사용자 정보가 없어 직원을 자동으로 찾지 못했습니다.",
        );
      }
      return;
    }

    const matched = employees.find(
      (employee) => employee.name.trim() === requestedEmployeeName,
    );

    if (!matched) {
      setEmployeeError(
        `워크보드 사용자 "${requestedEmployeeName}" 와 일치하는 직원을 찾지 못했습니다.`,
      );
      return;
    }

    setEmployeeId(matched.id);
    setEmployeeError("");
    window.sessionStorage.setItem("workboardEmployeeName", matched.name);
    window.sessionStorage.setItem("workboardEmployeeId", matched.id);
  }, [employeeId, employees, requestedEmployeeName]);

  async function resolveAddress(lat: number, lng: number) {
    setAddress({ status: "loading" });
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
      });
      const res = await fetch(`/api/location/address?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.address) {
        setAddress({
          status: "error",
          message: data.error ?? "주소를 가져오지 못했습니다.",
        });
        return;
      }
      setAddress({ status: "ready", address: data.address });
    } catch {
      setAddress({ status: "error", message: "주소를 가져오지 못했습니다." });
    }
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setGeo({ status: "error", message: "이 기기는 위치를 지원하지 않습니다." });
      setAddress({ status: "idle" });
      return;
    }
    setGeo({ status: "loading" });
    setAddress({ status: "idle" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        void resolveAddress(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGeo({
          status: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "위치 권한이 거부되었습니다. 출퇴근하려면 위치를 허용해 주세요."
              : "위치를 가져오지 못했습니다.",
        });
        setAddress({ status: "idle" });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    if (employeeId && geo.status === "idle") {
      requestLocation();
    }
  }, [employeeId, geo.status]);

  useEffect(() => {
    if (!employeeId) return;

    let cancelled = false;

    async function loadAttendanceStatus() {
      setAttendanceStatus((current) => ({ ...current, loading: true }));
      try {
        const params = new URLSearchParams({
          employeeId,
          latest: "1",
        });
        const res = await fetch(`/api/attendance?${params}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;

        setAttendanceStatus({
          loading: false,
          checkedIn: Boolean(data.checkedIn),
          nextAction: data.nextAction === "OUT" ? "OUT" : "IN",
        });
      } catch {
        if (cancelled) return;
        setAttendanceStatus({
          loading: false,
          checkedIn: false,
          nextAction: "IN",
        });
      }
    }

    void loadAttendanceStatus();

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  async function submit(type: "IN" | "OUT") {
    setResult(null);
    if (!employeeId) {
      setResult({
        ok: false,
        message: employeeError || "워크보드 로그인 사용자와 연결된 직원을 찾지 못했습니다.",
      });
      return;
    }
    if (geo.status === "loading") {
      setResult({ ok: false, message: "현재 위치를 확인 중입니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    if (geo.status !== "ready") {
      setResult({ ok: false, message: "현재 접속 위치를 확인하지 못했습니다." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          type,
          latitude: geo.lat,
          longitude: geo.lng,
          address: address.status === "ready" ? address.address : "",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const nextAction = type === "IN" ? "OUT" : "IN";
        setResult({
          ok: true,
          type,
          time: new Date(data.record.timestamp).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          address:
            typeof data.record.address === "string" && data.record.address
              ? formatDongAddress(data.record.address)
              : "주소를 확인하지 못했습니다.",
        });
        setAttendanceStatus({
          loading: false,
          checkedIn: type === "IN",
          nextAction,
        });
      } else {
        setResult({ ok: false, message: data.error ?? "처리에 실패했습니다." });
      }
    } catch {
      setResult({ ok: false, message: "네트워크 오류가 발생했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  const currentEmployee = employees.find((employee) => employee.id === employeeId) ?? null;
  const canCheckIn =
    !submitting &&
    !attendanceStatus.loading &&
    geo.status === "ready" &&
    attendanceStatus.nextAction === "IN";
  const canCheckOut =
    !submitting &&
    !attendanceStatus.loading &&
    geo.status === "ready" &&
    attendanceStatus.nextAction === "OUT";

  const statusMessage = employeeError
    ? employeeError
    : geo.status === "loading"
      ? "현재 위치를 확인하는 중입니다. 잠시만 기다려 주세요."
      : geo.status === "error"
        ? geo.message
        : geo.status === "idle"
          ? "현재 위치 확인을 준비하고 있습니다."
          : attendanceStatus.loading
            ? "현재 출퇴근 상태를 확인하는 중입니다."
            : attendanceStatus.checkedIn
              ? "이미 출근 상태입니다. 퇴근 버튼만 사용할 수 있습니다."
              : "위치 확인이 완료되었습니다. 출근 버튼을 누를 수 있습니다.";
  const statusTone =
    employeeError || geo.status === "error" ? "text-red-600" : "text-slate-500";

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">출퇴근</h1>
          <p className="mt-1 text-sm text-slate-500">
            워크보드 로그인 사용자 기준으로 직원 정보를 자동 불러오고 현재 위치를 바로 기록합니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">
          홈
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-600">로그인 사용자</span>
        <div className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-800">
            {currentEmployee
              ? `${currentEmployee.name} (${currentEmployee.code})`
              : requestedEmployeeName || "사용자 정보 없음"}
          </div>
          <div className="mt-1 text-slate-500">
            {currentEmployee?.department ?? "부서 정보 없음"}
          </div>
        </div>
        {employeeError && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {employeeError}
          </div>
        )}
      </div>

      {/* 출근 / 퇴근 버튼 */}
      <div className="mt-2 grid grid-cols-2 gap-3">
        <button
          disabled={!canCheckIn}
          onClick={() => submit("IN")}
          className="rounded-xl bg-brand px-6 py-5 text-lg font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
        >
          출근
        </button>
        <button
          disabled={!canCheckOut}
          onClick={() => submit("OUT")}
          className="rounded-xl bg-slate-700 px-6 py-5 text-lg font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          퇴근
        </button>
      </div>

      <div className={`text-center text-sm ${statusTone}`}>
        {statusMessage}
      </div>

      {result && (
        result.ok ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center shadow-sm">
            <div className="text-xl font-bold text-emerald-700">
              {result.type === "IN"
                ? "출근등록이 되었습니다."
                : "퇴근등록이 되었습니다."}
            </div>
            <div className="mt-2 text-3xl font-bold text-slate-900">
              {result.time}
            </div>
            <div className="mt-4 rounded-lg bg-white/80 px-4 py-3 text-left text-sm text-slate-700">
              <div className="font-semibold text-slate-800">기록 위치</div>
              <div className="mt-1">{result.address}</div>
            </div>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              메인으로 가기
            </Link>
          </div>
        ) : (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">
            {result.message}
          </div>
        )
      )}
    </main>
  );
}
