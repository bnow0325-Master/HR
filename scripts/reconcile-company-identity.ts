import { syncCompanyIdentity } from "../src/lib/companyIdentity";
import { employeeSelect } from "../src/lib/employeeData";
import { prisma } from "../src/lib/prisma";

const BATCH_SIZE = 5;

async function main() {
  const employees = await prisma.employee.findMany({
    orderBy: { code: "asc" },
    select: employeeSelect,
  });
  const results = [];

  for (let offset = 0; offset < employees.length; offset += BATCH_SIZE) {
    const batch = employees.slice(offset, offset + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (employee) => ({
        code: employee.code,
        result: await syncCompanyIdentity(employee),
      })),
    );
    results.push(...batchResults);
  }

  const summary = {
    total: results.length,
    synced: results.filter(({ result }) => result.state === "synced").length,
    disabled: results.filter(({ result }) => result.state === "disabled").length,
    skipped: results.filter(({ result }) => result.state === "skipped").length,
    failed: results.filter(({ result }) => result.state === "failed").length,
  };

  console.log(JSON.stringify({ summary, results }, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
