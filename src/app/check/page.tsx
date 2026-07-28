"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
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
  completed: boolean;
  nextAction: "IN" | "OUT" | null;
};

type DevelopmentAttendanceRecord = {
  type: "IN" | "OUT";
  timestamp: string;
  address: string;
};

const DEVELOPMENT_EMPLOYEE: Employee = {
  id: "development-chu-dong-hyeon",
  code: "DEV",
  name: "추동현",
  department: "개발 사용자",
};

const DEVELOPMENT_RECORDS_KEY = "checkinoutDevelopmentRecords";
const DEVELOPMENT_EMPLOYEES_KEY = "checkinoutDevelopmentEmployees";

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
          part.endsWith("대한민국")
        ),
    );

  const district = parts.find((part) => /(구|군)$/.test(part)) ?? "";
  const neighborhood =
    parts
      .map((part) => {
        const dongMatch = part.match(/^(.*(?:동|읍|면|리))(?:\d+가)?$/);
        if (dongMatch) return dongMatch[1];

        const roadMatch = part.match(/^(.*(?:로|길)).*$/);
        if (roadMatch) return roadMatch[1];

        return "";
      })
      .find(Boolean) ?? "";

  if (district && neighborhood) {
    return `${district} ${neighborhood}`;
  }

  return neighborhood || district || parts.slice(0, 2).join(" ");
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
    (record) => kstDateKey(new Date(record.timestamp)) === today,
  );
}

function CheckPageContent() {
  const searchParams = useSearchParams();
  const isDevelopment = process.env.NODE_ENV === "development";
  const [employees, setEmployees] = useState<Employee[]>(
    isDevelopment ? [DEVELOPMENT_EMPLOYEE] : [],
  );
  const [employeeId, setEmployeeId] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [address, setAddress] = useState<AddressState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [employeeError, setEmployeeError] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>({
    loading: true,
    checkedIn: false,
    completed: false,
    nextAction: "IN",
  });
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);

  const requestedEmployeeName = useMemo(
    () => searchParams.get("name")?.trim() ?? "",
    [searchParams],
  );
  const developmentEmployeeName =
    process.env.NODE_ENV === "development" ? "추동현" : "";
  const effectiveEmployeeName =
    requestedEmployeeName || developmentEmployeeName;

  useEffect(() => {
    if (isDevelopment) {
      setEmployees(loadDevelopmentEmployees());
      return;
    }

    fetch("/api/employees")
      .then((response) => {
        if (!response.ok) {
          throw new Error("직원 목록을 불러오지 못했습니다.");
        }
        return response.json();
      })
      .then((data) => {
        setEmployees((data.employees ?? []) as Employee[]);
      })
      .catch(() => {
        setEmployees([]);
      });
  }, [isDevelopment]);

  useEffect(() => {
    if (employees.length === 0) return;

    if (!effectiveEmployeeName) {
      if (!employeeId) {
        setEmployeeError(
          "워크보드 로그인 사용자 정보가 없어 직원을 자동으로 찾지 못했습니다.",
        );
      }
      return;
    }

    const matched = employees.find(
      (employee) => employee.name.trim() === effectiveEmployeeName,
    );

    if (!matched) {
      setEmployeeError(
        `워크보드 사용자 "${effectiveEmployeeName}" 와 일치하는 직원을 찾지 못했습니다.`,
      );
      return;
    }

    setEmployeeId(matched.id);
    setEmployeeError("");
    window.sessionStorage.setItem("workboardEmployeeName", matched.name);
    window.sessionStorage.setItem("workboardEmployeeId", matched.id);
  }, [effectiveEmployeeName, employeeId, employees]);

  async function resolveAddress(lat: number, lng: number) {
    setAddress({ status: "loading" });
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
      });
      const response = await fetch(`/api/location/address?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.address) {
        setAddress({
          status: "error",
          message: data.error ?? "주소를 가져오지 못했습니다.",
        });
        return "";
      }

      setAddress({ status: "ready", address: data.address });
      return data.address as string;
    } catch {
      setAddress({ status: "error", message: "주소를 가져오지 못했습니다." });
      return "";
    }
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setGeo({
        status: "error",
        message: "이 기기에서는 위치 정보를 사용할 수 없습니다.",
      });
      setAddress({ status: "idle" });
      return;
    }

    setGeo({ status: "loading" });
    setAddress({ status: "idle" });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({
          status: "ready",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        void resolveAddress(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setGeo({
          status: "error",
          message:
            error.code === error.PERMISSION_DENIED
              ? "위치 권한이 거부되었습니다. 브라우저에서 위치 권한을 허용해 주세요."
              : "현재 위치를 가져오지 못했습니다.",
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
      const completed = hasCheckedIn && hasCheckedOut;
      setAttendanceStatus({
        loading: false,
        checkedIn: hasCheckedIn && !hasCheckedOut,
        completed,
        nextAction: completed ? null : hasCheckedIn ? "OUT" : "IN",
      });
      return;
    }

    let cancelled = false;

    async function loadAttendanceStatus() {
      setAttendanceStatus((current) => ({ ...current, loading: true }));
      try {
        const params = new URLSearchParams({
          employeeId,
          latest: "1",
        });
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
        });
      } catch {
        if (cancelled) return;
        setAttendanceStatus({
          loading: false,
          checkedIn: false,
          completed: false,
          nextAction: "IN",
        });
      }
    }

    void loadAttendanceStatus();

    return () => {
      cancelled = true;
    };
  }, [employeeId, isDevelopment]);

  async function submit(type: "IN" | "OUT") {
    setResult(null);

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
      let latitude = 0;
      let longitude = 0;
      let currentAddress = "";

      if (geo.status === "ready") {
        latitude = geo.lat;
        longitude = geo.lng;
        currentAddress = address.status === "ready" ? address.address : "";
      } else {
        if (!("geolocation" in navigator)) {
          if (isDevelopment) {
            currentAddress = "위치 확인 불가";
          } else {
            setResult({
              ok: false,
              message: "이 기기에서는 위치 정보를 사용할 수 없습니다.",
            });
            return;
          }
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

            currentAddress = await resolveAddress(latitude, longitude);
          } catch {
            if (!isDevelopment) {
              throw new Error("location-unavailable");
            }
            setGeo({
              status: "error",
              message:
                "로컬 개발 환경에서 위치를 확인하지 못했지만 출퇴근 기록은 사용할 수 있습니다.",
            });
            setAddress({
              status: "error",
              message: "위치 확인 불가",
            });
            currentAddress = "위치 확인 불가";
          }
        }
      }

      if (isDevelopment) {
        const timestamp = new Date();
        const storedRecords = JSON.parse(
          window.localStorage.getItem(DEVELOPMENT_RECORDS_KEY) ?? "[]",
        ) as DevelopmentAttendanceRecord[];
        const todayRecords = getTodayDevelopmentRecords(
          storedRecords,
          timestamp,
        );
        const hasCheckedIn = todayRecords.some(
          (record) => record.type === "IN",
        );
        const hasCheckedOut = todayRecords.some(
          (record) => record.type === "OUT",
        );

        if (type === "IN" && hasCheckedIn) {
          setResult({
            ok: false,
            message: "오늘 출근이 이미 등록되었습니다.",
          });
          return;
        }
        if (type === "OUT" && !hasCheckedIn) {
          setResult({
            ok: false,
            message: "출근을 먼저 등록해 주세요.",
          });
          return;
        }
        if (type === "OUT" && hasCheckedOut) {
          setResult({
            ok: false,
            message: "오늘 퇴근이 이미 등록되었습니다.",
          });
          return;
        }
        if (hasCheckedOut) {
          setResult({
            ok: false,
            message: "오늘 출퇴근 기록이 이미 완료되었습니다.",
          });
          return;
        }

        storedRecords.push({
          type,
          timestamp: timestamp.toISOString(),
          address: currentAddress,
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
          address: currentAddress
            ? currentAddress === "위치 확인 불가"
              ? currentAddress
              : formatDongAddress(currentAddress)
            : "주소를 확인하지 못했습니다.",
        });
        setAttendanceStatus({
          loading: false,
          checkedIn: type === "IN",
          completed: type === "OUT",
          nextAction: type === "IN" ? "OUT" : null,
        });
        setStatusRefreshKey((current) => current + 1);
        return;
      }

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          type,
          latitude,
          longitude,
          address: currentAddress,
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
          address:
            typeof data.record.address === "string" && data.record.address
              ? formatDongAddress(data.record.address)
              : "주소를 확인하지 못했습니다.",
        });
        setAttendanceStatus({
          loading: false,
          checkedIn: recordedType === "IN",
          completed: recordedType === "OUT",
          nextAction: recordedType === "IN" ? "OUT" : null,
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
        message: "현재 위치를 확인하거나 출퇴근을 기록하지 못했습니다.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const currentEmployee =
    employees.find((employee) => employee.id === employeeId) ?? null;
  const canCheckIn =
    !attendanceStatus.loading &&
    !submitting &&
    !!employeeId &&
    !attendanceStatus.checkedIn &&
    !attendanceStatus.completed &&
    attendanceStatus.nextAction === "IN";
  const canCheckOut =
    !attendanceStatus.loading &&
    !submitting &&
    !!employeeId &&
    attendanceStatus.checkedIn &&
    !attendanceStatus.completed &&
    attendanceStatus.nextAction === "OUT";

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
              : effectiveEmployeeName || "사용자 정보 없음"}
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

      <div className="mt-2 grid grid-cols-2 gap-3">
        <button
          disabled={!canCheckIn}
          onClick={() => submit("IN")}
          className="rounded-xl bg-brand px-6 py-5 text-lg font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
        >
          {attendanceStatus.checkedIn || attendanceStatus.completed
            ? "출근 완료"
            : "출근"}
        </button>
        <button
          disabled={!canCheckOut}
          onClick={() => submit("OUT")}
          className="rounded-xl bg-slate-700 px-6 py-5 text-lg font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {attendanceStatus.completed ? "퇴근 완료" : "퇴근"}
        </button>
      </div>
      <div className="text-center text-sm font-medium text-slate-500">
        {attendanceStatus.loading
          ? "오늘 출퇴근 상태를 확인하고 있습니다."
          : attendanceStatus.completed
            ? "오늘 출근과 퇴근 등록이 완료되었습니다."
            : attendanceStatus.checkedIn
              ? "근무 중입니다. 퇴근할 때 퇴근 버튼을 눌러 주세요."
              : "출근 전입니다. 출근 버튼을 눌러 주세요."}
      </div>

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
            <div className="mt-4 rounded-lg bg-white/80 px-4 py-3 text-left text-sm text-slate-700">
              <div className="font-semibold text-slate-800">현재 접속위치</div>
              <div className="mt-1">{result.address}</div>
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
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-full max-w-md items-center justify-center px-6 py-8 text-sm text-slate-500">
          출퇴근 화면을 불러오는 중입니다.
        </main>
      }
    >
      <CheckPageContent />
    </Suspense>
  );
}
