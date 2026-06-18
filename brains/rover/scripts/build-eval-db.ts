/**
 * Build pre-populated eval database from eval-content-full.
 *
 * Delegates to `brain-eval --build-db` which reuses the same
 * environment setup, config loading, and App boot as eval runs.
 *
 * Usage: bun brains/rover/scripts/build-eval-db.ts
 *
 * Re-run whenever eval-content-full changes.
 */
import { spawn } from "child_process";

const proc = spawn("bun", ["run", "eval", "--build-db"], {
  cwd: import.meta.dir + "/..",
  stdio: "inherit",
  env: process.env,
});

proc.on("close", (code) => {
  process.exit(code ?? 1);
});
