import { expect, it } from "bun:test";
import { join } from "node:path";

// aiService.test.ts mocks SDK exports process-wide. Exercise the real SDK with
// mock providers in a fresh process, regardless of suite discovery order.
it("verifies guest model boundaries against the actual SDK in isolation", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      join(import.meta.dir, "guest-model-boundary.check.ts"),
    ],
    { stdout: "pipe", stderr: "pipe", signal: AbortSignal.timeout(8000) },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 10000);
