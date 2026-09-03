import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hashPin } from "../src/lib/pin";
import { mariaDbConfigFromUrl } from "../src/lib/mariaDbConfig";

const adapter = new PrismaMariaDb(
  mariaDbConfigFromUrl(process.env.DATABASE_URL),
);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 데모용 직원 + 기본 PIN. 실제 운영 시에는 각자 PIN을 변경하세요.
  const employees = [
    { code: "1001", name: "김철수", department: "개발팀", pin: "1234" },
    { code: "1002", name: "이영희", department: "디자인팀", pin: "5678" },
    { code: "1003", name: "박민수", department: "영업팀", pin: "9012" },
  ];

  for (const e of employees) {
    await prisma.employee.upsert({
      where: { code: e.code },
      update: { pinHash: hashPin(e.pin) },
      create: {
        code: e.code,
        name: e.name,
        department: e.department,
        pinHash: hashPin(e.pin),
      },
    });
  }

  console.log(`Seeded ${employees.length} employees (with PINs).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
