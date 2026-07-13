import { describe, expect, it } from "bun:test";

interface ProbeResult {
  invalidBody: string;
  invalidStatus: number;
  validBody: unknown;
  validStatus: number;
}

describe("Slack webhook verification", () => {
  it("accepts valid signatures and rejects invalid signatures", async () => {
    const probePath = new URL(
      "./fixtures/slack-webhook-probe.ts",
      import.meta.url,
    ).pathname;
    const child = Bun.spawn([process.execPath, probePath], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout) as ProbeResult;
    expect(result.invalidStatus).toBe(401);
    expect(result.invalidBody).toBe("Invalid signature");
    expect(result.validStatus).toBe(200);
    expect(result.validBody).toEqual({ challenge: "ok" });
  });
});
