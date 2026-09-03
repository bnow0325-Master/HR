import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mariaDbConfigFromUrl } from "@/lib/mariaDbConfig";

// Prisma 7: 런타임 DB 연결은 공식 MariaDB 드라이버 어댑터로 한다.
// 개발 중 hot-reload로 인한 커넥션 누수를 막기 위해 전역에 캐싱한다.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const adapter = new PrismaMariaDb(
    mariaDbConfigFromUrl(process.env.DATABASE_URL),
  );
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
