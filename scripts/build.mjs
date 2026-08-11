import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const projectRoot = realpathSync.native(process.cwd());

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNodeScript(path.join(projectRoot, "node_modules", "prisma", "build", "index.js"), ["generate"]);
runNodeScript(path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), [
  "build",
  "--webpack",
]);
