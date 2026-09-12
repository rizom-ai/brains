import { expect, it } from "bun:test";
import { join } from "node:path";

// aiService.test.ts replaces provider modules process-wide. These checks must
// exercise the real SDK, not inherit that mock. Keep them in the normal suite,
// but execute their explicit fixture in a fresh process (all fetches mocked).
it("verifies the guest profile against the actual SDK in isolation", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      join(import.meta.dir, "openai-guest-profile.check.ts"),
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
