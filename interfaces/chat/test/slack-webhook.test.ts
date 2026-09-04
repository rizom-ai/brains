import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";

/** What the probe subprocess prints. Parsed, since it arrives as text. */
const probeResultSchema = z.looseObject({
  invalidBody: z.string(),
  invalidStatus: z.number(),
  validBody: z.unknown(),
  validStatus: z.number(),
});

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
    const result = probeResultSchema.parse(JSON.parse(stdout));
    expect(result.invalidStatus).toBe(401);
    expect(result.invalidBody).toBe("Invalid signature");
    expect(result.validStatus).toBe(200);
    expect(result.validBody).toEqual({ challenge: "ok" });
  });
});
