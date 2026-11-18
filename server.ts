/**
 * CBE Hub Server Entry Point
 *
 * Supports execution under:
 * 1. Cloud Run production (`node server.ts` via "npm start")
 * 2. Development server (`tsx server.ts` via "npm run dev")
 * 3. Container runtimes with any Node 20+ version
 *
 * When started by plain Node without a TypeScript loader, this entry point
 * automatically spawns a child process with `--import tsx` to enable seamless
 * TypeScript compilation and extensionless ESM module resolution.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const isTsxActive =
  process.env.__TSX_BOOTSTRAPPED__ === "1" ||
  "tsx" in process.versions ||
  process.execArgv.some((arg) => arg.includes("tsx"));

if (!isTsxActive) {
  const currentFilePath = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, ["--import", "tsx", currentFilePath, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, __TSX_BOOTSTRAPPED__: "1" },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    }
    process.exit(code ?? 0);
  });
} else {
  // TSX loader is active; load the full application server
  await import("./server.app.ts");
}
