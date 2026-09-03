import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 설정 파일. 마이그레이션/시드용 연결 URL과 seed 명령을 여기서 관리한다.
// (런타임 연결은 src/lib/prisma.ts의 드라이버 어댑터가 담당)
// DATABASE_URL이 없어도 `prisma generate`는 동작해야 하므로 env() 대신
// process.env를 직접 참조한다(마이그레이션 시에는 값이 반드시 필요).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: "prisma/migrations-mariadb",
    seed: "tsx prisma/seed.ts",
  },
});
