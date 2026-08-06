import { hashPin } from "@/lib/pin";

type EmployeeRecord = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  pinHash: string | null;
  active: boolean;
  createdAt: Date;
};

type AttendanceRecord = {
  id: string;
  employeeId: string;
  type: string;
  timestamp: Date;
  method: string;
  verified: boolean;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  createdAt: Date;
};

type MemoryStore = {
  employees: EmployeeRecord[];
  attendanceRecords: AttendanceRecord[];
};

type CreateAttendanceData = {
  employeeId: string;
  type: string;
  method: string;
  verified: boolean;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
};

const globalForPrisma = globalThis as typeof globalThis & {
  __checkinoutMemoryStore?: MemoryStore;
  prisma?: unknown;
};

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function seededStore(): MemoryStore {
  const now = new Date();

  return {
    employees: [
      {
        id: "emp_1001",
        code: "1001",
        name: "김철수",
        department: "개발팀",
        pinHash: hashPin("1234"),
        active: true,
        createdAt: now,
      },
      {
        id: "emp_1002",
        code: "1002",
        name: "이영희",
        department: "디자인팀",
        pinHash: hashPin("5678"),
        active: true,
        createdAt: now,
      },
    ],
    attendanceRecords: [],
  };
}

function memoryStore() {
  if (!globalForPrisma.__checkinoutMemoryStore) {
    globalForPrisma.__checkinoutMemoryStore = seededStore();
  }
  return globalForPrisma.__checkinoutMemoryStore;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function pickFields<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, boolean>,
) {
  if (!select) return clone(row);

  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) picked[key] = row[key];
  }
  return picked;
}

function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>,
) {
  if (!orderBy) return rows;

  const sorts = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const item of sorts) {
      const [key, dir] = Object.entries(item)[0] ?? [];
      if (!key || !dir) continue;
      const av = a[key];
      const bv = b[key];
      if (av === bv) continue;
      const compare = av instanceof Date && bv instanceof Date
        ? av.getTime() - bv.getTime()
        : String(av).localeCompare(String(bv), "ko");
      if (compare !== 0) return dir === "asc" ? compare : -compare;
    }
    return 0;
  });
}

function matchWhere<T extends Record<string, unknown>>(
  row: T,
  where?: Record<string, unknown>,
) {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    const current = row[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const condition = value as Record<string, unknown>;
      if ("in" in condition) {
        if (!Array.isArray(condition.in) || !condition.in.includes(current)) {
          return false;
        }
        continue;
      }
      if ("gte" in condition || "lte" in condition || "lt" in condition) {
        const currentTime =
          current instanceof Date ? current.getTime() : Number(current);
        if (
          ("gte" in condition &&
            currentTime <
              ((condition.gte as Date | number) instanceof Date
                ? (condition.gte as Date).getTime()
                : Number(condition.gte))) ||
          ("lte" in condition &&
            currentTime >
              ((condition.lte as Date | number) instanceof Date
                ? (condition.lte as Date).getTime()
                : Number(condition.lte))) ||
          ("lt" in condition &&
            currentTime >=
              ((condition.lt as Date | number) instanceof Date
                ? (condition.lt as Date).getTime()
                : Number(condition.lt)))
        ) {
          return false;
        }
        continue;
      }
    }

    if (current !== value) return false;
  }

  return true;
}

function createMemoryPrisma() {
  const store = memoryStore();

  return {
    employee: {
      async findMany(args: {
        where?: Record<string, unknown>;
        select?: Record<string, boolean>;
        orderBy?: Record<string, "asc" | "desc">;
      } = {}) {
        const rows = sortRows(
          store.employees.filter((row) => matchWhere(row, args.where)),
          args.orderBy,
        );
        return rows.map((row) => pickFields(row, args.select));
      },
      async findUnique(args: {
        where: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) {
        const row =
          store.employees.find((employee) => matchWhere(employee, args.where)) ?? null;
        return row ? pickFields(row, args.select) : null;
      },
      async create(args: {
        data: {
          code: string;
          name: string;
          department?: string | null;
          pinHash?: string | null;
        };
        select?: Record<string, boolean>;
      }) {
        const row: EmployeeRecord = {
          id: createId("emp"),
          code: args.data.code,
          name: args.data.name,
          department: args.data.department ?? null,
          pinHash: args.data.pinHash ?? null,
          active: true,
          createdAt: new Date(),
        };
        store.employees.push(row);
        return pickFields(row, args.select);
      },
      async update(args: {
        where: Record<string, unknown>;
        data: Partial<EmployeeRecord>;
        select?: Record<string, boolean>;
      }) {
        const row = store.employees.find((employee) =>
          matchWhere(employee, args.where),
        );
        if (!row) throw new Error("Employee not found");
        Object.assign(row, args.data);
        return pickFields(row, args.select);
      },
    },
    attendanceRecord: {
      async create(args: { data: CreateAttendanceData }) {
        const row: AttendanceRecord = {
          id: createId("att"),
          employeeId: args.data.employeeId,
          type: args.data.type,
          timestamp: new Date(),
          method: args.data.method,
          verified: args.data.verified,
          latitude: args.data.latitude ?? null,
          longitude: args.data.longitude ?? null,
          note: args.data.note ?? null,
          createdAt: new Date(),
        };
        store.attendanceRecords.push(row);
        return clone(row);
      },
      async findMany(args: {
        where?: Record<string, unknown>;
        select?: Record<string, boolean>;
        include?: {
          employee?: { select?: Record<string, boolean> };
        };
        orderBy?:
          | Record<string, "asc" | "desc">
          | Array<Record<string, "asc" | "desc">>;
        take?: number;
      } = {}) {
        let rows = sortRows(
          store.attendanceRecords.filter((row) => matchWhere(row, args.where)),
          args.orderBy,
        );
        if (typeof args.take === "number") {
          rows = rows.slice(0, args.take);
        }

        return rows.map((row) => {
          const base = pickFields(row, args.select) as Record<string, unknown>;
          if (args.include?.employee) {
            const employee = store.employees.find((item) => item.id === row.employeeId);
            base.employee = employee
              ? pickFields(employee, args.include.employee.select)
              : null;
          }
          return base;
        });
      },
    },
  };
}

async function createRealPrisma() {
  const dynamicImport = new Function(
    "modulePath",
    "return import(modulePath)",
  ) as (modulePath: string) => Promise<Record<string, unknown>>;

  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    dynamicImport("@prisma/client") as Promise<{ PrismaClient: new (...args: unknown[]) => { [key: string]: unknown } }>,
    dynamicImport("@prisma/adapter-pg") as Promise<{ PrismaPg: new (...args: unknown[]) => unknown }>,
  ]);

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

async function createPrismaClient() {
  try {
    return await createRealPrisma();
  } catch {
    return createMemoryPrisma();
  }
}

export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const promise =
        (globalForPrisma.prisma as Promise<Record<string, unknown>> | undefined) ??
        createPrismaClient();

      globalForPrisma.prisma = promise;

      return new Proxy(
        {},
        {
          get(_innerTarget, innerProp) {
            return async (...args: unknown[]) => {
              const client = await promise;
              const group = (client as Record<string, Record<string, unknown>>)[
                String(prop)
              ];
              const method = group?.[String(innerProp)];

              if (typeof method !== "function") {
                throw new Error(`Prisma method not available: ${String(prop)}.${String(innerProp)}`);
              }

              return Reflect.apply(method, group, args);
            };
          },
        },
      );
    },
  },
) as {
  employee: {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    findUnique: (...args: unknown[]) => Promise<unknown>;
    create: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
  attendanceRecord: {
    create: (...args: unknown[]) => Promise<AttendanceRecord>;
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  };
};
