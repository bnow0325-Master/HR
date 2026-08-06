import "server-only";

import sql, { type config as SqlConfig } from "mssql";

const REQUIRED_ENV = [
  "LIVECARE_DB_HOST",
  "LIVECARE_DB_NAME",
  "LIVECARE_DB_USER",
  "LIVECARE_DB_PASSWORD",
] as const;

type RequiredEnvName = (typeof REQUIRED_ENV)[number];

type GlobalWithLivecarePool = typeof globalThis & {
  livecareSqlPool?: Promise<sql.ConnectionPool>;
};

type LatestMonthRow = {
  latestMonth: string | null;
};

type EmployeeRow = {
  id: number;
  code: string;
  name: string;
  department: string | null;
  loginId: string | null;
  active: boolean;
  hiredOn: string | null;
  resignedOn: string | null;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  recordCount: number;
  baseYear: number | null;
  grantedDays: number | null;
  usedDays: number | null;
  adjustedDays: number | null;
  remainingDays: number | null;
};

type AttendanceRow = {
  employeeId: number;
  code: string;
  name: string;
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  eventCount: number;
  workMinutes: number | null;
};

export type LivecareEmployee = EmployeeRow;
export type LivecareAttendanceDay = AttendanceRow;

export type LivecareAttendanceDashboard = {
  month: string;
  latestMonth: string | null;
  employees: LivecareEmployee[];
  attendanceDays: LivecareAttendanceDay[];
};

function requiredEnv(name: RequiredEnvName) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined) {
  const port = Number(value ?? "1433");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("LIVECARE_DB_PORT must be a valid TCP port.");
  }
  return port;
}

function createPool() {
  const config: SqlConfig = {
    server: requiredEnv("LIVECARE_DB_HOST"),
    port: parsePort(process.env.LIVECARE_DB_PORT),
    database: requiredEnv("LIVECARE_DB_NAME"),
    user: requiredEnv("LIVECARE_DB_USER"),
    password: requiredEnv("LIVECARE_DB_PASSWORD"),
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
    options: {
      encrypt: process.env.LIVECARE_DB_ENCRYPT === "true",
      trustServerCertificate:
        process.env.LIVECARE_DB_TRUST_CERTIFICATE !== "false",
    },
    connectionTimeout: 10_000,
    requestTimeout: 15_000,
  };

  return new sql.ConnectionPool(config).connect();
}

async function getPool() {
  const globalForPool = globalThis as GlobalWithLivecarePool;
  globalForPool.livecareSqlPool ??= createPool();

  try {
    return await globalForPool.livecareSqlPool;
  } catch (error) {
    globalForPool.livecareSqlPool = undefined;
    throw error;
  }
}

function validMonth(value: string | undefined) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
}

export function livecareSqlConfigured() {
  return REQUIRED_ENV.every((name) => Boolean(process.env[name]?.trim()));
}

async function getLatestMonth(pool: sql.ConnectionPool) {
  const result = await pool.request().query<LatestMonthRow>(`
    SELECT CONVERT(char(7), MAX(RECORDED_AT), 120) AS latestMonth
    FROM dbo.CHECKINOUT_ATTENDANCE_RECORD;
  `);

  return result.recordset[0]?.latestMonth ?? null;
}

async function getEmployees(pool: sql.ConnectionPool) {
  const result = await pool.request().query<EmployeeRow>(`
    SELECT
      e.CHECKINOUT_EMPLOYEE_ID AS id,
      e.EMPLOYEE_CODE AS code,
      e.EMPLOYEE_NAME AS name,
      e.DEPARTMENT_NAME AS department,
      e.LOGIN_ID AS loginId,
      e.IS_ACTIVE AS active,
      CONVERT(char(10), e.HIRED_ON, 23) AS hiredOn,
      CONVERT(char(10), e.RESIGNED_ON, 23) AS resignedOn,
      attendance.firstRecordedAt,
      attendance.lastRecordedAt,
      ISNULL(attendance.recordCount, 0) AS recordCount,
      leaveBalance.BASE_YEAR AS baseYear,
      leaveBalance.GRANTED_DAYS AS grantedDays,
      leaveBalance.USED_DAYS AS usedDays,
      leaveBalance.ADJUSTED_DAYS AS adjustedDays,
      CASE
        WHEN leaveBalance.CHECKINOUT_LEAVE_BALANCE_ID IS NULL THEN NULL
        ELSE leaveBalance.GRANTED_DAYS + leaveBalance.ADJUSTED_DAYS - leaveBalance.USED_DAYS
      END AS remainingDays
    FROM dbo.CHECKINOUT_EMPLOYEE e
    OUTER APPLY (
      SELECT
        CONVERT(char(19), MIN(ar.RECORDED_AT), 120) AS firstRecordedAt,
        CONVERT(char(19), MAX(ar.RECORDED_AT), 120) AS lastRecordedAt,
        COUNT(*) AS recordCount
      FROM dbo.CHECKINOUT_ATTENDANCE_RECORD ar
      WHERE ar.CHECKINOUT_EMPLOYEE_ID = e.CHECKINOUT_EMPLOYEE_ID
    ) attendance
    OUTER APPLY (
      SELECT TOP (1)
        lb.CHECKINOUT_LEAVE_BALANCE_ID,
        lb.BASE_YEAR,
        lb.GRANTED_DAYS,
        lb.USED_DAYS,
        lb.ADJUSTED_DAYS
      FROM dbo.CHECKINOUT_ANNUAL_LEAVE_BALANCE lb
      WHERE lb.CHECKINOUT_EMPLOYEE_ID = e.CHECKINOUT_EMPLOYEE_ID
      ORDER BY lb.BASE_YEAR DESC, lb.UPDATED_AT DESC
    ) leaveBalance
    ORDER BY e.IS_ACTIVE DESC, e.EMPLOYEE_NAME ASC;
  `);

  return result.recordset;
}

async function getAttendanceDays(
  pool: sql.ConnectionPool,
  month: string,
  employeeCode?: string,
) {
  const request = pool.request().input("month", sql.VarChar(7), month);
  const normalizedCode = employeeCode?.trim();

  if (normalizedCode) {
    request.input("employeeCode", sql.NVarChar(255), normalizedCode);
  }

  const result = await request.query<AttendanceRow>(`
    DECLARE @startDate date = DATEFROMPARTS(
      CONVERT(int, LEFT(@month, 4)),
      CONVERT(int, RIGHT(@month, 2)),
      1
    );
    DECLARE @endDate date = DATEADD(month, 1, @startDate);

    SELECT
      e.CHECKINOUT_EMPLOYEE_ID AS employeeId,
      e.EMPLOYEE_CODE AS code,
      e.EMPLOYEE_NAME AS name,
      CONVERT(char(10), CAST(ar.RECORDED_AT AS date), 23) AS workDate,
      CONVERT(char(8), MIN(CASE WHEN ar.RECORD_TYPE = 'IN' THEN ar.RECORDED_AT END), 108) AS checkIn,
      CONVERT(char(8), MAX(CASE WHEN ar.RECORD_TYPE = 'OUT' THEN ar.RECORDED_AT END), 108) AS checkOut,
      COUNT(*) AS eventCount,
      CASE
        WHEN MIN(CASE WHEN ar.RECORD_TYPE = 'IN' THEN ar.RECORDED_AT END) IS NULL
          OR MAX(CASE WHEN ar.RECORD_TYPE = 'OUT' THEN ar.RECORDED_AT END) IS NULL
        THEN NULL
        ELSE DATEDIFF(
          minute,
          MIN(CASE WHEN ar.RECORD_TYPE = 'IN' THEN ar.RECORDED_AT END),
          MAX(CASE WHEN ar.RECORD_TYPE = 'OUT' THEN ar.RECORDED_AT END)
        )
      END AS workMinutes
    FROM dbo.CHECKINOUT_ATTENDANCE_RECORD ar
    INNER JOIN dbo.CHECKINOUT_EMPLOYEE e
      ON e.CHECKINOUT_EMPLOYEE_ID = ar.CHECKINOUT_EMPLOYEE_ID
    WHERE ar.RECORDED_AT >= @startDate
      AND ar.RECORDED_AT < @endDate
      ${normalizedCode ? "AND e.EMPLOYEE_CODE = @employeeCode" : ""}
    GROUP BY
      e.CHECKINOUT_EMPLOYEE_ID,
      e.EMPLOYEE_CODE,
      e.EMPLOYEE_NAME,
      CAST(ar.RECORDED_AT AS date)
    ORDER BY workDate DESC, e.EMPLOYEE_NAME ASC;
  `);

  return result.recordset;
}

export async function getLivecareAttendanceDashboard(input?: {
  month?: string;
  employeeCode?: string;
}): Promise<LivecareAttendanceDashboard> {
  const pool = await getPool();
  const [latestMonth, employees] = await Promise.all([
    getLatestMonth(pool),
    getEmployees(pool),
  ]);
  const month = validMonth(input?.month) ?? latestMonth ?? "2026-07";
  const attendanceDays = await getAttendanceDays(
    pool,
    month,
    input?.employeeCode,
  );

  return { month, latestMonth, employees, attendanceDays };
}
