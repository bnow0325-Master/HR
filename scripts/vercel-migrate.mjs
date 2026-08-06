import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping database migrations outside Vercel production.");
  process.exit(0);
}

const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const migration = spawnSync(
  process.execPath,
  [prismaCli, "migrate", "deploy"],
  { stdio: "inherit" },
);

if (migration.error) throw migration.error;
process.exit(migration.status ?? 1);
