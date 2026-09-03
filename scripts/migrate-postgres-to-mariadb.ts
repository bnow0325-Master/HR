import "dotenv/config";
import { createHash } from "node:crypto";
import mariadb, { type Connection } from "mariadb";
import pg from "pg";
import { mariaDbConfigFromUrl } from "../src/lib/mariaDbConfig";

type Row = Record<string, unknown>;

type TableSpec = {
  name: string;
  columns: readonly string[];
  booleanColumns?: readonly string[];
  dateColumns?: readonly string[];
  dateOnlyColumns?: readonly string[];
  redactColumns?: readonly string[];
};

const TABLES: readonly TableSpec[] = [
  {
    name: "Employee",
    columns: [
      "id", "code", "name", "department", "position", "email",
      "externalLoginId", "phone", "personalEmail", "homeAddress",
      "emergencyContactPhone", "profilePhotoData", "profilePhotoMimeType",
      "profilePhotoUpdatedAt", "hireDate", "terminationDate",
      "workMinutesPerDay", "systemRole", "attendanceEnabled", "leaveEnabled",
      "workboardEnabled", "pinHash", "active", "createdAt", "updatedAt",
    ],
    booleanColumns: [
      "attendanceEnabled", "leaveEnabled", "workboardEnabled", "active",
    ],
    dateColumns: [
      "profilePhotoUpdatedAt", "hireDate", "terminationDate", "createdAt",
      "updatedAt",
    ],
  },
  {
    name: "NaverWorksDailyRecord",
    columns: [
      "id", "employeeId", "baseDate", "workStyle", "workType", "schedule",
      "checkInAt", "checkOutAt", "checkInRaw", "checkOutRaw", "workLocation",
      "breakMinutes", "offsiteMinutes", "absenceMinutes", "late", "earlyLeave",
      "requiredWorkCompliant", "scheduleCompliant", "scheduleVariance",
      "sourceLoginId", "sourceRow", "importedAt", "updatedAt",
    ],
    booleanColumns: ["late", "earlyLeave"],
    dateColumns: ["checkInAt", "checkOutAt", "importedAt", "updatedAt"],
    dateOnlyColumns: ["baseDate"],
  },
  {
    name: "AttendanceRecord",
    columns: [
      "id", "employeeId", "type", "timestamp", "method", "verified",
      "latitude", "longitude", "note", "cancelledAt", "cancelNote", "createdAt",
    ],
    booleanColumns: ["verified"],
    dateColumns: ["timestamp", "cancelledAt", "createdAt"],
    // 과거 주소 문자열은 새 HR DB로 옮기지 않고 좌표만 보존한다.
    redactColumns: ["note"],
  },
  {
    name: "LeaveRequest",
    columns: [
      "id", "employeeId", "leaveType", "leaveDate", "unitsMinutes", "reason",
      "status", "reviewerNote", "reviewedAt", "createdAt", "updatedAt",
    ],
    dateColumns: ["leaveDate", "reviewedAt", "createdAt", "updatedAt"],
  },
  {
    name: "BusinessTrip",
    columns: [
      "id", "employeeId", "startDate", "endDate", "reason", "status",
      "createdAt", "updatedAt",
    ],
    dateColumns: ["startDate", "endDate", "createdAt", "updatedAt"],
  },
] as const;

function quotedPostgresIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quotedMariaDbIdentifier(value: string) {
  return `\`${value.replaceAll("`", "``")}\``;
}

function transformedRow(spec: TableSpec, row: Row): Row {
  const result: Row = {};
  for (const column of spec.columns) {
    const value = spec.redactColumns?.includes(column) ? null : row[column];
    if (value === null || value === undefined) {
      result[column] = null;
    } else if (spec.booleanColumns?.includes(column)) {
      result[column] = Boolean(value);
    } else if (spec.dateOnlyColumns?.includes(column)) {
      result[column] = value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
    } else if (spec.dateColumns?.includes(column)) {
      const date = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(date.getTime())) {
        throw new Error(`${spec.name}.${column} contains an invalid date.`);
      }
      result[column] = date;
    } else {
      result[column] = value;
    }
  }
  return result;
}

function insertValue(spec: TableSpec, column: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (spec.booleanColumns?.includes(column)) return value ? 1 : 0;
  return value;
}

function canonicalValue(spec: TableSpec, column: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (spec.booleanColumns?.includes(column)) return Boolean(value);
  if (spec.dateOnlyColumns?.includes(column)) {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  }
  if (spec.dateColumns?.includes(column)) {
    return (value instanceof Date ? value : new Date(String(value))).toISOString();
  }
  if (Buffer.isBuffer(value)) return value.toString("base64");
  return value;
}

function digestRows(spec: TableSpec, rows: Row[]) {
  const hash = createHash("sha256");
  for (const row of rows) {
    const canonical = spec.columns.map((column) =>
      canonicalValue(spec, column, row[column]),
    );
    hash.update(JSON.stringify(canonical));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function readPostgresRows(client: pg.Client, spec: TableSpec) {
  const columns = spec.columns.map(quotedPostgresIdentifier).join(", ");
  const table = quotedPostgresIdentifier(spec.name);
  const result = await client.query<Row>(
    `SELECT ${columns} FROM ${table} ORDER BY "id" ASC`,
  );
  return result.rows.map((row) => transformedRow(spec, row));
}

async function readMariaDbRows(connection: Connection, spec: TableSpec) {
  const columns = spec.columns.map(quotedMariaDbIdentifier).join(", ");
  const table = quotedMariaDbIdentifier(spec.name);
  const rows = await connection.query<Row[]>(
    `SELECT ${columns} FROM ${table} ORDER BY \`id\` ASC`,
  );
  return rows.map((row) => transformedRow(spec, row));
}

async function assertTargetIsEmpty(connection: Connection) {
  for (const spec of TABLES) {
    const rows = await connection.query<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM ${quotedMariaDbIdentifier(spec.name)}`,
    );
    if (Number(rows[0]?.count ?? 0) !== 0) {
      throw new Error(`Target table ${spec.name} must be empty before migration.`);
    }
  }
}

async function insertRows(
  connection: Connection,
  spec: TableSpec,
  rows: Row[],
) {
  if (rows.length === 0) return;

  const table = quotedMariaDbIdentifier(spec.name);
  const columns = spec.columns.map(quotedMariaDbIdentifier).join(", ");
  const placeholders = spec.columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

  for (const row of rows) {
    await connection.query(
      sql,
      spec.columns.map((column) => insertValue(spec, column, row[column])),
    );
  }
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!sourceUrl || !sourceUrl.startsWith("postgresql://")) {
    throw new Error("SOURCE_DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (!targetUrl || sourceUrl === targetUrl) {
    throw new Error("DATABASE_URL must identify a separate MariaDB target.");
  }

  const source = new pg.Client({ connectionString: sourceUrl });
  const target = await mariadb.createConnection({
    ...mariaDbConfigFromUrl(targetUrl),
    bigIntAsNumber: true,
  });

  try {
    await source.connect();
    await assertTargetIsEmpty(target);

    const sourceRows = new Map<string, Row[]>();
    for (const spec of TABLES) {
      sourceRows.set(spec.name, await readPostgresRows(source, spec));
    }

    await target.beginTransaction();
    try {
      for (const spec of TABLES) {
        await insertRows(target, spec, sourceRows.get(spec.name) ?? []);
      }
      await target.commit();
    } catch (error) {
      await target.rollback();
      throw error;
    }

    for (const spec of TABLES) {
      const expected = sourceRows.get(spec.name) ?? [];
      const actual = await readMariaDbRows(target, spec);
      const expectedDigest = digestRows(spec, expected);
      const actualDigest = digestRows(spec, actual);
      if (expected.length !== actual.length || expectedDigest !== actualDigest) {
        throw new Error(`${spec.name} failed count or checksum verification.`);
      }
      console.log(
        `${spec.name}: ${actual.length} rows verified (${actualDigest.slice(0, 12)})`,
      );
    }

    console.log("PostgreSQL to MariaDB migration verified successfully.");
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exit(1);
});
