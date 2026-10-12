import { expect, it } from "bun:test";
import { join } from "node:path";

// The AIService unit suite mocks SDK exports process-wide. Verify the actual
// OpenAI HTTP request in an isolated process, with only fetch replaced.
it("preserves explicit reasoning effort on the actual OpenAI wire", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      join(import.meta.dir, "openai-reasoning.check.ts"),
    ],
    { stdout: "pipe", stderr: "pipe", signal: AbortSignal.timeout(8000) },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
  expect(`${stdout}\n${stderr}`).not.toContain("AI SDK Warning (");
}, 10000);
