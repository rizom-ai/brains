import { expect, it } from "bun:test";
import { join } from "path";
import { runProcess } from "@brains/utils/run-process";

/**
 * Bun hoists every eagerly bundled module's top-level statements into the one
 * module body of brain.js. Once loops in that body run often enough, JSC
 * Baseline-compiles the whole body: for a bundle this size that is ~11 MB of
 * machine code plus its metadata in each Brain process (supervisor, web,
 * worker). Lookup-table loops from Effect's RPC, Schema and HTTP modules once
 * pushed it over, and the import-burst soak's RSS gate caught the ~100 MB.
 * Code with load-time loops belongs behind a dynamic import.
 */
it("loads brain.js without JIT-compiling its module body", async () => {
  const result = await runProcess(
    [
      process.execPath,
      join(import.meta.dir, "..", "dist", "brain.js"),
      "--version",
    ],
    {
      env: {
        ...process.env,
        BUN_JSC_reportBaselineCompileTimes: "1",
        // A short-lived process can exit before a concurrent compile lands.
        BUN_JSC_useConcurrentJIT: "0",
      },
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  expect(result.exitCode).toBe(0);
  // The report is on: without it, an empty module-compile list proves nothing.
  expect(output).toContain("using Baseline");
  const moduleCompiles = output
    .split("\n")
    .filter(
      (line) => line.includes("LLIntModule") && line.includes("brain.js"),
    );
  expect(moduleCompiles).toEqual([]);
  // A fresh process loads the whole bundle with concurrent JIT off: under a
  // full parallel test run it can take longer than the default 5 s.
}, 30_000);
