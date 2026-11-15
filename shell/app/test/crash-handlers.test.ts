import { describe, expect, it } from "bun:test";
import { join } from "node:path";

/**
 * A crash is the last line a supervised child writes, and the one most likely
 * to be read against the wrong process. No logger can be relied on by then, so
 * the crash handlers label the line themselves with the process's role.
 */

const FIXTURE = join(import.meta.dir, "fixtures", "crash-in-child.ts");

async function crash(
  role: string,
  kind: "throw" | "reject",
): Promise<{ exitCode: number; stderr: string }> {
  const child = Bun.spawn(["bun", FIXTURE, role, kind], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  return { exitCode: await child.exited, stderr };
}

describe("crash handlers in a supervised child", () => {
  it("label an uncaught exception with the child's role", async () => {
    const { exitCode, stderr } = await crash("worker", "throw");
    expect(exitCode).toBe(1);
    expect(stderr).toStartWith("[worker] ❌ brain crashed:");
  });

  it("label an unhandled rejection with the child's role", async () => {
    const { exitCode, stderr } = await crash("web", "reject");
    expect(exitCode).toBe(1);
    expect(stderr).toStartWith("[web] ❌ brain unhandled rejection:");
  });
});
