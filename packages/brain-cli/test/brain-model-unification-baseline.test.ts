import { describe, expect, it } from "bun:test";

const scriptPath = new URL(
  "../scripts/brain-model-baseline.ts",
  import.meta.url,
).pathname;

describe("brain model unification baseline", () => {
  it("freezes the alpha.204 model and preset composition before bundle migration", async () => {
    const process = Bun.spawn(["bun", scriptPath], {
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("Brain model baseline matches alpha.204");
  });
});
