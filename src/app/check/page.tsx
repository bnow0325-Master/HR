"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CurrentWorkStatus from "@/components/CurrentWorkStatus";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
};

type DevelopmentEmployee = Employee & {
  active?: boolean;
  attendanceEnabled?: boolean;
};

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number; accuracy: number | null }
  | { status: "error"; message: string };

type SubmitResult =
  | {
      ok: true;
      type: "IN" | "OUT";
      time: string;
    }
  | { ok: false; message: string };

type AttendanceStatus = {
  loading: boolean;
  checkedIn: boolean;
  completed: boolean;
  nextAction: "IN" | "OUT" | null;
  checkoutAt: string | null;
  cancelExpiresAt: string | null;
};

type LocationConsentStatus = "loading" | "required" | "granted" | "error";

type DevelopmentAttendanceRecord = {
  type: "IN" | "OUT";
  timestamp: string;
  cancelledAt?: string | null;
  cancelNote?: string | null;
};

const DEVELOPMENT_EMPLOYEE: Employee = {
  id: "development-chu-dong-hyeon",
  code: "DEV",
  name: "추동현",
  department: "개발 사용자",
};

const DEVELOPMENT_RECORDS_KEY = "checkinoutDevelopmentRecords";
const DEVELOPMENT_EMPLOYEES_KEY = "checkinoutDevelopmentEmployees";
const DEVELOPMENT_LOCATION_CONSENT_KEY = "checkinoutLocationConsent";
const CHECKOUT_CANCEL_WINDOW_MS = 30 * 60 * 1000;

function loadDevelopmentEmployees() {
  try {
    const storedEmployees = JSON.parse(
      window.localStorage.getItem(DEVELOPMENT_EMPLOYEES_KEY) ?? "[]",
    ) as DevelopmentEmployee[];
    const availableEmployees = storedEmployees.filter(
      (employee) =>
        employee.active !== false && employee.attendanceEnabled !== false,
    );

    return availableEmployees.length > 0
      ? availableEmployees
      : [DEVELOPMENT_EMPLOYEE];
  } catch {
    return [DEVELOPMENT_EMPLOYEE];
  }
}

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

function kstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function getTodayDevelopmentRecords(
  records: DevelopmentAttendanceRecord[],
  now = new Date(),
) {
  const today = kstDateKey(now);
  return records.filter(
    (record) =>
      !record.cancelledAt &&
      kstDateKey(new Date(record.timestamp)) === today,
  );
}

function formatCancelRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

function CheckPageContent() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const [employees, setEmployees] = useState<Employee[]>(
    isDevelopment ? [DEVELOPMENT_EMPLOYEE] : [],
  );
  const [employeeId, setEmployeeId] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [employeeError, setEmployeeError] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>({
    loading: true,
    checkedIn: false,
    completed: false,
    nextAction: "IN",
    checkoutAt: null,
    cancelExpiresAt: null,
  });
  const [cancelClock, setCancelClock] = useState(() => Date.now());
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [locationConsentStatus, setLocationConsentStatus] =
    useState<LocationConsentStatus>(isDevelopment ? "required" : "loading");
  const [agreeingLocationConsent, setAgreeingLocationConsent] = useState(false);

  useEffect(() => {
    if (isDevelopment) {
      setEmployees(loadDevelopmentEmployees());
      return;
    }

    fetch("/api/employees", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json();
          throw new Error(
            data.error ?? "워크보드 로그인 사용자를 불러오지 못했습니다.",
          );
        }
        return response.json();
      })
      .then((data) => {
        setEmployees((data.employees ?? []) as Employee[]);
      })
      .catch((error: Error) => {
        setEmployees([]);
        setEmployeeError(error.message);
      });
  }, [isDevelopment]);

  useEffect(() => {
    if (employees.length === 0) return;

    const matched = employees[0];

    if (!matched) {
      setEmployeeError("워크보드에서 인사관리를 다시 열어 주세요.");
      return;
    }

    setEmployeeId(matched.id);
    setEmployeeError("");
    window.sessionStorage.setItem("workboardEmployeeName", matched.name);
    window.sessionStorage.setItem("workboardEmployeeId", matched.id);
  }, [employees]);

  useEffect(() => {
    if (!employeeId) return;

    if (isDevelopment) {
      let records: DevelopmentAttendanceRecord[] = [];
      try {
        records = JSON.parse(
          window.localStorage.getItem(DEVELOPMENT_RECORDS_KEY) ?? "[]",
        ) as DevelopmentAttendanceRecord[];
      } catch {
        records = [];
      }
      const todayRecords = getTodayDevelopmentRecords(records);
      const hasCheckedIn = todayRecords.some(
        (record) => record.type === "IN",
      );
      const hasCheckedOut = todayRecords.some(
        (record) => record.type === "OUT",
      );
      const checkoutRecord =
        [...todayRecords].reverse().find((record) => record.type === "OUT") ??
        null;
      const completed = hasCheckedIn && hasCheckedOut;
      setAttendanceStatus({
        loading: false,
        checkedIn: hasCheckedIn && !hasCheckedOut,
        completed,
        nextAction: completed ? null : hasCheckedIn ? "OUT" : "IN",
        checkoutAt: checkoutRecord?.timestamp ?? null,
        cancelExpiresAt: checkoutRecord
          ? new Date(
              new Date(checkoutRecord.timestamp).getTime() +
                CHECKOUT_CANCEL_WINDOW_MS,
            ).toISOString()
          : null,
      });
      return;
    }

    let cancelled = false;

    async function loadAttendanceStatus() {
      setAttendanceStatus((current) => ({ ...current, loading: true }));
      try {
        const params = new URLSearchParams({ latest: "1" });
        const response = await fetch(`/api/attendance?${params}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (cancelled) return;

        setAttendanceStatus({
          loading: false,
          checkedIn: Boolean(data.checkedIn),
          completed: Boolean(data.completed),
          nextAction:
            data.nextAction === "OUT"
              ? "OUT"
              : data.nextAction === "IN"
                ? "IN"
                : null,
          checkoutAt:
            typeof data.checkoutAt === "string" ? data.checkoutAt : null,
          cancelExpiresAt:
            typeof data.cancelExpiresAt === "string"
              ? data.cancelExpiresAt
              : null,
        });
      } catch {
        if (cancelled) return;
        setAttendanceStatus({
          loading: false,
          checkedIn: false,
          completed: false,
          nextAction: "IN",
          checkoutAt: null,
          cancelExpiresAt: null,
        });
      }
    }

    void loadAttendanceStatus();

    return () => {
      cancelled = true;
    };
  }, [employeeId, isDevelopment]);

  useEffect(() => {
    if (!employeeId) return;

    if (isDevelopment) {
      setLocationConsentStatus(
        window.localStorage.getItem(DEVELOPMENT_LOCATION_CONSENT_KEY) === "granted"
          ? "granted"
          : "required",
      );
      return;
    }

    let cancelled = false;
    fetch("/api/location-consent", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { consented?: boolean };
        if (!response.ok) throw new Error();
        return Boolean(data.consented);
      })
      .then((consented) => {
        if (!cancelled) setLocationConsentStatus(consented ? "granted" : "required");
      })
      .catch(() => {
        if (!cancelled) setLocationConsentStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId, isDevelopment]);

  useEffect(() => {
    if (!attendanceStatus.completed || !attendanceStatus.cancelExpiresAt) {
      return;
    }

    setCancelClock(Date.now());
    const timer = window.setInterval(() => {
      setCancelClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [attendanceStatus.cancelExpiresAt, attendanceStatus.completed]);

  async function submit(type: "IN" | "OUT") {
    setResult(null);
    setActionMessage("");

    if (!employeeId) {
      setResult({
        ok: false,
        message:
          employeeError ||
          "워크보드 로그인 사용자와 연결된 직원을 찾지 못했습니다.",
      });
      return;
    }

    setSubmitting(true);

    try {
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (locationConsentStatus === "granted" && geo.status === "ready") {
        latitude = geo.lat;
        longitude = geo.lng;
      } else if (locationConsentStatus === "granted") {
        if (!("geolocation" in navigator)) {
          setGeo({ status: "error", message: "" });
        } else {
          try {
            setGeo({ status: "loading" });
            const position = await getCurrentPosition();

            latitude = position.coords.latitude;
            longitude = position.coords.longitude;

            setGeo({
              status: "ready",
              lat: latitude,
              lng: longitude,
              accuracy: position.coords.accuracy,
            });
          } catch {
            setGeo({
              status: "error",
              message: "",
            });
          }
        }
      }

      if (isDevelopment) {
        const timestamp = new Date();
        const storedRecords = JSON.parse(
          window.localStorage.getItem(DEVELOPMENT_RECORDS_KEY) ?? "[]",
        ) as DevelopmentAttendanceRecord[];
        storedRecords.push({
          type,
          timestamp: timestamp.toISOString(),
        });
        window.localStorage.setItem(
          DEVELOPMENT_RECORDS_KEY,
          JSON.stringify(storedRecords.slice(-100)),
        );
        setResult({
          ok: true,
          type,
          time: timestamp.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        });
        setAttendanceStatus({
          loading: false,
          checkedIn: type === "IN",
          completed: type === "OUT",
          nextAction: type === "IN" ? "OUT" : "IN",
          checkoutAt: type === "OUT" ? timestamp.toISOString() : null,
          cancelExpiresAt:
            type === "OUT"
              ? new Date(
                  timestamp.getTime() + CHECKOUT_CANCEL_WINDOW_MS,
                ).toISOString()
              : null,
        });
        setStatusRefreshKey((current) => current + 1);
        return;
      }

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          latitude,
          longitude,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        const recordedType: "IN" | "OUT" =
          data.record.type === "OUT" ? "OUT" : "IN";
        setResult({
          ok: true,
          type: recordedType,
          time: new Date(data.record.timestamp).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        });
        setAttendanceStatus({
          loading: false,
          checkedIn: recordedType === "IN",
          completed: recordedType === "OUT",
          nextAction: recordedType === "IN" ? "OUT" : null,
          checkoutAt:
            recordedType === "OUT" ? data.record.timestamp : null,
          cancelExpiresAt:
            recordedType === "OUT" &&
            typeof data.cancelExpiresAt === "string"
              ? data.cancelExpiresAt
              : null,
        });
        setStatusRefreshKey((current) => current + 1);
      } else {
        setResult({
          ok: false,
          message: data.error ?? "처리에 실패했습니다.",
        });
      }
    } catch {
      setResult({
        ok: false,
        message: "출퇴근을 기록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function agreeToLocationCollection() {
    setAgreeingLocationConsent(true);
    try {
      if (isDevelopment) {
        window.localStorage.setItem(DEVELOPMENT_LOCATION_CONSENT_KEY, "granted");
        setLocationConsentStatus("granted");
        return;
      }

      const response = await fetch("/api/location-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreed: true }),
      });
      if (!response.ok) throw new Error();
      setLocationConsentStatus("granted");
    } catch {
      setLocationConsentStatus("error");
    } finally {
      setAgreeingLocationConsent(false);
    }
  }

  async function cancelCheckout() {
    setResult(null);
    setActionMessage("");

    if (!employeeId) {
      setResult({
        ok: false,
        message: "워크보드 로그인 사용자 정보를 확인하지 못했습니다.",
      });
      return;
    }

    setSubmitting(true);

    try {
      if (isDevelopment) {
        const now = new Date();
        const storedRecords = JSON.parse(
          window.localStorage.getItem(DEVELOPMENT_RECORDS_KEY) ?? "[]",
        ) as DevelopmentAttendanceRecord[];
        const today = kstDateKey(now);
        let checkoutIndex = -1;

        for (let index = storedRecords.length - 1; index >= 0; index -= 1) {
          const record = storedRecords[index];
          if (
            record.type === "OUT" &&
            !record.cancelledAt &&
            kstDateKey(new Date(record.timestamp)) === today
          ) {
            checkoutIndex = index;
            break;
          }
        }

        if (checkoutIndex < 0) {
          setResult({ ok: false, message: "취소할 퇴근 기록이 없습니다." });
          return;
        }

        const checkout = storedRecords[checkoutIndex];
        const elapsed = now.getTime() - new Date(checkout.timestamp).getTime();
        if (elapsed < 0 || elapsed > CHECKOUT_CANCEL_WINDOW_MS) {
          setResult({
            ok: false,
            message: "퇴근 후 30분 이내에만 취소할 수 있습니다.",
          });
          return;
        }

        storedRecords[checkoutIndex] = {
          ...checkout,
          cancelledAt: now.toISOString(),
          cancelNote: "EMPLOYEE_UNDO_WITHIN_30_MINUTES",
        };
        window.localStorage.setItem(
          DEVELOPMENT_RECORDS_KEY,
          JSON.stringify(storedRecords.slice(-100)),
        );
      } else {
        const response = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CANCEL_OUT",
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          setResult({
            ok: false,
            message: data.error ?? "퇴근 취소에 실패했습니다.",
          });
          return;
        }
      }

      setAttendanceStatus({
        loading: false,
        checkedIn: true,
        completed: false,
        nextAction: "OUT",
        checkoutAt: null,
        cancelExpiresAt: null,
      });
      setActionMessage(
        "퇴근 취소가 완료되었습니다. 기존 출근시간부터 다시 근무 중입니다.",
      );
      setStatusRefreshKey((current) => current + 1);
    } catch {
      setResult({
        ok: false,
        message: "퇴근 취소 처리 중 문제가 발생했습니다.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const currentEmployee =
    employees.find((employee) => employee.id === employeeId) ?? null;
  const canCheckIn =
    !submitting &&
    !!employeeId;
  const canCheckOut =
    !submitting &&
    !!employeeId;
  const cancelRemainingMs = attendanceStatus.cancelExpiresAt
    ? Math.max(
        0,
        new Date(attendanceStatus.cancelExpiresAt).getTime() - cancelClock,
      )
    : 0;
  const canCancelCheckout =
    !attendanceStatus.loading &&
    !submitting &&
    attendanceStatus.completed &&
    cancelRemainingMs > 0;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">출퇴근</h1>
        <p className="mt-2 text-sm text-slate-500">
          출근과 퇴근을 등록하고 오늘의 근무 현황을 확인합니다.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-600">로그인 사용자</span>
        <div className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-800">
            {currentEmployee
              ? `${currentEmployee.name} (${currentEmployee.code})`
              : isDevelopment
                ? DEVELOPMENT_EMPLOYEE.name
                : "사용자 정보 없음"}
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

      <CurrentWorkStatus refreshKey={statusRefreshKey} />

      {locationConsentStatus === "required" && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-slate-700">
          <h2 className="font-bold text-slate-900">출퇴근 위치 기록 안내</h2>
          <p className="mt-1 leading-6">
            출퇴근 등록 시 현재 위치를 1회 기록합니다. 위치정보는 출장기록부와 연동됩니다.
          </p>
          <button
            type="button"
            onClick={() => void agreeToLocationCollection()}
            disabled={agreeingLocationConsent}
            className="mt-3 w-full rounded-lg bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {agreeingLocationConsent ? "처리 중..." : "동의하고 위치 기록하기"}
          </button>
        </section>
      )}

      {locationConsentStatus === "granted" && (
        <p className="text-center text-xs text-slate-400">
          출퇴근 시 현재 위치를 기록합니다. 위치정보는 출장기록부와 연동됩니다.
        </p>
      )}

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
      <div className="text-center text-sm font-medium text-slate-500">
        {attendanceStatus.loading
          ? "오늘 출퇴근 상태를 확인하고 있습니다."
          : "출근 또는 퇴근 버튼을 눌러 기록할 수 있습니다."}
      </div>

      {canCancelCheckout && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center">
          <button
            type="button"
            onClick={cancelCheckout}
            disabled={submitting}
            data-testid="cancel-checkout-button"
            className="w-full rounded-lg border border-amber-400 bg-white px-4 py-3 font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            퇴근 취소
            <span className="ml-2 font-mono tabular-nums">
              {formatCancelRemaining(cancelRemainingMs)}
            </span>
          </button>
          <p className="mt-2 text-xs font-medium text-amber-700">
            퇴근 등록 후 30분 이내에만 취소할 수 있습니다.
          </p>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
          {actionMessage}
        </div>
      )}

      {result &&
        (result.ok ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center shadow-sm">
            <div className="text-xl font-bold text-emerald-700">
              {result.type === "IN"
                ? "출근등록이 되었습니다."
                : "퇴근등록이 되었습니다."}
            </div>
            <div className="mt-2 text-3xl font-bold text-slate-900">
              {result.time}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              {result.type === "IN" ? "출근시간" : "퇴근시간"}
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">
            {result.message}
          </div>
        ))}

      <section className="mt-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">출퇴근 관리</h2>
          <p className="mt-1 text-sm text-slate-500">
            오늘 근무시간과 출퇴근 기록을 확인할 수 있습니다.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Link
            href="/records"
            className="rounded-xl border border-slate-300 bg-white px-6 py-4 text-center font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            출퇴근 기록부
          </Link>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-300 bg-white px-6 py-4 text-center font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            관리자 · 기록 보기
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function CheckPage() {
  return <CheckPageContent />;
}
